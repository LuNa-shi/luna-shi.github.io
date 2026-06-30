---
title: Codex 源码阅读（II）：Goal 是运行时状态，不是提示词
date: '2026-06-11'
overview: TLDR：Codex Goal 是一个线程级长时间运行的任务状态机。它存储目标、状态、预算、使用情况、恢复状态和继续门，而不是依赖于一个记住的提示。
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

副标题：**从一个句子到一个可恢复的长时间运行的任务机器。**

第一篇文章将 turn 视为运行时边界而不是单个模型调用。这篇文章采用相同的镜头并将其应用于更具欺骗性的物体：`Goal`。

这个名字很危险。听起来像是提示中的一个字段。当人们第一次看到如下命令时：
```text
/goal Reduce checkout p95 latency below 120 ms, verified by the checkout benchmark, while keeping the correctness suite green.
```
自然的假设是 Codex 只是将该句子插入系统提示中并要求模型记住它。这就是浅读。这也使得来源看起来比实际情况更加混乱。

较强的读法是：

> Codex 目标不是提示词。它是一个线程级长时间运行的任务状态机。

提示仅回答一个问题：“模型应该在下一个样本中看到什么？”目标必须回答更多问题：
```text
Where is the objective stored?
When is it restored?
When may it continue without a new user message?
Who is allowed to change its status?
How are token and time usage counted?
What happens when budget or usage boundaries are reached?
```
从结账延迟的故事开始。

正常的提示是：“立即尝试优化结账延迟。”目标的表述更接近合同：
```text
Objective: checkout p95 < 120 ms
Evidence: checkout benchmark
Constraint: correctness suite stays green
Status: active / paused / blocked / complete / budget-limited / usage-limited
Ledger: token usage, elapsed time, and budget state
Continuation: after this turn ends, decide whether another autonomous turn is allowed
Authority: user, runtime, and model have different rights to mutate state
```
这就是为什么目标不能简化为“将目标纳入提示”。提示是下一个模型调用的一个输入。目标是附加到线程的持久运行时对象。

![目标运行时图](/assets/img/notion/codex-source-dive-goals-01.png)

## 1. 为什么 Goal 属于一个线程

从 app 服务器的角度来看，Goal 已经是线程级的。 `thread/goal/set`、`thread/goal/get`、`thread/goal/clear`等接口在一条辅助消息或一 turn 内不工作。它们在当前线程上操作。目标更新和清除也作为线程级事件流回。

这样的设计是必要的。长期目标不仅需要目标文本。它需要持久状态：
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
如果该状态仅存储在一个提示中，那么一旦上下文发生变化、app 重新启动或下一 turn 开始，它就会丢失。如果它是全局存储的，它可能会跨不相关的线程流动。将其附加到线程是自然的边界：线程已经拥有项目对话、rollout、工具证据和用户意图。

所以第一个重要的句子是：

> 目标不属于 turn。目标比 turn 更长久，并使用 turn 作为执行检查点。

这也解释了为什么代码必须监听运行时事件。仅通过阅读客观文本，目标无法知道发生了多少工作。它需要观察转动开始、工具完成、转动完成、空闲检查、外部突变、使用限制和线程恢复。

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

将目标运行时视为位于 turn 运行时旁边的小型调度程序。它不会取代`run_turn`；它观察周围的边界。

- 在 `TurnStarted` 处，它将此执行绑定到当前活动的目标并记录使用基线。
- 在 `ToolCompleted`，它考虑增量token和时间使用，并可能注入预算指导。
- 在`TurnFinished`，它完成记账并决定是否应考虑空闲延续。
- 在`MaybeContinueIfIdle`，它运行延续门。
- 在`UsageLimitReached`，停止实质性工作，诚实地浮出边界。
- 在 `ExternalSet` 或 `ExternalClear` 中，它接受来自模型循环外部的线程级突变。
- 在`ThreadResumed`，它在会话返回后重建运行时状态。

事件调度程序是将句子转变为操作机制的东西。如果没有它，目标就只是提示中的另一条指令。

## 3. `TurnStarted`：将活动 turn 绑定到活动 Goal

当常规turn开始时，Goal 运行时需要询问：

> 此 turn 是主动目标的一部分吗？

如果是，它至少记录两条基线。

第一个是令牌基线。稍后，当工具完成或turn完成时，运行时可以从当前使用情况中减去先前的基线，并仅考虑增量。如果没有基线，token使用将会被重复计算或错过。

第二个是挂钟基线。长期运行的目标可能会跟踪经过的时间，而不仅仅是令牌。可恢复的自治任务必须有一个账本。如果它无法解释自己的成本，用户界面最终将显示一个冒充计划的黑匣子。

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
目标并不取代 turn。它在轮流周围包裹了一个长期运行的状态层。

## 4. `ToolCompleted`：工具输出既是证据也是成本

对于 coding agent 来说，真正的进步发生在模型样本和工具之间。模型读取文件、执行测试、应用补丁、运行基准测试并研究故障。每一步都会产生证据并消耗预算。

这就是为什么 `ToolCompleted` 很重要。工具完成后，Goal 运行时可以执行三件事：
```text
1. Add the new token and time delta to the Goal ledger.
2. Check whether tokenBudget or usage limits are near or past their boundary.
3. If needed, inject model-visible budget steering.
```
预算转向不是用户`turn/steer`。它是运行时编写的控制输入。消息内容大致是：
```text
You are at the budget boundary. Do not start new substantive work.
Summarize completed attempts, evidence, blockers, and the best next step.
```
关键点是：

> 预算用尽并不等于目标完成。

如果结账 p95 从 180 毫秒变为 130 毫秒并且预算用完，则目标未完成。这是预算有限的。这种区别保护了信任。运行时边界迫使任务停止；它并不能证明目标已经实现。

## 5. `TurnFinished` 和 `MaybeContinueIfIdle`：继续必须通过门

这是《Goal》中最有趣的部分。

对于正常的turn，完成意味着助手已完成并等待用户。对于主动目标，完成的 turn 可能只是一个检查点。运行时必须问：目标完成了吗？如果不是，开始另一个自动turn是否安全且有用？

这个问题是故意设限的。 Goal 延续不是 `while true` 循环。

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

第三，抑制空延续。如果模型只是总结、犹豫或表示将继续而不产生计数的工具活动，则另一个自动继续可能是一种浪费。运行时不应该一直为自言自语买单。

第四，延续输入是运行时生成的。这不是新用户提示。运行时将活动目标带回到模型可见的上下文中，并根据当前证据请求下一个有用的步骤。

正确的心智模型是：
```text
Goal continuation = turn-level autonomy after explicit runtime gates
```
不是：
```text
Goal continuation = loop until the model says it is done
```
## 6. 权限边界：模型不应拥有整个 Goal 生命周期

如果模型可以自由重写自己的合约，那么长时间运行的任务就会变得不安全。因此，Codex 的设计是权力分离的。

![目标权限边界](/assets/img/notion/codex-source-dive-goals-04.png)

用户和 app 服务器拥有目标级生命周期：设置、获取、清除、暂停、恢复和外部限制。运行时拥有执行功能：记账、延续门、预算控制、使用限制行为和恢复。模型可以通过读取目标并报告进度状态（例如完成或阻止）来参与，但它不应该是预算和生命周期策略的唯一所有者。

这种分裂很重要，原因有二。

第一，它使目标保持诚实。模型可以说，“我相信基准现在证明了目标”，但状态更改仍应基于证据和运行时状态。如果模型在未经验证的情况下达到预算边界后说“我完成了”，则运行时不应将其与完成混淆。

第二，它使用户意图高于自主行为。用户可以清除或修改目标。排队的用户输入胜过继续。计划模式抑制执行。这些不是实施细节；它们是长期运行智能体的治理层。

## 7. 恢复：目标必须比记忆更持久

持久性是基于提示的解释完全被打破的地方。

如果 app 重新启动，仅提示的目标没有可靠的状态。它可能缺少使用总数、状态、先前的基线、阻止程序和持续状态。它也可能无法决定恢复是否安全。

可以恢复线程级目标。在 `ThreadResumed` 上，运行时可以从存储的线程数据和 rollout 重建活动目标状态。它可以知道目标是否处于活动状态、是否已暂停或受到限制、已统计了哪些使用情况以及是否应允许继续。

这是内存和状态之间的区别：
```text
Memory: “The model may remember the objective.”
State: “The runtime can restore the objective and its ledger.”
```
对于长时间运行的编码工作，国家获胜。

## 8. 为什么这对于智能体设计很重要

目标机制不仅仅是 Codex 的一项功能。对于任何长期运行的智能体来说，这都是一堂设计课。

一个严肃的长期目标至少需要六个部分：

|要求|为什么这很重要 |
| ---------------------- | ----------------------------------------------------------------------------------- |
|线程所有权 |目标属于项目对话，而不是单个样本。 |
|坚持|该任务必须能够承受上下文更改并重新启动。 |
|会计|自主工作需要一个可见的成本账本。 |
|延续门 |智能体不得永远运行或覆盖用户。 |
|权力分离|模型不应单方面重写其契约。 |
|诚实的边界状态|预算有限和使用限制并不等同于完整。 |

这就是为什么“目标只是一个提示”是错误的抽象。它隐藏了困难的部分。困难的部分是不告诉模型用户想要什么；它正在构建一个运行时，可以继续实现该目标，而不会撒谎、循环或窃取用户的控制权。

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
