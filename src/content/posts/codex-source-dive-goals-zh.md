---
title: Codex 源码阅读（II）：Goal 是运行时状态，不是提示词
date: '2026-06-11'
overview: TLDR：Codex Goal 是线程级的长期任务状态机。它保存目标、状态、预算、使用量、恢复状态和延续门，而不是靠模型记住一段提示词。
description: 关于 Codex 目标的源代码阅读注释：线程所有权、GoalRuntimeEvent、会计、空闲延续、预算控制、权限分离和恢复。
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
translationKey: codex-source-dive-goals
canonicalSlug: codex-source-dive-goals
---

<!-- notion-sync: 37c4e07a-a023-8105-b6f1-fc49946cb014 parent=codex blogs url=链接 1 -->

副标题：**从一句话到可恢复的长期任务机器。**

第一篇文章把 turn 看成运行时边界，而不是一次模型调用。这篇沿用同一个视角，看一个更容易误读的对象：`Goal`。

这个名字有点危险。它听起来像 prompt 里的一个字段。第一次看到下面这种命令时：
```text
/goal Reduce checkout p95 latency below 120 ms, verified by the checkout benchmark, while keeping the correctness suite green.
```
很容易以为 Codex 只是把这句话塞进系统提示，然后要求模型记住它。这是浅读，也会让源码显得比实际更乱。

较强的读法是：

> Codex 的目标不是提示词，而是线程级的长期任务状态机。

提示词只回答一个问题：“模型下一次采样应该看到什么？”目标必须回答更多问题：
```text
Where is the objective stored?
When is it restored?
When may it continue without a new user message?
Who is allowed to change its status?
How are token and time usage counted?
What happens when budget or usage boundaries are reached?
```
从结账延迟的故事开始。

普通提示会说：“现在尝试优化 checkout 延迟。”目标更像一份合约：
```text
Objective: checkout p95 < 120 ms
Evidence: checkout benchmark
Constraint: correctness suite stays green
Status: active / paused / blocked / complete / budget-limited / usage-limited
Ledger: token usage, elapsed time, and budget state
Continuation: after this turn ends, decide whether another autonomous turn is allowed
Authority: user, runtime, and model have different rights to mutate state
```
所以不能把目标简化成“把目标写进提示词”。提示词只是下一次模型调用的输入之一。目标则是附着在线程上的持久运行时对象。

![目标运行时图](/assets/img/notion/codex-source-dive-goals-01.png)

## 1. 为什么 Goal 属于一个线程

从 app 服务器看，Goal 本来就是线程级的。`thread/goal/set`、`thread/goal/get`、`thread/goal/clear` 等接口不是作用在某条 assistant 消息或某个 turn 上，而是作用在当前线程上。目标更新和清除也会作为线程级事件流回客户端。

这个设计是必要的。长期目标需要的不只是目标文本，还需要持久状态：
```text
goal id
objective text
status
budget limits
token usage
elapsed time
last accounting baseline
resume state
possibly the latest blocker or completion signal
```
如果这些状态只存在于提示词里，一旦上下文变化、app 重启或下一轮开始，就可能丢失。如果它们是全局状态，又可能流入不相关的线程。把目标挂在线程上，是自然的边界：线程已经拥有项目对话、rollout、工具证据和用户意图。

所以第一个重要的句子是：

> 目标不属于某个 turn。它活得比 turn 更久，并把 turn 当作执行检查点。

这也解释了为什么代码必须监听运行时事件。光读 objective text，目标不知道已经做了多少工作。它需要观察 turn 开始、工具完成、turn 结束、空闲检查、外部变更、使用限制和线程恢复。

## 2. `GoalRuntimeEvent` 是轮次和长时间运行状态之间的桥梁

运行时事件名称起初看起来很分散：
```text
TurnStarted
ToolCompleted
TurnFinished
MaybeContinueIfIdle
UsageLimitReached
ExternalSet
ExternalClear
ThreadResumed
```
它们不是随机的。它们标记了长期运行的目标必须更新其账本或决定工作是否可以继续的点。

![目标运行时事件](/assets/img/notion/codex-source-dive-goals-02.png)

可以把目标运行时看成 turn 运行时旁边的小调度器。它不取代 `run_turn`，而是观察周围的边界。

- 在 `TurnStarted` 处，它将此执行绑定到当前活动的目标并记录使用基线。
- 在 `ToolCompleted`，它统计新增 token 和耗时，并在必要时注入预算提示。
- 在 `TurnFinished`，它完成记账，并决定是否需要考虑空闲延续。
- 在 `MaybeContinueIfIdle`，它运行延续门。
- 在 `UsageLimitReached`，它停止实质性工作，并把边界状态如实暴露出来。
- 在 `ExternalSet` 或 `ExternalClear`，它接受来自模型循环外部的线程级变更。
- 在 `ThreadResumed`，它在会话恢复后重建运行时状态。

事件调度器把一句话变成了可操作的机制。没有它，目标就只是提示词里的另一条指令。

## 3. `TurnStarted`：将活动 turn 绑定到活动 Goal

当常规 turn 开始时，Goal 运行时需要先问：

> 此 turn 是主动目标的一部分吗？

如果是，它至少记录两条基线。

第一个是令牌基线。稍后，当工具完成或turn完成时，运行时可以从当前使用情况中减去先前的基线，并仅考虑增量。如果没有基线，token使用将会被重复计算或错过。

第二个是挂钟基线。长期目标可能不仅要跟踪 token，也要跟踪实际经过的时间。可恢复的自治任务必须有账本；如果它说不清自己的成本，UI 最后展示的就是一个伪装成计划的黑箱。

流程是：
```text
turn/start
 -> RegularTask begins
 -> GoalRuntimeEvent::TurnStarted
 -> if the thread has an active Goal:
 capture active_goal_id
 capture token baseline
 capture wall-clock baseline
 -> run_turn enters the model/tool loop
```
目标不取代 turn。它是在 turn 外面包了一层长期状态。

## 4. `ToolCompleted`：工具输出既是证据也是成本

对 coding agent 来说，真正的进展发生在模型采样和工具之间。模型读文件、跑测试、应用补丁、跑基准、分析失败。每一步都会产生证据，也会消耗预算。

这就是为什么 `ToolCompleted` 很重要。工具完成后，Goal 运行时可以执行三件事：
```text
1. Add the new token and time delta to the Goal ledger.
2. Check whether tokenBudget or usage limits are near or past their boundary.
3. If needed, inject model-visible budget steering.
```
预算 steering 不是用户的 `turn/steer`。它是运行时写入的控制输入，内容大致是：
```text
You are at the budget boundary. Do not start new substantive work.
Summarize completed attempts, evidence, blockers, and the best next step.
```
关键点是：

> 预算用尽并不等于目标完成。

如果 checkout p95 从 180 毫秒降到 130 毫秒，但预算已经用完，目标仍未完成。它只是 budget-limited。这个区别保护了信任：运行时边界可以迫使任务停止，却不能证明目标已经实现。

## 5. `TurnFinished` 和 `MaybeContinueIfIdle`：继续必须通过门

这是《Goal》中最有趣的部分。

对普通 turn 来说，完成意味着助手做完并等待用户。对 active goal 来说，一个完成的 turn 可能只是检查点。运行时必须继续问：目标完成了吗？如果没有，再启动一个自动 turn 是否安全、是否有用？

这个问题被故意设了很多门槛。Goal 延续不是 `while true` 循环。

![目标延续门](/assets/img/notion/codex-source-dive-goals-03.png)

简化版本如下所示：
```text
on TurnFinished:
 account final usage
 maybe emit goal status update
 maybe schedule MaybeContinueIfIdle

on MaybeContinueIfIdle:
 if thread is not idle:
 stop
 if queued user input exists:
 stop and let the user win
 if goal is not active:
 stop
 if current mode is Plan mode:
 suppress continuation
 if token budget or usage limit is reached:
 stop substantive work
 if the previous continuation produced no counted autonomous activity:
 suppress the next automatic continuation
 else:
 start a continuation turn
```
该伪代码中隐藏了多种设计选择。

第一，延续发生在空闲边界。目标不应跳到活动 turn 的中间或覆盖新排队的用户输入。

第二，计划模式抑制了连续性。计划模式意味着“思考并提出，而不是执行”。如果允许目标在计划模式下继续运行，运行时会默默地将计划转换为自主执行。

第三，抑制空延续。如果模型只是总结、犹豫，或者说自己会继续却没有产生可计数的工具活动，再启动一次自动延续多半是在浪费预算。运行时不应该一直为自言自语买单。

第四，延续输入由运行时生成。它不是新的用户提示。运行时把 active goal 带回模型可见上下文，并根据当前证据请求下一步有用行动。

正确的心智模型是：
```text
Goal continuation = turn-level autonomy after explicit runtime gates
```
不是：
```text
Goal continuation = loop until the model says it is done
```
## 6. 权限边界：模型不应拥有整个 Goal 生命周期

如果模型可以随意重写自己的合约，长期任务就不安全。因此 Codex 做了权力分离。

![目标权限边界](/assets/img/notion/codex-source-dive-goals-04.png)

用户和 app 服务器拥有目标级生命周期：设置、获取、清除、暂停、恢复和外部限制。运行时拥有执行职责：记账、延续门、预算控制、使用限制处理和恢复。模型可以读取目标并报告进度状态，例如完成或阻塞，但不应该独占预算和生命周期策略。

这种分裂很重要，原因有二。

第一，它让目标保持诚实。模型可以说：“我认为基准已经证明目标达成。”但状态变更仍应基于证据和运行时状态。如果模型在没有验证的情况下、到了预算边界后说“我完成了”，运行时不应该把它当成真正完成。

第二，它使用户意图高于自主行为。用户可以清除或修改目标。排队的用户输入胜过继续。计划模式抑制执行。这些不是实施细节；它们是长期运行智能体的治理层。

## 7. 恢复：目标必须比记忆更持久

持久性是“目标只是提示词”这个解释彻底崩掉的地方。

如果 app 重启，只存在于提示词里的目标没有可靠状态。它可能丢失累计使用量、状态、之前的基线、阻塞原因和延续状态，也无法判断恢复是否安全。

线程级目标可以恢复。在 `ThreadResumed` 上，运行时可以从已存储的线程数据和 rollout 重建 active goal 状态。它能知道目标是否活动、是否暂停或受限、哪些使用量已经统计，以及是否应该允许继续。

这是内存和状态之间的区别：
```text
Memory: “The model may remember the objective.”
State: “The runtime can restore the objective and its ledger.”
```
对长期编码任务来说，状态胜过记忆。

## 8. 为什么这对于智能体设计很重要

目标机制不只是 Codex 的一个功能。对任何长期运行的智能体来说，它都是一堂设计课。

一个严肃的长期目标至少需要六个部分：

| 要求 | 为什么这很重要 |
| ---------------------- | ----------------------------------------------------------------------------------- |
|线程所有权 |目标属于项目对话，而不是单个样本。 |
|持久性|任务必须经得起上下文变化和进程重启。 |
|会计|自主工作需要一个可见的成本账本。 |
|延续门 |智能体不得永远运行或覆盖用户。 |
|权力分离|模型不应单方面重写其契约。 |
|诚实的边界状态|预算受限和使用量受限并不等于完成。 |

所以，“目标只是一个提示”是错误抽象。它藏起了真正困难的部分。难点不是告诉模型用户想要什么，而是构建一个运行时：它能继续推进目标，同时不撒谎、不死循环，也不偷走用户的控制权。

## 9. 源代码阅读清单

阅读目标代码时，请使用以下问题：
```text
Where is the Goal stored relative to the thread?
Which runtime events can mutate its state?
When is usage counted, and what baseline prevents double-counting?
What makes a continuation allowed or suppressed?
How does Plan mode change continuation behavior?
Who can mark complete, blocked, paused, cleared, budget-limited, or usage-limited?
What state is restored when a thread resumes?
```
一旦你提出这些问题，结构就变得不那么神秘了。目标是对一个简单产品承诺的运行时答案：“继续朝着这个目标努力，但保持会计、边界和用户控制完好无损。”

## 源图

读完这篇文章后需要阅读的有用文件和区域：

- `codex-rs/core/src/goals.rs` 用于目标运行时事件、记帐、延续和恢复行为。
- `codex-rs/app-server/README.md` 用于 `thread/goal/set`、`thread/goal/get`、`thread/goal/clear` 及相关事件。
- `codex-rs/core/src/tools/handlers/goal_spec.rs` 用于面向模型的目标工具和权限边界。
- 第一篇文章中的 turn 和任务模块，因为目标围绕 turn 生命周期而不是替换它。
