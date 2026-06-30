---
title: Codex 源码阅读（IV）：工具运行时
subtitle: Codex 如何安全地让模型读取文件、运行命令、编辑代码和调用 MCP 工具
series: Codex Source Dive
part: 4
date: '2026-06-15'
overview: Codex 工具是由策略绑定运行时支持的模型可见模式，该运行时通过一个托管执行路径路由 shell 命令、补丁、MCP、skill、权限、沙箱、流和历史记录。
tags:
 - codex-source-dive
 - tool-runtime
categories:
 - agents
 - systems
lang: zh
translationKey: codex-tool-runtime-blog-en
canonicalSlug: codex-tool-runtime-blog-en
---

# Codex 源码阅读 (IV)：工具运行时

副标题：**Codex 如何安全地让模型读取文件、运行命令、编辑代码和调用 MCP 工具。**

TLDR：Codex 工具不仅仅是暴露给模型的函数。它们是一个面向模型的菜单，由策略绑定运行时支持，该运行时拥有执行、权限、沙箱、流事件、MCP 包装、skill 注入和历史反馈。

第一篇文章认为 Codex 的智能体循环不是玩具 `while tool` 演示。turn 是受管理的运行时边界。

第二篇文章认为目标不是提示词。目标是一个线程级状态机，具有持久性、延续门、记账和权限边界。

第三篇文章认为子智能体不是后台函数调用。它们是会话级树中的持久子线程。

第四篇文章是关于用户最直接感受的事情：
```text
Read the repo, run the failing test, patch the bug, and verify the result.
```
听起来很简单。这也是LLM不再是文本生成器并开始接触真实工作空间的时刻。

浅层解释是：Codex 给出了模型工具。

确实如此，但它隐藏了有趣的设计。

> Codex 的工具系统不是一个函数包。它是策略绑定执行运行时前面的面向模型的菜单。

模型看到模式。运行时拥有执行。在这两层之间有路由器、注册表、权限策略、沙箱、流事件、取消、并行规则、MCP 包装、skill 注入和历史反馈。

这种分离就是重点。模型应该能够请求 `cargo test`、`sed -n`、`apply_patch`、MCP 调用或 pluginskill。它不应该决定它真正接触的文件系统、是否允许升级、一个命令是否可以与另一个命令并行运行、如何调用 MCP 服务器或如何验证补丁。

从具体任务开始。
```text
The checkout service started failing after the billing SDK migration.
Find the failing test, patch the adapter, run the smallest useful test, and explain the evidence.
```
有能力的智能体通常需要采取四种行动：
```text
1. inspect files and history;
2. run commands;
3. edit code;
4. maybe call external tools: docs, issue trackers, app connectors, MCP servers, or skills.
```
如果这些动作作为分散的 `if model_called_shell { ... }` 分支来实现，系统将变得无法推理。 Shell 将有一个权限路径。 `apply_patch` 还有另一个。 MCP 还会有另一个。plugin 会有另一个。流式 UI 事件会偏离实际执行。取消会不一致。工具输出将很难反馈到下一个模型样本中。

Codex 为turn提供了一个通用的形状：
```text
model-visible specs
 ↓
ToolRouter
 ↓
ToolCallRuntime
 ↓
ToolRegistry
 ↓
CoreToolRuntime handlers
 ↓
stream events + tool outputs + conversation history
```
这就是这篇文章的主要思想。

![Codex 工具运行时](/assets/img/blog/codex-tool-runtime-blog-en/codex-tool-runtime-map.png)

## 1. 模型看到一个菜单； Codex 保留厨房

工具模式是一个契约，而不是工具本身。

这种区别很重要，因为面向模型的表面必须足够小、可读且稳定，以便模型可以选择。执行端必须更丰富：它需要运行时状态、环境 ID、沙箱策略、app 连接、取消令牌、遥测挂钩、流发射器和输出截断规则。

Codex 将这些职责与工具规划的两个输出分开：
```text
model_visible_specs: the schemas sent to the model
registry: the executors available to the runtime
```
模型只需要第一个输出。运行时需要第二个。

这意味着工具可以是：
```text
direct: visible to the model and dispatchable by the runtime
hidden: not shown to the model, but still dispatchable internally
deferred: not initially shown as a callable tool, but searchable/discoverable
hosted: model-provider hosted, not a local executor
```
这是第一个重要的设计选择：Codex 并不将“安装”与“可见”等同起来。

repo 会话可能具有 shell 工具、补丁工具、视图图像支持、请求权限工具、协作工具、MCP 工具、app/plugin 扩展工具、动态工具和托管模型工具。同时显示所有这些会产生嘈杂的提示和薄弱的决策面。隐藏太多会导致智能体能力不足。因此 Codex 构建了每一轮工具计划。

该计划是从源头组装而成，并按功能标志、环境模式、模型功能、代码模式设置、命名空间支持和工具公开进行过滤。

![规格规划器](/assets/img/blog/codex-tool-runtime-blog-en/codex-tool-spec-planner.png)

结果不仅仅是一个列表。它是一对：
```text
ToolRouter {
 model_visible_specs,
 registry,
}
```
路由器就是网桥。在模型方面，它公开模式。在运行时方面，它将已完成的模型项解析为执行器。

这让代码对边界保持诚实：
```text
The model chooses a tool call.
The runtime decides how that call is executed.
```
## 2. `run_turn` 是菜单激活的位置

turn循环是工具系统变得真实的地方。

在采样之前，Codex 会构建本轮的提示、对话历史记录、skill/plugin 注入、MCP/app 暴露以及工具路由器。这就是为什么工具属于 turn 运行时而不是全局静态列表。正确的工具界面取决于活动模型、当前环境、启用的功能、安装的 plugin、app 提及、skill 提及、会话源、沙箱配置文件和当前上下文预算。

对于我们的结账任务，最初的提示可能会使多个工具系列相关：
```text
shell / exec -> run tests, grep, inspect files
apply_patch -> edit the adapter safely
MCP / apps -> fetch external context if connected
skills/plugins -> load specialized guidance only if relevant
```
模型看到一个紧凑的菜单。它可能首先调用 shell 工具：
```text
cargo test -p checkout adapter_migration -- --nocapture
```
当响应流生成完整的工具调用项时，Codex 不会立即执行任意 JSON。它要求 `ToolRouter` 构建内部 `ToolCall`。

这种转换很重要，因为模型输出的形状并不相同。有些是普通的函数调用。有些是自定义/自由格式调用，例如 `apply_patch`。有些是工具搜索调用。路由器将这些模型项标准化为可以分派的运行时级调用。

然后 `ToolCallRuntime` 接管。

![工具调用生命周期](/assets/img/blog/codex-tool-runtime-blog-en/codex-tool-call-lifecycle.png)

该图中隐藏了一些有用的细节。

第一，运行时检查取消。用户中断不应成为半应用的工具调用。

第二，运行时检查所选工具是否支持并行调用。只读工具有时可以在共享路径下运行。写操作工具需要独占路径。这就是为什么运行时使用并行门而不是让每个工具自由运行。

第三，错误以模型可见的形式返回。工具故障不仅仅是 Rust 错误或异常；它成为模型可以在下一个样本中推理的结构化反馈。

四是成功产出载入史册。下一个模型样本不是从记忆或口头总结开始的。它将工具结果视为对话输入。

这就是智能体循环起作用的原因：工具执行不在对话之外。它被折叠回到对话中。

## 3. Shell 功能强大，所以 Shell 是受策略约束的

随便描述一下，Shell 是最诱人的工具。这也是最危险的。

在 coding agent 中，shell 的含义不仅仅是 `ls` 和 `grep`。它可以运行测试、启动服务器、改变文件、访问网络（如果允许）、调用包管理器以及生成长输出。 shell 工具不能只是传递到`std::process::Command`中的字符串。

Codex 将 shell 执行视为必须根据当前轮次环境和权限配置文件进行解析的请求。

路径如下所示：
```text
model emits command
 ↓
resolve primary environment
 ↓
apply granted turn permissions
 ↓
validate requested additional permissions
 ↓
reject invalid escalation under the current approval policy
 ↓
intercept apply_patch if the command is actually a patch
 ↓
otherwise create exec approval requirement
 ↓
run through ShellRuntime and ToolOrchestrator
 ↓
emit shell events and return formatted output
```
这是用于“运行命令”的大量机制，但每个部分的存在都有其原因。

模型可能要求命令需要比当前配置文件允许的更多文件系统或网络访问权限。 Codex 不应该让模型默默地自我升级。如果审批策略不允许显式升级，则工具路径会拒绝请求并返回模型可以采取行动的消息。

模型还可能运行一个需要时间的命令。运行时需要取消和事件流，以便 UI 可以显示进度并且用户可以中断。

模型可能会产生巨大的输出。必须根据主动截断策略对工具输出进行格式化和截断，以便下一个模型样本不会淹没在日志中。

关键是，shell 路径是 Codex 在“模型要求”和“系统允许”之间划清界限的地方。

这是正确的路线。

## 4. `apply_patch` 不仅仅是具有更好语法的 shell

编辑代码与打印输出不同。

如果模型编写了补丁，Codex 可以在应用之前对编辑进行推理。可以解析补丁。可以检查文件参考。可以验证文件系统。可以应用沙箱策略。 UI 可以传输补丁增量。结果可以与turn差异跟踪器相关联。

这就是为什么 `apply_patch` 拥有自己的路径。

在面向模型的世界中，`apply_patch` 看起来像一个自由形式的修补工具。在壳形世界中，模型也可能尝试运行 `apply_patch` 命令。 Codex 通过拦截补丁状的 shell 命令并将它们路由到补丁管道中来处理这个问题，而不是将它们视为普通的 shell 进程。

![Shell 和 apply_patch](/assets/img/blog/codex-tool-runtime-blog-en/codex-shell-apply-patch-path.png)

对于结账任务，顺序可能如下所示：
```text
1. The model runs the focused test and sees a failure in BillingAdapter.
2. It opens the adapter and notices the new SDK returns cents, not dollars.
3. It emits an apply_patch diff.
4. Codex parses and verifies the patch against the selected environment filesystem.
5. Codex applies the patch and emits patch begin/update/end events.
6. The model runs the focused test again.
7. The tool output returns as evidence for the final answer.
```
重要的部分是步骤 4。补丁不会仅仅因为它出现在模型响应中而受到信任。它根据实际工作空间和当前执行边界进行检查。

这也解释了为什么 `apply_patch` 不应在心理上与普通 shell 命令归为一类。 shell 命令要求环境执行某些操作。补丁要求 Codex 执行结构化代码编辑。这让 Codex 可以为代码更改附加更好的安全性、更好的 UI 事件和更好的差异跟踪。

## 5. MCP 工具通过相同的运行时网格进入

MCP 使刀具表面更宽。会话可以公开由外部服务器、app 连接器、特定于项目的集成或 plugin 提供的功能支持的工具。

天真的版本会很危险：
```text
for every MCP server:
 dump every tool schema into the prompt
 let the model call any of them directly
```
Codex 做了一些更有纪律的事情。

MCP 工具信息包装到 `McpHandler` 运行时中。该处理程序将工具元数据转换为命名空间的面向模型的规范，保留可搜索的元数据，处理前/后挂钩有效负载，并将执行委托给 MCP 工具调用路径。如果服务器或工具注释表明工具是只读或并行安全的，则可以将其纳入运行时的并行性决策中。否则，不应假定该工具可以安全地同时运行。

这为 MCP 工具提供了与本地工具相同的基本生命周期：
```text
schema shown or discovered
 ↓
model emits tool call
 ↓
router builds ToolCall
 ↓
runtime gates concurrency and cancellation
 ↓
registry dispatches to McpHandler
 ↓
MCP result becomes tool output and history
```
相同的边界正在做这项工作。 MCP 扩展了 Codex 的可达范围，但它并没有绕过执行系统。

这对于产品设计很重要。一旦使用外部工具，智能体就比以往任何时候都更需要一致性。用户不必学习一种 shell 心智模型、另一种补丁心智模型、另一种 app 连接器心智模型以及另一种 MCP 心智模型。运行时应该让它们感觉像是一个受控表面。

## 6. skill 是逐步披露指令

工具并不是唯一的稀缺资源。说明也很少。

skill 可以包含详细的指导：何时使用功能、要检查哪些文件、要遵守哪些约束、哪些工具序列是安全的、预期的输出格式。将每个完整的 skill 文档加载到每个 turn 中会浪费上下文并使模型混乱。

Codex 的 skill 路径是围绕渐进式披露构建的。

有用的心智模型是：
```text
First show enough metadata to choose.
Then load the full skill only when the task actually needs it.
```
代码表面反映了这种形状：可用 skill 可以从捆绑 skill、pluginskill 根、配置层和项目根构建；可以从用户输入中收集明确的 skill 提及；可以从命令中检测到隐式 skill 调用；默认 skill 元数据预算限制了初始 skill 元数据与提示的其余部分竞争的程度。

这创造了一种不同类型的工具边界。

shell 模式告诉模型它可以提供哪些参数。skill 存根告诉模型存在更深层次的指令包。完整的 skill 文件并不总是初始提示的一部分。仅当通过提及、上下文或运行时逻辑选择时，它才成为 turn 的一部分。

![MCP 和 skill 逐步披露](/assets/img/blog/codex-tool-runtime-blog-en/codex-mcp-skills-disclosure.png)

这很容易被低估。

如果不逐步披露，强大的智能体平台就会在其自己的工具目录下崩溃。每次新的集成都会使提示变得更长。每一项新 skill 都会让模型变得不那么专注。这个系统在理论上变得更加强大，但在实践中却变得越来越不可用。

通过逐步披露，Codex 可以说：
```text
The model knows this capability exists.
The runtime can load the details when needed.
The context budget remains available for the actual repo and task.
```
对于 coding agent 来说，这是正确的权衡。大多数 turn 并不需要所有 skill。但是，当turn确实需要turn时，模型需要一条可靠的路径来发现和加载它。

## 7. 流事件使运行时清晰可见

仅返回最终文本的工具运行时很难信任。

用户需要查看智能体在做什么：
```text
which command is running;
what output has appeared;
whether a patch is being applied;
which MCP call is in flight;
whether a tool was cancelled;
what changed in the workspace.
```
这就是工具系统与流事件绑定的原因。 Shell 执行会发出开始/输出/结束风格的事件。补丁执行会发出补丁开始/更新/结束样式事件。 MCP 调用可以发出自己的开始/结束事件。 Turn 循环处理流式模型事件、活动工具参数差异、工具输出和 Turn 项目，作为同一对话生命周期的一部分。

这样用户界面变得诚实。用户并不是在事后观看装饰性的文字记录。用户正在观察运行时状态的发生。

对于结账任务来说，这实际上很重要：
```text
- The user sees the focused test command.
- The user sees the failing assertion.
- The user sees the patch diff as it is applied.
- The user sees the verification command.
- The final answer can cite the actual commands and outputs observed in the turn.
```
故事从开始的地方结束：工具输出重回历史。

最终的答案不仅仅是自然语言的主张。它由工具事件支持并输出记录的运行时间。

## 8.真正的设计：能力统一，权限不统一

这是错误的抽象：
```text
Codex has a shell tool, a patch tool, MCP tools, and skills.
```
这是一个功能列表。它没有解释系统。

这是更好的抽象：
```text
Codex gives the model a controlled way to request actions.
The runtime owns execution, policy, visibility, cancellation, events, and history.
```
这就解释了为什么代码具有这样的形状。

`spec_plan.rs`不仅仅是注册工具。它正在决定哪些功能在本轮中应该是可见的、隐藏的、延迟的或托管的。

`ToolRouter` 不仅仅是从名称到函数的映射。它是面向模型的规范和运行时调度之间的边界。

`ToolCallRuntime` 不仅仅是一个异步执行器。它在分派之前应用并发和取消语义。

Shell 不仅仅是命令执行。它是环境解析加上权限加上审批策略加上沙箱加上流式事件。

`apply_patch`不仅仅是一个命令。它是一个结构化的编辑路径，具有解析、验证、沙箱检查、补丁事件和差异跟踪。

MCP 不是一个单独的逃生舱口。它被包装到处理程序和命名空间中，以便它可以流经相同的路由器和注册表。

skill 没有瞬发膨胀。它们是渐进式指令包，可以在上下文预算下发现和加载。

放在一起，这就是设计选择：

> Codex 统一了工具表面，没有扁平化权限。

模型只有一种询问方式。运行时保留了许多决定、约束、执行、流式传输和记录的方法。

这就是为什么工具运行时是本系列的第四部分。一旦你理解了 turn、目标和子智能体，工具就是所有这些抽象接触现实世界的层。

一转就可以调用工具。
目标可以在工具支持的过程中持续下去。
子智能体可以在子线程内运行自己的工具运行时。
每一条路径仍然必须回答同一个问题：
```text
What is the model allowed to ask for, and what is the runtime allowed to do?
```
答案就是 Codex 的工具系统。

## 源地标

这些是读完这篇文章后最有用的文件：

- [`codex-rs/core/src/session/turn.rs`](https://github.com/openai/codex/blob/main/codex-rs/core/src/session/turn.rs)：turn 循环、提示构建、skill/plugin 准备、流式响应处理和工具调用切换。
- [`codex-rs/core/src/tools/spec_plan.rs`](https://github.com/openai/codex/blob/main/codex-rs/core/src/tools/spec_plan.rs)：每 turn 刀具规划器，用于构建模型可见规格和运行时注册表。
- [`codex-rs/core/src/tools/router.rs`](https://github.com/openai/codex/blob/main/codex-rs/core/src/tools/router.rs)：模型输出项和运行时`ToolCall`之间的桥梁。
- [`codex-rs/core/src/tools/parallel.rs`](https://github.com/openai/codex/blob/main/codex-rs/core/src/tools/parallel.rs)：`ToolCallRuntime`、取消、并行门控和模型可见的故障输出。
- [`codex-rs/core/src/tools/registry.rs`](https://github.com/openai/codex/blob/main/codex-rs/core/src/tools/registry.rs)：执行者合约、钩子有效负载、差异消费者和工具暴露模型。
- [`codex-rs/core/src/tools/handlers/shell.rs`](https://github.com/openai/codex/blob/main/codex-rs/core/src/tools/handlers/shell.rs)：shell 执行、权限规范化、审批策略检查、沙箱切换和 `apply_patch` 拦截。
- [`codex-rs/core/src/tools/handlers/apply_patch.rs`](https://github.com/openai/codex/blob/main/codex-rs/core/src/tools/handlers/apply_patch.rs)：结构化补丁解析、验证、沙箱感知 app 和补丁流事件。
- [`codex-rs/core/src/tools/handlers/mcp.rs`](https://github.com/openai/codex/blob/main/codex-rs/core/src/tools/handlers/mcp.rs)：MCP 工具包装、命名空间规范、可搜索元数据、挂钩和运行时执行。
- [`codex-rs/core/src/skills.rs`](https://github.com/openai/codex/blob/main/codex-rs/core/src/skills.rs)：可用 skill、显式提及、隐式调用和元数据预算的 skill 加载桥梁。
