---
title: Codex 源码阅读（V）：安全模型
subtitle: 一个命令背后的沙箱、审批和执行策略
series: Codex Source Dive
part: 5
date: '2026-06-15'
overview: Codex 安全模型是一组分层执行边界：沙箱定义技术上能做什么，审批决定哪些操作要审查，执行策略给命令风险分类，操作系统后端负责强制执行。
tags:
 - codex-source-dive
 - security
categories:
 - agents
 - systems
lang: zh
translationKey: codex-security-model-blog-en
canonicalSlug: codex-security-model-blog-en
---

# Codex 源码阅读 (V)：安全模型

**一个命令背后的沙箱、审批和执行策略。**

TLDR：Codex 的安全模型不是一个确认框。命令会经过多道关卡：执行策略先分类，审批策略决定是否需要人类审查，沙箱模式定义它能触及哪些资源，平台相关后端负责强制执行边界。

前四篇里，我从几个角度看了 Codex 作为智能体运行时的形态：

- **智能体循环**，将模型输出转化为工具工作，再把结果反馈到下一轮；
- **目标**，作为持久、可恢复、预算感知的线程状态；
- **子智能体**，作为线程树而不是一次性并行模型调用；
- **工具运行时**，通过单个面向模型的功能系统公开 shell、`apply_patch`、MCP、app、plugin 和 skill。

这一篇讲包在这些能力外面的运行时边界。

coding agent 有用，是因为它能真的执行动作。它会读文件、改代码、跑测试、调用包管理器和工具，有时还会申请网络访问。难点在于，这些动作的风险并不相同。从模型角度看，repo 里的 `cargo test`、`rm -rf ~/.cache`、`curl https://api.example.com`、写 `.git/config`、调用有副作用的连接器，都是“工具调用”；但它们不应该拥有同样的运行时权限。

所以安全模型不能只是一句“小心点”。它必须是运行时设计。

这篇文章的论点是：

> Codex 安全不是一个是/否确认框，而是一组分层执行边界：沙箱决定技术上能做什么，审批决定谁来审查越界操作，执行策略决定命令是否可信，平台相关沙箱把这些决策变成操作系统层面的强制行为。

故事从一项普通的调试任务开始。

## 任务：“修复结账超时并运行失败的测试”

想象一下用户说：
```text
The checkout integration test started timing out after the adapter refactor.
Find the regression, patch it, and run the failing test.
```
从模型的角度看，接下来的步骤很普通：

1. 检查结账适配器；
2. 运行失败的测试；
3. 修补代码；
4. 再次运行测试；
5. 如果缺少依赖项或服务，请获取所需的内容；
6. 报告结果。

从运行时视角看，这些步骤的风险完全不同。

读取 `src/checkout/adapter.rs` 的风险较低。预计在 `workspace-write` 中编辑 `src/checkout/adapter.rs`。运行本地测试命令可能没问题。但是从网络获取包、在工作区之外写入、更改 `.git/hooks/pre-push`、读取 `.env` 或调用会产生副作用的 MCP 连接器会跨越不同的边界。

安全模型的目的，是把这些边界说清楚，同时不要把每个正常 repo 操作都变成一次协商。

![Codex 安全模型：一个命令跨越多个大门](/assets/img/blog/codex-security-model-blog-en/codex-security-runtime-map.png)

一个好的心智模型是将每一个具体行动视为要经过几个门：
```text
model proposes action
 ↓
shell / tool handler resolves request
 ↓
exec policy classifies the command
 ↓
approval policy decides whether review is required
 ↓
sandbox mode and permission profile define the technical boundary
 ↓
ToolOrchestrator runs, blocks, or retries under the selected boundary
 ↓
stdout / stderr / denial / approval result returns to the turn
```
这听起来很重，但也正因为有这套流程，Codex 才能顺畅完成日常任务，同时停留在有意义的风险边界内。

## 第一条分界线：沙箱回答“能不能”，审批回答“要不要”

官方文档划出了系统里最重要的一条线：**沙箱模式**和**审批策略**是不同控制。

沙箱模式是技术边界。它控制生成的命令实际可以触及的内容：文件系统、网络和平台级功能。审批策略是审查协议。它控制 Codex 在尝试跨越配置边界的操作之前何时必须询问审阅者。

这种划分很重要，因为两者解决了不同的故障模式。

如果沙箱很弱，模型错误可能会在任何人审查之前就变成真实系统突变。如果审批太弱，沙箱也许仍能阻止某些行为，但模型可能会在没有明确审查的情况下持续尝试越界操作。如果一切都需要审批，智能体就无法用于日常工作；如果什么都不需要审批，系统又会过度信任模型。

因此，实用的默认状态既不是“什么都别做”，也不是“放开手脚随便做”。它更接近于：
```text
work normally inside the active workspace;
keep network off by default;
protect sensitive roots;
ask before crossing the boundary;
fail closed when review cannot complete.
```
![沙箱和审批是故意分开的控制](/assets/img/blog/codex-security-model-blog-en/codex-sandbox-approval-layers.png)

实际使用时，本地测试命令例如：
```bash
cargo test -p checkout checkout_timeout -- --nocapture
```
通常可以在工作区沙箱内运行。尝试在工作区之外写入、访问互联网或禁用沙箱的命令是不同的请求。模型可能仍会要求它，但运行时将其视为升级。

这是第一个重要设计选择：**模型不拥有边界。**主机才拥有边界。

## shell 路径：一个命令变成一个结构化的执行请求

在第四部分中，我们将工具运行时视为面向模型的功能层。在安全模型中，shell 路径是抽象变得具体的地方。

模型可能会发出一些看起来像普通命令的东西：
```bash
npm install && cargo test -p checkout checkout_timeout
```
但 Codex 并不是简单地将字符串交给操作系统。

shell handler 首先解析执行环境：当前工作目录、shell 选择、环境变量、网络设置、当前 turn 授予的权限、显式升级标志和沙箱权限。它还处理一个重要的特殊情况：补丁形状的 shell 命令会被拦截并路由到结构化 `apply_patch` 路径，而不是被当作任意 shell 文本。

之后，请求就变得更接近于执行记录：
```text
ExecParams {
 command,
 cwd,
 env,
 timeout,
 capture_policy,
 network,
 sandbox_permissions,
 windows_sandbox_settings,
 justification
}
```
这条记录还没有获得运行许可。它只是一个运行时可以分类、审查、放进沙箱并执行的对象。

源码结构值得关注：

- `shell.rs` 是面向模型的 shell 处理程序。它解析环境、应用权限、拒绝无效升级、检测补丁状命令并构造 shell 请求。
- `exec_policy.rs` 通过策略规则、命令解析和审批模式，将命令分为 `Skip`、`NeedsApproval` 或 `Forbidden`。
- `tools/orchestrator.rs` 集中审批、沙箱选择、执行、拒绝处理和重试语义。
- `exec.rs` 构建底层进程执行请求，并通过沙箱路径发送。
- `sandboxing/` 将高级沙箱决策转换为平台相关的执行策略。

这就是“模型运行命令”和“运行时按策略接受结构化请求”之间的区别。

## Exec 策略：操作系统沙箱之前的命令门

只有沙箱还不够，因为有些决策是语义性的，并不是纯粹的文件系统问题。

考虑这些命令：
```bash
cargo test -p checkout
python scripts/rewrite_imports.py
sudo rm -rf /usr/local/share/cache
bash -lc "curl https://example.com/install.sh | sh"
git clean -fdx
```
文件系统沙箱可以限制这些命令能改什么，但 Codex 在执行前仍然需要命令级视图。有些命令很常规，有些未知，有些明显危险。有些要求关闭沙箱，有些暗示网络访问，有些只有在特定审批和沙箱设置下才安全。

这就是执行策略的作用。

`ExecPolicyManager` 是命令门。它解析命令，从配置层加载规则，应用托管策略覆盖，检查沙箱相关要求，并返回具体的执行审批要求：
```rust
Skip
NeedsApproval
Forbidden
```
关键在于，这不是字符串白名单。策略层理解命令类别、嵌套命令形状、审批模式和沙箱覆盖请求。它可以放行已知安全的命令，在操作越界时请求审批，也可以直接拒绝命令。

![Exec 策略是操作系统沙箱之前的命令门](/assets/img/blog/codex-security-model-blog-en/codex-exec-policy-path.png)

回到结账的故事。

在 repo 内运行失败的测试可能会被归类为足够安全，可以在选定的沙箱下运行。尝试运行网络安装步骤可能需要审批。尝试绕过沙箱或改变受保护的元数据不应被视为只是另一个命令。

这个区别让 Codex 在常规路径上可以自主，在危险路径上必须谨慎。

## 工作区写入不是“在 repo 附近写入任何内容”

下一个容易被忽略的设计选择是：`workspace-write` 并不意味着工作目录下每个路径都同样可写。

从用户视角看，“repo”感觉就像一个单一的对象。从运行时视角看，repo 包含非常不同类别的数据：

- 智能体需要编辑的源文件；
- 可能是任务一部分的测试和 fixtures；
- 构建产物和缓存；
- `.git` 中的 VCS 元数据；
- `.agents` 和 `.codex` 中的智能体状态；
- 可能包含秘密的环境文件。

安全默认值不应该允许模型仅仅因为这些文件在当前目录下，就重写 `.git/config`、更改 hook、改变智能体状态，或读取敏感文件。

这就是权限模型会把某些根目录视为受保护对象的原因。文档明确提到了工作区配置下对 `.git/` 和 `.codex/` 的保护，权限配置也可以表达拒绝读取的 glob，例如 `**/*.env`，并把文件系统规则和网络域名规则结合起来。智能体状态目录（例如 `.agents/`）在被工作流使用时也属于同一类：它们是控制平面状态，不是普通 app 代码。

![Workspace-write 不是“在 repo 附近写入任何内容”](/assets/img/blog/codex-security-model-blog-en/codex-protected-roots-network.png)

在 checkout 任务中，编辑这个文件是正常的：
```text
src/checkout/adapter.rs
```
编辑此文件不是同一种操作：
```text
.git/hooks/pre-push
```
读取这个文件可能会更糟：
```text
.env
```
模型可能认为这三个都只是路径。运行时一定不能。

这也是为什么 `danger-full-access` 应该被看成逃生口，而不是更高级的生产力设置。完全访问会移除这些边界。在一次性虚拟机或专用容器里，这可以接受；但在个人机器或带有密钥的 repo 里，它不是好默认值。

## 网络是一个独立的爆炸半径

网络值得单独成类，因为它会改变威胁模型。

如果没有网络，错误命令的影响主要局限在本地文件系统和进程内。有了网络，错误命令可以下载未经审查的代码、泄露秘密、调用外部服务、改变远程系统，或把本地读取和外部写入串起来。

因此，Codex 将网络视为一个单独的边界，而不是 shell 执行的副作用。

合法工作可能需要这样的命令：
```bash
npm install
```
但这与运行本地测试不同。它可以获取包、运行安装脚本以及与外部注册表通信。根据配置的策略，运行时可能会阻止它、询问审阅者或仅通过具有域级规则的网络智能体允许它。

网络策略层区分了几个容易混淆的概念：

- 网络是否已启用；
- 智能体是否正在执行决定；
- 允许或拒绝哪些域名；
- 本地和私人目的地是否被封锁；
- 被阻止的尝试是否可以转换为审批请求。

实现里有专门的 `network_policy_decision.rs` 路径，可以把被阻止的网络尝试转换成审阅上下文或明确的拒绝消息。这说明了一个设计目标：网络拒绝不应该看起来像随机进程失败，而应该成为模型可见、智能体可以推理的安全事件。

对这个 checkout 任务来说，好的智能体不应该在网络请求被拒绝后换个 shell 包装继续绕。它应该走本地路径：读 lockfile、检查缓存产物、运行更窄的测试；如果确实需要联网，再明确向用户请求对应的网络权限。

## ToolOrchestrator：审批、沙箱、执行和重试的编排

一旦 shell 请求被分类，Codex 仍然必须正确运行它。

这就是 `ToolOrchestrator` 的重要性。它把执行编排集中在一处：

1. 计算或接收审批要求；
2. 在需要时将请求路由给用户审批或 guardian 自动审核；
3. 选择第一次沙箱尝试；
4. 在选择的沙箱下运行命令；
5. 解释沙箱拒绝或网络决策；
6. 仅在策略允许的情况下重试；
7. 流式传输事件并记录结果。

这种集中化很容易被低估。如果没有它，每个工具 handler 都会长出自己的审批和沙箱逻辑，系统最终会自相矛盾。shell 命令可能按一种方式重试，MCP 工具按另一种方式重试，补丁路径又按第三种方式重试。

编排器为运行时提供了一个可以询问的地方：
```text
Did the action require approval?
Was approval granted?
Which sandbox should the first attempt use?
Was the denial caused by sandbox filesystem limits, network policy, or something else?
Is a retry allowed?
What event should the user and model see?
```
这是智能体行为可解释的基础设施。

## 自动审核：第二个审阅者，而不是更大的沙箱

审批不一定总是人工点击。Codex 还有一条自动审核路径，由单独的审核智能体评估越界请求。

这与赋予主智能体更多权力不同。

主智能体仍留在配置好的沙箱和审批策略内。当它要求越界时，只有在模式支持的情况下，审查才会路由给 guardian。guardian 会重建一份紧凑记录，审查拟议动作，并返回结构化决定。

这里重要的是 fail-closed：如果审阅者超时、执行失败、返回格式错误，或反复拒绝请求，系统不会默默放行。它会阻止、警告，必要时触发断路器。

![Auto-review 是一个审阅者，而不是一个更大的沙箱](/assets/img/blog/codex-security-model-blog-en/codex-guardian-auto-review.png)

在我们的故事中，假设模型说：
```bash
curl https://registry.npmjs.org/some-package
```
启用自动审核后，问题不再是“主模型能否说服自己这没问题？”问题是，独立的审核者在查看请求和上下文后是否判断升级是可接受的。

如果答案是否定的，拒绝就不是模型需要通过绕过策略来解决的难题，而是一条指令：选择更安全的路径，或询问用户。

这是一个微妙但关键的智能体设计点。安全边界必须是权威运行时事实，而不只是嵌在提示词里的建议。

## 平台沙箱：一份合约，不同操作系统

面向用户的模式故意简单：只读、工作区写入、完全访问、请求审批等等。在这种简单性的背后，操作系统的实现因平台而异。

在 macOS 上，Codex 可以使用 Seatbelt 沙箱。在 Linux 和 WSL2 上，当所需支持可用时，沙箱路径基于 bubblewrap 和 seccomp。在 Windows 上，运行时可以使用原生 Windows 沙箱路径，也可以使用 WSL2 支持的 Linux 沙箱行为，具体取决于环境。在云执行中，隔离由 OpenAI 管理的容器提供，设置阶段和智能体阶段的网络行为是分开的。

源布局反映了这一点：核心代码构建高级执行请求，而沙箱层将这些请求转换为特定于后端的命令和环境更改。 `ExecRequest` 携带公共字段 - 命令、cwd、环境、网络设置、沙箱选择、权限配置文件、文件系统策略和网络策略 - 因此本轮的其余部分可以统一处理输出和事件。

![不同的操作系统后端，一份执行合约](/assets/img/blog/codex-security-model-blog-en/codex-os-sandbox-backends.png)

这种抽象不只是为了代码简洁。它让用户即使身处不同环境，也能推断出同一种安全态势，哪怕底层执行机制不同。

不变量应该是：
```text
same high-level policy;
platform-specific enforcement;
same model-visible result shape.
```
这个不变量解释了为什么智能体能收到连贯的拒绝消息，而不是看到“子进程以奇怪方式失败”。

## 为什么 `danger-full-access` 存在

有一个设置会故意绕过大部分摩擦：`danger-full-access`。它通常和 `approval_policy = "never"`，或绕过审批与沙箱的 CLI 快捷方式一起使用。

它的存在是因为在某些工作流程中，外部环境已经是一次性的或隔离的。例如：

- 没有秘密的一次性容器；
- 临时虚拟机；
- 专为智能体执行而设计的类似 CI 的环境；
- 高度可信的本地实验，用户明确接受风险。

但它不应该被视为“高级模式”。它更像是在移除护栏，前提是 Codex 外面已经有另一层护栏。

![danger-full-access 是逃生口，而不是更好的默认值](/assets/img/blog/codex-security-model-blog-en/codex-danger-full-access.png)

危险通常不是智能体突然变得恶意，而是它会带着真实系统权限犯普通模型错误。

模型可能误解路径，过度扩展清理命令，遵循文件里的恶意指令，运行有意外副作用的包脚本，或通过网络请求泄露本地状态。沙箱和审批系统存在，是因为这些不是罕见攻击，而是自主工具的正常故障模式。

所以更尖锐的建议是：

> 仅当环境已经是一次性的、不存在秘密且爆炸半径受 Codex 外部控制时才使用完全访问权限。

对于日常源代码工作，`workspace-write` 加上按请求审批是更一致的默认设置。

## 隐含的质量标准：拒绝也要有用

只说“不”的安全边界很难被智能体使用。Codex 需要把拒绝变成智能体循环的一部分。

当命令被阻止时，模型应该得到可操作的信息：

- 命令需要网络；
- 目的地不在许可名单上；
- 该命令尝试在工作区之外写入；
- 路径受到保护；
- 审核者拒绝升级；
- 沙箱后端拒绝在沙箱之外运行，因为必须保留拒绝读取规则。

这就是运行时需要流式事件和结构化结果，而不能只返回退出码的原因。被拒绝的网络尝试不是失败的测试；被禁止的命令也不是 shell 语法错误；审阅者拒绝后，换个写法重试也不是解决方案。

对于我们的结账任务，这决定了智能体在阻塞后是否仍然有用。

不良的智能体行为是：
```text
Network blocked. Try curl through a different shell wrapper.
```
良好的智能体行为是：
```text
Network is blocked. I can continue by inspecting the lockfile and running the local test. If the missing dependency is required, I will ask for access to the package registry explicitly.
```
这就是运行时安全和智能体质量的结合点。运行时必须给出清晰边界；模型必须把这些边界纳入计划。

## 源图

这是我阅读 Codex 这一部分时用的地图：

| 位置 | 作用 |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `codex-rs/core/src/tools/handlers/shell.rs` |面向模型的 shell 处理程序：环境解析、权限检查、补丁拦截、shell 请求构建。 |
| `codex-rs/core/src/exec_policy.rs` |命令策略管理器：解析命令意图并将策略降低为 `Skip`、`NeedsApproval` 或 `Forbidden`。 |
| `codex-rs/core/src/tools/orchestrator.rs` |工具调用的集中审批、沙箱、执行和重试编排。 |
| `codex-rs/core/src/tools/sandboxing.rs` |共享审批原语和沙箱尝试工具使用的抽象。 |
| `codex-rs/core/src/exec.rs` |较低级别的流程执行路径和沙箱感知的请求构造。 |
| `codex-rs/core/src/sandboxing/` |核心拥有的沙箱适配器和执行管道。 |
| `codex-rs/core/src/network_policy_decision.rs` |将网络策略块转变为审批上下文或模型可见的拒绝消息。 |
| `codex-rs/core/src/guardian/` |审核智能体审批决策的自动审核/guardian 路径。 |

官方文档也很重要，因为这不只是实现细节，也是面向用户的合约：

- [沙箱](https://developers.openai.com/codex/concepts/sandboxing)
- [智能体审批和安全](https://developers.openai.com/codex/agent-approvals-security)
- [自动审阅](https://developers.openai.com/codex/concepts/sandboxing/auto-review)
- [权限](https://developers.openai.com/codex/permissions)

相关的源入口点是：

- [shell.rs](https://github.com/openai/codex/blob/main/codex-rs/core/src/tools/handlers/shell.rs)
- [exec_policy.rs](https://github.com/openai/codex/blob/main/codex-rs/core/src/exec_policy.rs)
- [orchestrator.rs](https://github.com/openai/codex/blob/main/codex-rs/core/src/tools/orchestrator.rs)
- [工具/sandboxing.rs](https://github.com/openai/codex/blob/main/codex-rs/core/src/tools/sandboxing.rs)
- [exec.rs](https://github.com/openai/codex/blob/main/codex-rs/core/src/exec.rs)
- [沙箱/mod.rs](https://github.com/openai/codex/blob/main/codex-rs/core/src/sandboxing/mod.rs)
- [network_policy_decision.rs](https://github.com/openai/codex/blob/main/codex-rs/core/src/network_policy_decision.rs)
- [guardian/](https://github.com/openai/codex/tree/main/codex-rs/core/src/guardian)

## 小结

最诱人但错误的描述是：

> Codex 在运行危险命令之前询问。

这个说法太窄。

更好的描述是：

> Codex 会把模型操作转换成结构化运行时请求，用执行策略分类，用沙箱和权限配置约束，把有风险的越界操作路由给审批或自动审核，并把拒绝作为事实报告回智能体循环。

这就是为什么这部分属于工具运行时之后。工具是模型的行为方式；安全模型是主机如何决定允许哪些操作成为现实。

更深一层的设计课并不只属于 Codex。任何严肃的 coding agent 最终都需要这种分离：
```text
model intent
 != command authority
 != filesystem authority
 != network authority
 != approval authority
```
当这些概念混成一团时，智能体 demo 可能更简单，但系统更难被信任。Codex 的设计更复杂，是因为问题本身更复杂：自主编码需要运行时边界，而不只是一个“会礼貌请求”的模型。
