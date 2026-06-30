---
title: Codex 源码阅读（III）：子智能体是一棵线程树
date: '2026-06-11'
overview: TLDR：Codex 子智能体不是后台模型调用。它是一个持久的子线程，具有身份、继承的运行时策略、分叉上下文、邮箱通信、容量限制和恢复行为。
description: >-
 关于 Codex
 多智能体设计的源代码阅读注释：AgentControl、AgentRegistry、智能体路径、spawn_agent、fork_turns、邮箱、等待/中断语义和会话树恢复。
math: false
mermaid: true
toc: true
relatedPosts: false
tags:
 - codex-source-dive
 - agent-runtime
categories:
 - agents
 - systems
lang: zh
translationKey: codex-source-dive-subagents
canonicalSlug: codex-source-dive-subagents
---

<!-- notion-sync: 37c4e07a-a023-8150-b043-ffe641c10be9 parent=codex blogs url=链接 3 -->

副标题：**从委托到持久线程树。**

第一篇文章认为 Codex 的智能体循环不是一个简单的 `while tool` 演示。turn 是受管理的运行时边界。

第二篇文章认为目标不是提示词。它是一个线程级长期运行的状态机，具有持久性、延续门、记账和权限边界。

第三篇文章继续同样的故事。当一项任务对于一 turn 来说太大并且对于一个智能体来说太宽而无法线性推动时，会发生什么？

浅显的答案是：模型调用 `spawn_agent`，Codex 并行运行一些额外的模型调用。

这个答案忽略了设计。

> Codex 子智能体不是临时工具调用。它是会话级线程树中的持久子线程。

`spawn_agent`只是前门。真实的系统是由子线程、分叉历史记录、智能体路径、邮箱、状态订阅、中断、注册表限制以及可以稍后恢复的父子生成边缘构建的。多智能体支持不仅仅是并发。这是生命周期管理。

从具体任务开始。
```text
Migrate the checkout service from the old payment client to the new billing SDK.
Requirements:
1. identify API contract risks;
2. update the adapter and call sites;
3. add integration tests;
4. run the checkout benchmark and confirm p95 does not regress;
5. produce a final risk list with verification evidence.
```
这不是单一的工作。它自然地分为三种形状：
```text
Main path: understand the adapter and decide the patch direction.
Side paths: audit contracts, add tests, run the benchmark.
Integration: merge findings back into the main patch and choose trade-offs.
```
如果根智能体自己完成所有事情，它会很慢，并且它的上下文将充满合同详细信息、测试日志、基准测试输出和侧面调查笔记。如果它触发一次性模型调用，则副任务就没有持久的身份。您不能将它们作为同一工作树的一部分进行跟踪、中断、列出、恢复或存档。

Codex 选择第三种形状：
```text
/root
 /root/schema_audit
 /root/test_worker
 /root/perf_probe
```
根智能体保留主补丁。 `schema_audit` 比较新旧合约。 `test_worker` 在有界写入集中添加集成覆盖率。 `perf_probe` 运行基准测试并报告 p95 证据。根不必立即阻止所有这些；它可以继续工作，然后等待、发送消息、中断或在结果出现时进行集成。

这就是主要思想：

> 多智能体 Codex 并不是“同时思考多个模型”。它是一个根智能体，将工作组织为命名的可恢复线程树。

![子智能体线程树](/assets/img/notion/codex-source-dive-subagents-01.png)

## 1. 首先修复心智模型：子智能体不是后台函数

后台函数如下所示：
```text
result = model.call(task)
```
或者，使用并发：
```text
future = run_model_in_background(task)
```
Codex 子智能体更接近于此：
```text
child_thread = thread_manager.spawn_or_fork_thread(...)
agent_control.register(child_thread, metadata)
persist_edge(parent_thread, child_thread)
send_initial_input(child_thread, message)
```
这种差异是巨大的。

函数调用一直存在直到它返回。线程可以继续接收消息、运行更多轮次、等待、中断、列出、从转出中恢复以及与其父级一起存档或删除。它有一个地址和一个生命周期。

这就是为什么阅读多智能体代码的最佳切入点不是工具列表。它是`AgentControl`。

## 2. `AgentControl`：多智能体控制平面

`AgentControl` 是 Codex 多智能体工作的控制平面句柄。它附加到会话服务。更关键是，一个根线程或会话树在所有后代之间共享一个 `AgentControl`。

该设计决定了系统的形状。

如果每个子智能体都有自己的控制平面，则根节点将无法获得团队的稳定视图。一个子智能体很难生出自己的子智能体。状态更新、中断、邮箱和生成边缘将分散在不相关的状态中。共享一个 `AgentControl` 使注册表和通信通道的范围仅限于根树：对于系统中的每个线程来说不是全局的，对于单轮也不是本地的。

你可以把它想象成一个小团队调度程序：
```text
AgentControl
 - spawn an agent
 - send input and inter-agent messages
 - interrupt an agent
 - subscribe to agent status
 - list agents in the tree
 - record parent -> child thread-spawn edges
 - restore descendant agents when a session resumes
```
这不是工人。每个智能体线程仍然运行自己的常规轮次、工具运行时间和历史记录。 `AgentControl` 管理存在、身份、通信和生命周期。

这与之前的帖子有明确的联系：
```text
run_turn -> one model/tool/history loop
RegularTask -> one turn's outer lifecycle
Goal runtime -> long-running objective state
AgentControl -> multi-thread agent tree control plane
```
将这些层分开，多智能体代码将变得更容易阅读。

## 3. `AgentRegistry`：容量和身份是运行时特性

`AgentControl` 背后最重要的部分之一是 `AgentRegistry`。

这个名字听起来就像一个简单的列表。不仅如此。

第一，它增强了能力。会话树不能产生无限的子智能体。登记处会跟踪总数并在接纳新子智能体之前预留生成位置。如果达到最大值，则生成失败。那是一个安全边界。如果没有它，可以递归生成智能体的模型可能会将多智能体变成资源爆炸。

第二，它保持身份。注册表将智能体路径映射到元数据，例如：
```text
agent_id
agent_path
agent_nickname
agent_role
last_task_message
```
第三，它为智能体提供了可读的名称。用户和模型不必仅在不透明的线程 ID 中进行推理。角色可以提供候选昵称，运行时可以分配可读的名称，并在池重复时使用后缀。

这解决了两个核心问题：
```text
Capacity: how many agents may exist in this session tree?
Addressability: how does one agent refer to another agent reliably?
```
如果没有能力，多智能体系统就会失控。如果没有可寻址性，沟通就会退化为“在文本的某个地方，一名工作人员说了些什么”。相反，Codex 将智能体建模为线程树中的实体。

## 4. `task_name` 和 `AgentPath`：子智能体需要一个路径，而不仅仅是一个 id

多智能体 `spawn_agent` 接口需要 `task_name` 和 `message`。这个细节并不是装饰性的。

`task_name` 成为规范智能体路径的一部分。如果当前智能体是：
```text
/root
```
它产生：
```json
{
 "task_name": "schema_audit",
 "message": "Compare the old payment client contract with the new billing SDK."
}
```
新子智能体可以被称为：
```text
/root/schema_audit
```
如果 `/root/migration_worker` 生成 `validator`，则子级将变为：
```text
/root/migration_worker/validator
```
这就是树的来源。

路径需要规则。它们必须从 `/root` 开始；段必须稳定；保留名称和不明确的路径片段必须被拒绝。这不是迂腐的验证。这是通信语义。智能体需要运行时和模型都能一致解析的路径。

后台作业可以在不透明的 id 下生存。协作智能体需要一个可在消息、等待、后续和中断中使用的名称。

## 5. `spawn_agent`：从工具调用到线程物化

现在返回到入口点。 `spawn_agent` 处理程序要做的不仅仅是将任务字符串传递给另一个模型。

一个有用的骨架是：
```text
parse arguments:
 message, task_name, agent_type, model, reasoning_effort, service_tier, fork_turns

parse fork mode:
 none / all / last N turns

build child configuration from the parent turn:
 cwd, sandbox, approval policy, permission profile, shell environment policy

apply role and model overrides:
 role config, nickname, instructions, reasoning, service tier

construct subagent source:
 parent_thread_id, depth, agent_path, agent_role

call AgentControl.spawn_agent_with_metadata
persist parent-child edge
send initial input to the child thread
```
真正的工作是设定边界。

子智能体继承了什么背景？即`fork_turns`。

它发挥什么作用？即 `agent_type` 和角色配置。

它使用哪种模型和推理设置？默认值可以从父级继承，但某些分支可以覆盖。

它在哪里执行？它继承了当前的运行时世界：工作目录、沙箱、审批策略、权限配置文件、选定的环境和 shell 策略。

后期将如何解决？它接收路径、昵称、角色、父 ID 和深度。

以后还能恢复吗？父子生成边缘被保留。

这些想法都不适合“并行调用模型”。

![生成智能体链](/assets/img/notion/codex-source-dive-subagents-02.png)

## 6.继承不是懒惰；它保留了执行世界

子智能体从父智能体继承关键运行时状态，包括 shell 快照和执行策略。

那不方便。这是正确性。

假设根智能体正在具有特定 cwd、工作区写入沙箱、审批策略和 shell 环境策略的 repo 内工作。如果子进程在不同的目录中默默启动或使用不同的执行策略，则其测试和文件读取可能无法与根目录的工作相媲美。子智能体会报告来自不同世界的事实。

继承使团队保持相同的运营现实。子进程仍然可以拥有自己的历史记录和角色，但其工具调用在兼容的运行时假设下运行。

这对于编码任务尤其重要，其中“我运行了基准测试”只有在与正在审查的补丁相同的 repo 状态和策略信封中运行时才有意义。

## 7. `fork_turns`：上下文是一种设计选择

分叉不仅仅是复制文本。它是上下文边界。

子级任务需要足够的上下文才能独立工作，但又不至于让每个支线任务都继承整个父级部署。如果基准工作人员收到几页合同审计记录，则可能会浪费上下文。如果合同审核员没有收到迁移限制，则可能会错过重点。

![分叉上下文修剪](/assets/img/notion/codex-source-dive-subagents-03.png)

分叉模式编码了权衡：
```text
fork: none -> child starts from task message and runtime policy
fork: last N -> child receives a bounded slice of recent parent context
fork: all -> child receives the relevant rollout when full context is necessary
```
重要的一点是，子智能体的历史在分叉后就变成了自己的历史。它将记录自己的工具调用、证据、消息和错误。家长可以稍后阅读或等待，但子智能体不仅仅是家长提示中的一个段落。

好的子智能体设计主要是上下文设计。你想要一个足够狭窄的支线任务来完成，但又足够连接以发挥作用。

## 8.通信：发送、触发、等待、中断不一样

一旦子智能体还活着，父母就需要多种互动。

![智能体通信](/assets/img/notion/codex-source-dive-subagents-04.png)

`send_message` 仅适用于队列。它将一条消息放入目标智能体的邮箱中，但它本身不应该强制进行新的转向。当子智能体已经在工作或消息仅供参考时，这很有用。

`followup_task` 是不同的。它设置触发语义，因此可以唤醒空闲的子进程来处理新任务。这种区别可以防止意外的自治。并非每条消息都应该创造更多工作。

`wait_agent` 也与普通函数返回不同。父进程等待来自运行时实体的邮箱或状态更新，这些实体可能仍在工作、阻塞、中断或完成。

`interrupt_agent` 取消目标智能体的主动 turn。它是尊重生命周期边界的多智能体版本：子级不是字符串结果；它正在运行的工作可能需要彻底停止。

一个有用的总结：

|运营|意义|
| ----------------- | ------------------------------------------------------------------ |
| `send_message` |将信息放入目标邮箱；不一定能唤醒它。 |
| `followup_task` |使用触发语义发送工作；如果空闲，可以开始另一轮。 |
| `wait_agent` |等待子线程的邮箱/状态更新。 |
| `interrupt_agent` |取消子智能体的主动 turn。 |
| `list_agents` |检查当前已知智能体树。 |该表是通信和函数调用之间的区别。函数调用返回。智能体会随着时间的推移进行沟通。

## 9.完成观察者：结果需要返回到父母的世界

仅当其结果可以重新进入父级的推理循环时，侧智能体才有用。

这就是完成监视和邮箱更新的工作。当 `schema_audit` 完成时，根应该收到一个可以采取行动的结构化更新：合同风险、证据、不确定点，也许还有建议的后续行动。当 `perf_probe` 完成时，根应该收到基准输出和解释。结果不只是打印在某个地方；而是打印在某个地方。它成为父母可以观察和吸收的信息。

这就是树模型很重要的原因。家长知道哪个子智能体产生了哪个结果，它扮演了什么角色，以及如何要求澄清。如果 `perf_probe` 报告 p95 回归，root 可以发送有针对性的后续内容，而不是通过对话文本启动新的全局搜索。

## 10. 恢复：树必须重新长出来

持久性是对某事物是否真正是子智能体还是只是后台任务的最终测试。

如果 app 在结账迁移正在进行时重新启动，根线程不应忘记 `schema_audit`、`test_worker` 和 `perf_probe` 的存在。运行时需要从持久的线程生成边缘恢复后代智能体并重建注册表视图。

![子智能体简历树](/assets/img/notion/codex-source-dive-subagents-05.png)

这带来了几个生命周期的好处：
```text
list_agents still shows the team
wait_agent can still refer to a restored child
archive/delete can apply to the whole descendant tree
status can be reconstructed from thread state
messages can continue to use stable agent paths
```
如果子智能体只是暂时的未来，复苏将是猜测。有了线程树，恢复就变成了图操作。

## 11. 这个设计对 Codex 有何说明

Codex 的多智能体设计是固执己见的。它将协作视为运行时结构，而不仅仅是模型提示。

这种结构是有成本的。它需要注册表、路径、分叉模式、邮箱、生成边缘、状态事件和恢复逻辑。但它也提供了一次性并行调用所不具备的系统属性：

|物业 |为什么这很重要 |
| ------------------- | ------------------------------------------------------------------------------------------ |
|身份|可以对子智能体进行称呼、列出、等待和打断。 |
|上下文边界|支线任务可以使用精选视图而不是整个父卷展栏。 |
|运行时继承 |子智能体们在一个兼容的执行世界中奔跑。 |
|通讯 |智能体可以随着时间的推移交换消息，而不仅仅是返回字符串。 |
|容量控制 |递归生成有一个硬性限制。 |
|坚持|可以使用会话树恢复后代。 |

主要的教训是尖锐的：

> 多智能体支持主要不是关于并行性。它是将授权转变为可恢复的、有限制的、可解决的工作。

这就是为什么 `spawn_agent` 不应被理解为“调用另一个模型”。它应该被理解为“在当前根会话树下具体化一个子线程”。

## 12. 源代码阅读清单

在阅读 Codex 的子智能体代码时，请使用以下问题：
```text
Which AgentControl instance owns this session tree?
How does AgentRegistry enforce capacity?
What agent path will this child receive?
What role, nickname, model, and reasoning settings are applied?
What parent history is forked, and what is intentionally left out?
Which runtime policy is inherited from the parent?
How does the initial message enter the child thread?
How does the parent receive completion or mailbox updates?
What happens if the child is interrupted?
How is the descendant tree restored on resume?
```
如果您能够回答这些问题，多智能体系统就不再看起来像一袋工具。它成为一个用于协作的树形运行时。

## 源图

读完这篇文章后需要阅读的有用文件和区域：

- `codex-rs/core/src/agent/control.rs` 用于 `AgentControl` 和共享控制平面模型。
- `codex-rs/core/src/agent/registry.rs` 用于容量限制、身份、元数据和昵称处理。
- `codex-rs/core/src/tools/handlers/multi_agents_v2/spawn.rs` 用于 `spawn_agent` 和子线程具体化。
- `codex-rs/core/src/tools/handlers/multi_agents_v2/message_tool.rs` 用于消息传递、后续、等待和中断语义。
- 用于归档、删除、恢复和后代恢复的线程持久性和 app 服务器生命周期代码。
