---
title: Codex 源码阅读（IV）：工具运行时
subtitle: Codex 如何安全地让模型读取文件、运行命令、编辑代码和调用 MCP 工具
series: Codex Source Dive
part: 4
date: '2026-06-15'
overview: Codex 工具不是孤立函数，而是由策略绑定运行时支撑的模型可见接口。shell 命令、补丁、MCP、skill、权限、沙箱、流事件和历史记录都走同一条托管执行路径。
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

TLDR：Codex 工具不是简单暴露给模型的函数。它们是一份面向模型的菜单，背后由策略绑定的运行时负责执行、权限、沙箱、流事件、MCP 包装、skill 注入和历史反馈。

第一篇文章说，Codex 的智能体循环不是玩具版 `while tool` 演示。turn 是受管理的运行时边界。

第二篇文章说，目标不是提示词，而是线程级状态机，有持久性、延续门、记账和权限边界。

第三篇文章说，子智能体不是后台函数调用，而是会话级树中的持久子线程。

第四篇文章是关于用户最直接感受的事情：
```text
Read the repo, run the failing test, patch the bug, and verify the result.
```
听起来很简单。这也是 LLM 不再只是文本生成器、开始接触真实工作空间的时刻。

浅层解释是：Codex 给出了模型工具。

确实如此，但它隐藏了有趣的设计。

> Codex 的工具系统不是一个函数包，而是策略绑定执行运行时前面的一份模型菜单。

模型看到 schema。运行时负责执行。两层之间隔着路由器、注册表、权限策略、沙箱、流事件、取消、并行规则、MCP 包装、skill 注入和历史反馈。

这种分离就是重点。模型应该能请求 `cargo test`、`sed -n`、`apply_patch`、MCP 调用或 plugin/skill。它不应该决定自己真正接触哪些文件系统、是否允许升级、某个命令能不能和另一个命令并行、如何调用 MCP 服务器，或如何验证补丁。

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
如果这些动作被实现成一堆分散的 `if model_called_shell { ... }` 分支，系统会变得很难推理。Shell 有一条权限路径，`apply_patch` 有另一条，MCP 和 plugin 又各有一条。流式 UI 事件会和真实执行脱节，取消语义也会不一致，工具输出很难反馈到下一次模型采样里。

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

## 1. 模型看到菜单；Codex 保留执行权

工具 schema 是契约，不是工具本身。

这个区别很重要。面向模型的表面必须足够小、可读、稳定，模型才好选择。执行端则复杂得多：它需要运行时状态、环境 ID、沙箱策略、app 连接、取消令牌、遥测钩子、流事件发射器和输出截断规则。

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
这是第一个重要设计选择：Codex 不把“已安装”和“模型可见”画等号。

repo 会话可能同时拥有 shell 工具、补丁工具、图片查看、权限请求、协作工具、MCP 工具、app/plugin 扩展、动态工具和托管模型工具。全部展示出来会让提示词很吵，决策面也会变薄。隐藏太多又会削弱智能体能力。因此 Codex 会为每一轮构建工具计划。

这个计划从多个来源组装，再按功能标志、环境模式、模型能力、代码模式设置、命名空间支持和工具公开策略过滤。

![工具规范规划器](/assets/img/blog/codex-tool-runtime-blog-en/codex-tool-spec-planner.png)

结果不是一个简单列表，而是一对：
```text
ToolRouter {
 model_visible_specs,
 registry,
}
```
路由器就是桥。在模型侧，它公开 schema；在运行时侧，它把模型产出的完整工具项解析成执行器调用。

这让代码对边界保持诚实：
```text
The model chooses a tool call.
The runtime decides how that call is executed.
```
## 2. `run_turn` 是菜单激活的位置

turn 循环是工具系统真正落地的地方。

在采样之前，Codex 会构建本轮提示、对话历史、skill/plugin 注入、MCP/app 暴露和工具路由器。所以工具属于 turn 运行时，而不是全局静态列表。正确的工具界面取决于活动模型、当前环境、启用的功能、安装的 plugin、app 提及、skill 提及、会话来源、沙箱配置和当前上下文预算。

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

这个转换很重要，因为模型输出的形状并不一致。有些是普通函数调用，有些是自定义/自由格式调用，例如 `apply_patch`，还有些是工具搜索调用。路由器把这些模型项标准化成可以分派的运行时级调用。

然后 `ToolCallRuntime` 接管。

![工具调用生命周期](/assets/img/blog/codex-tool-runtime-blog-en/codex-tool-call-lifecycle.png)

该图中隐藏了一些有用的细节。

第一，运行时检查取消。用户中断不应成为半应用的工具调用。

第二，运行时检查所选工具是否支持并行调用。只读工具有时可以在共享路径下运行。写操作工具需要独占路径。这就是为什么运行时使用并行门而不是让每个工具自由运行。

第三，错误会以模型可见的形式返回。工具故障不只是 Rust 错误或异常；它会变成模型下一次采样可以推理的结构化反馈。

第四，成功产出会进入历史。下一次模型采样不是从记忆或口头总结开始，而是把工具结果当作对话输入。

这就是智能体循环起作用的原因：工具执行不在对话之外。它被折叠回到对话中。

## 3. Shell 功能强大，所以 Shell 是受策略约束的

随便描述一下，Shell 是最诱人的工具。这也是最危险的。

在 coding agent 中，shell 不只是 `ls` 和 `grep`。它可以运行测试、启动服务器、改文件、访问网络（如果允许）、调用包管理器，也可能生成很长的输出。shell 工具不能只是传给 `std::process::Command` 的一段字符串。

Codex 把 shell 执行看成一种请求，必须根据当前 turn 环境和权限配置来解析。

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

模型可能要求命令获得比当前配置更多的文件系统或网络访问权限。Codex 不应该让模型悄悄自我升级。如果审批策略不允许显式升级，工具路径会拒绝请求，并返回模型可以处理的消息。

模型还可能运行一个需要时间的命令。运行时需要取消和事件流，以便 UI 可以显示进度并且用户可以中断。

模型可能触发巨大的输出。工具输出必须按主动截断策略格式化和截断，避免下一次模型采样被日志淹没。

关键在于，shell 路径是 Codex 在“模型要求”和“系统允许”之间划线的地方。

这条线必须清楚。

## 4. `apply_patch` 不是语法更好的 shell

编辑代码与打印输出不同。

如果模型写出补丁，Codex 可以在应用之前检查这次编辑：解析补丁、检查文件引用、验证文件系统、应用沙箱策略。UI 可以流式展示补丁增量，结果也能和 turn 差异跟踪器关联起来。

这就是为什么 `apply_patch` 拥有自己的路径。

在面向模型的世界里，`apply_patch` 看起来像一个自由形式的补丁工具。在 shell 世界里，模型也可能尝试运行 `apply_patch` 命令。Codex 会拦截补丁形状的 shell 命令，把它们路由到补丁管道，而不是当作普通 shell 进程执行。

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
重要的是第 4 步。补丁不会因为出现在模型响应里就被信任。它会根据真实工作空间和当前执行边界接受检查。

这也解释了为什么不该把 `apply_patch` 和普通 shell 命令归为一类。shell 命令要求环境执行某个动作；补丁要求 Codex 执行结构化代码编辑。这样 Codex 才能给代码更改附加更好的安全检查、UI 事件和差异跟踪。

## 5. MCP 工具通过相同的运行时网格进入

MCP 会拓宽工具表面。会话可以公开由外部服务器、app 连接器、项目集成或 plugin 提供的工具。

天真的版本会很危险：
```text
for every MCP server:
 dump every tool schema into the prompt
 let the model call any of them directly
```
Codex 做了一些更有纪律的事情。

MCP 工具信息会被包装进 `McpHandler` 运行时。这个 handler 把工具元数据转换成带命名空间的模型可见规范，保留可搜索元数据，处理前后钩子的 payload，并把执行委托给 MCP 工具调用路径。如果服务器或工具注释表明它是只读或并行安全的，运行时可以把这一点纳入并行决策；否则就不能假定它适合并发运行。

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
仍然是同一组边界在起作用。MCP 扩展了 Codex 的可达范围，但没有绕过执行系统。

这对产品设计很重要。一旦接入外部工具，智能体比以往更需要一致性。用户不应该被迫分别学习 shell、补丁、app 连接器和 MCP 的四套心智模型。运行时应该把它们收束成一个受控表面。

## 6. skill 是渐进式披露的指令包

工具不是唯一的稀缺资源。指令上下文同样稀缺。

skill 可以包含详细指导：什么时候使用、要检查哪些文件、要遵守哪些约束、哪些工具序列安全、输出格式是什么。把每个完整 skill 文档都加载进每个 turn，只会浪费上下文并干扰模型。

Codex 的 skill 路径围绕渐进式披露构建。

有用的心智模型是：
```text
First show enough metadata to choose.
Then load the full skill only when the task actually needs it.
```
代码表面也反映了这种形状：可用 skill 可以来自捆绑 skill、plugin/skill 根目录、配置层和项目根；用户输入里的显式 skill 提及会被收集；命令里也可能检测到隐式 skill 调用；默认 skill 元数据预算会限制初始 skill 元数据与其他 prompt 内容争抢空间。

这创造了一种不同类型的工具边界。

shell schema 告诉模型可以提供哪些参数。skill stub 告诉模型存在更深的指令包。完整 skill 文件不总是初始提示的一部分；只有被提及、被上下文触发，或被运行时逻辑选中时，它才进入当前 turn。

![MCP 和 skill 的渐进式披露](/assets/img/blog/codex-tool-runtime-blog-en/codex-mcp-skills-disclosure.png)

这很容易被低估。

如果没有渐进式披露，强大的智能体平台会被自己的工具目录压垮。每增加一个集成，提示词都会变长；每增加一个 skill，模型都会更分心。系统在理论上更强，在实践中却更难用。

通过逐步披露，Codex 可以说：
```text
The model knows this capability exists.
The runtime can load the details when needed.
The context budget remains available for the actual repo and task.
```
对 coding agent 来说，这是合理权衡。大多数 turn 不需要所有 skill；但当某个 turn 确实需要某个 skill 时，模型需要一条可靠路径来发现并加载它。

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
这就是工具系统要和流事件绑定的原因。Shell 执行会发出开始、输出、结束类事件。补丁执行会发出补丁开始、更新、结束类事件。MCP 调用也可以发出自己的开始和结束事件。turn 循环把流式模型事件、活动工具参数 diff、工具输出和 turn item 放在同一个对话生命周期里处理。

这样 UI 才诚实。用户不是事后看一份装饰性的文字记录，而是在观察运行时状态如何发生。

对于结账任务来说，这实际上很重要：
```text
- The user sees the focused test command.
- The user sees the failing assertion.
- The user sees the patch diff as it is applied.
- The user sees the verification command.
- The final answer can cite the actual commands and outputs observed in the turn.
```
故事从开始的地方结束：工具输出重回历史。

最终答案也不只是自然语言主张。它有工具事件支撑，也能引用本轮记录下来的运行事实。

## 8. 真正的设计：能力统一，权限不拉平

这是错误的抽象：
```text
Codex has a shell tool, a patch tool, MCP tools, and skills.
```
这只是功能列表，解释不了系统。

这是更好的抽象：
```text
Codex gives the model a controlled way to request actions.
The runtime owns execution, policy, visibility, cancellation, events, and history.
```
这就解释了为什么代码具有这样的形状。

`spec_plan.rs` 不只是注册工具。它在决定哪些能力本轮应该可见、隐藏、延迟披露或由模型提供方托管。

`ToolRouter` 不只是从名称到函数的映射。它是模型可见规范和运行时调度之间的边界。

`ToolCallRuntime` 不只是异步执行器。它会在分派前应用并发和取消语义。

Shell 不只是命令执行。它还包括环境解析、权限、审批策略、沙箱和流式事件。

`apply_patch` 不只是一个命令。它是一条结构化编辑路径，包含解析、验证、沙箱检查、补丁事件和差异跟踪。

MCP 不是单独的逃生口。它被包装进 handler 和命名空间，因此可以流经同一套路由器和注册表。

skill 不会一次性膨胀进上下文。它们是渐进式指令包，可以在上下文预算内被发现和加载。

放在一起，这就是设计选择：

> Codex 统一了工具表面，没有扁平化权限。

模型只有一种请求动作的方式。运行时则保留多种决策、约束、执行、流式传输和记录方式。

这就是为什么工具运行时是本系列的第四部分。一旦你理解了 turn、目标和子智能体，工具就是所有这些抽象接触现实世界的层。

一个 turn 可以调用工具。
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
- [`codex-rs/core/src/tools/spec_plan.rs`](https://github.com/openai/codex/blob/main/codex-rs/core/src/tools/spec_plan.rs)：每个 turn 的工具规划器，用于构建模型可见规范和运行时注册表。
- [`codex-rs/core/src/tools/router.rs`](https://github.com/openai/codex/blob/main/codex-rs/core/src/tools/router.rs)：模型输出项和运行时`ToolCall`之间的桥梁。
- [`codex-rs/core/src/tools/parallel.rs`](https://github.com/openai/codex/blob/main/codex-rs/core/src/tools/parallel.rs)：`ToolCallRuntime`、取消、并行门控和模型可见的故障输出。
- [`codex-rs/core/src/tools/registry.rs`](https://github.com/openai/codex/blob/main/codex-rs/core/src/tools/registry.rs)：执行者合约、钩子有效负载、差异消费者和工具暴露模型。
- [`codex-rs/core/src/tools/handlers/shell.rs`](https://github.com/openai/codex/blob/main/codex-rs/core/src/tools/handlers/shell.rs)：shell 执行、权限规范化、审批策略检查、沙箱切换和 `apply_patch` 拦截。
- [`codex-rs/core/src/tools/handlers/apply_patch.rs`](https://github.com/openai/codex/blob/main/codex-rs/core/src/tools/handlers/apply_patch.rs)：结构化补丁解析、验证、沙箱感知应用和补丁流事件。
- [`codex-rs/core/src/tools/handlers/mcp.rs`](https://github.com/openai/codex/blob/main/codex-rs/core/src/tools/handlers/mcp.rs)：MCP 工具包装、命名空间规范、可搜索元数据、挂钩和运行时执行。
- [`codex-rs/core/src/skills.rs`](https://github.com/openai/codex/blob/main/codex-rs/core/src/skills.rs)：可用 skill、显式提及、隐式调用和元数据预算的 skill 加载桥梁。
