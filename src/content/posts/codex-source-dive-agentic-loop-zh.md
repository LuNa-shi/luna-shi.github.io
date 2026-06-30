---
title: Codex 源码阅读（I）：agentic loop 是运行时边界
date: '2026-06-11'
overview: TLDR：Codex turn 并不是一次模型调用。它是一个托管执行窗口，其中用户输入、工具调用、工具结果、取消、压缩和最终答案按运行时排序。
description: >-
 关于 turn/start、RegularTask、run_turn、turn/steer、turn/interrupt、待处理输入的源代码阅读注释，以及为什么 Codex
 的智能体循环比模型调用工具时更多。
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
translationKey: codex-source-dive-agentic-loop
canonicalSlug: codex-source-dive-agentic-loop
---

<!-- notion-sync: 37c4e07a-a023-8103-b020-e7336f1c7a59 parent=codex blogs url=链接 5 -->

副标题：**一轮不是一次模型调用。这是运行时边界。**

Codex 代码库中的第一个陷阱是词汇。你打开源码，立刻就遇到了`turn/start`、`RegularTask`、`run_turn`、`pending input`、`pending work`、转向项、邮箱事件、中断。如果你一一解释这些名字，这篇文章就变成了一个术语表。它还会产生误导，因为名称位于不同的层：有些是协议操作，有些是任务状态，有些是模型可见的历史记录，有些是可能唤醒空闲线程的条件。

这篇文章遵循一个线程：

> Codex 轮次并不是对模型的单个请求。它是一个托管执行窗口，可以接受更多输入、调用工具、将证据写回历史记录、取消并最终解决。

从一个简单的故事开始。
```text
Fix this failing test.
```
Codex 不会将该句子发送给模型并等待最终答案。应用服务器收到`turn/start`，创建正在进行的 turn，启动常规任务，进入核心循环。模型可以检查文件、运行失败的测试、读取 stdout 和 stderr、修补代码、再次运行测试，并仅在运行时有足够的证据后进行总结。每个工具结果都成为历史的一部分；下一个模型请求基于实际发生的情况，而不是模型猜测会发生的情况。

现在想象一下，当任务运行时，您添加：
```text
Actually, prioritize the API layer. Do not touch the UI.
```
这不应该创造一个全新的转折。它也不应该终止已经运行的命令。这是一个飞行中的约束，因此它会经历 `turn/steer`：运行时将新的用户输入附加到活动turn并在安全边界处耗尽它。

如果按停止键，则为不同的操作。 `turn/interrupt` 不是另一个转向消息。它会取消当前的轮次并让任务在中断时逐渐结束。

这三个时刻赋予了整篇文章的轮廓：
```text
turn/start -> open an active turn
RegularTask -> own lifecycle and cancellation
run_turn -> loop through model, tools, and history
turn/steer -> add input to the same active turn
turn/interrupt -> cancel the active turn
pending work -> maybe wake an idle thread later
```
![Codex 转运行时](/assets/img/notion/codex-source-dive-agentic-loop-01.png)

## 1. `turn/start` 打开执行窗口

`turn/start` 是协议入口点。客户端发送用户输入，还可以附加 turn 级别覆盖，例如模型、工作目录、沙箱或审批行为以及权限配置文件。应用服务器返回一个轮次对象，通常处于进行中状态，并在轮次运行时流式传输事件：轮次开始、项目启动、项目完成、助理消息增量、工具输出和最终轮次完成。

重要的区别是：
```text
Protocol layer: “start a turn”
Core layer: “run a managed task that may call the model many times”
```
一个有用的源形调用路径是：
```text
turn/start
 -> create or activate turn
 -> RegularTask::run
 -> run_turn
 -> run_sampling_request
```
`RegularTask::run` 拥有外部生命周期。它发出开始事件，持有取消令牌，然后重复调用 `run_turn` 直到活动 turn 没有更多输入等待消耗。

粗略的形式：
```text
next_input = initial input from turn/start
loop:
 last_agent_message = run_turn(next_input)
 if the active turn has no pending input:
 return last_agent_message
 next_input = []
 continue the same task
```
该外循环解释了为什么 `turn/steer` 不需要新一轮。转向输入进入由活动turn拥有的待处理输入队列。当 `run_turn` 到达安全点时，常规任务可以使用新记录的输入继续执行相同的执行。

更好的心智模型是：
```text
turn/start = begin a controllable execution window
run_turn = run the model/tool/history loop inside that window
turn/steer = add one more user constraint to that same window
```
如果你将 `turn/start` 视为“调用模型一次”，那么后面的每个概念都会感到矛盾。只有当您将turn视为运行时边界时，设计才会变得清晰。

## 2. `run_turn` 是实际的智能体循环

`run_turn` 是熟悉的循环所在的地方：模型、工具、模型、最终答案。但 Codex 的循环不是玩具版本。

玩具智能体可以写成：
```python
while True:
 response = model(messages)
 if response.tool_call:
 messages.append(run_tool(response.tool_call))
 else:
 break
```
这解释了工具调用，但没有解释 Codex。 Codex 还需要处理飞行中的用户输入、取消、沙箱和审批策略、上下文压缩、停止挂钩、事件流、rollout 恢复和跨智能体邮箱消息。生产 coding agent 需要一个循环运行时。

对于 `run_turn` 更好的问题是：

> 在这个示例之后，运行时是否有任何理由必须采取另一个步骤？

原因可能来自于模型。它要求进行函数调用。它也可能来自运行时。钩子可能需要继续。压缩的历史记录可能需要新的采样过程。待处理的输入现在可以安全地耗尽。即使模型想要继续，中断也可能要求循环停止。

![run_turn 循环](/assets/img/notion/codex-source-dive-agentic-loop-02.png)

`run_turn` 的一次传递大致如下所示：

1.它记录输入。第一个输入来自`turn/start`；一旦到达安全点，稍后的输入可能来自 `turn/steer`。
2. 构建采样请求。运行时克隆模型可见历史记录，添加指令、可见工具模式、输出模式和其他 turn 配置。
3. 对模型进行采样。模型可以生成辅助文本、函数调用或两者兼而有之。
4. 它通过运行时执行工具调用。模型看到一个模式；运行时处理路由、策略、沙箱、审批和实际的副作用。
5. 将结果写回到历史记录中。 stdout、stderr、补丁结果、命令状态和工具错误成为下一个示例的证据。

最后一步是设计的核心。工具结果不是 UI 日志。这是下一个模型请求必须看到的事实。如果没有反馈，智能体就会进行猜测。有了它，智能体可以根据实际的 repo、实际的测试和实际的命令输出进行自我纠正。

因此，只有当多个层同意循环可以停止时，循环才会停止：
```text
The model has no tool follow-up.
No pending input is waiting to be consumed.
No compaction continuation is required.
Stop hooks allow the turn to settle.
No interrupt, replacement, or error branch has taken over.
```
这是演示智能体和 coding agent 之间的界限。模型提出了下一步行动。运行时决定是否允许、何时运行、如何记录结果以及何时关闭执行窗口。

## 3. `turn/steer` 是飞行中输入，不是新 turn

`turn/steer` 很容易被误读，因为“steer”这个词也出现在运行时生成的转向中。将它们分开。

在协议层，`turn/steer` 做了一件主要的事情：它将用户输入附加到已经在飞行的常规turn中。它是针对这样的情况：
```text
User: Fix this bug.
Codex: reads files, runs tests, starts a patch.
User: One more constraint: do not change the public API.
```
第二用户消息属于同一个执行窗口。它并不意味着“重新开始”。它并不意味着“取消”。它的意思是“当你达到安全边界时，将其纳入当前任务中”。

该输入进入待处理输入。等待输入不会自动提示。它是运行时已接受的队列，稍后将写入历史记录。有两个细节很重要：

- 来自 `turn/start` 的新输入应在 turn 开始时首先处理。
- 如果上下文压缩或工具延续已经在进行中，则运行时可能需要在耗尽转向输入之前完成该延续。

生命周期是：
```text
turn/steer
 -> pending input
 -> safe point
 -> conversation item in history
 -> same active turn continues
```
“安全点”这句话，就是做实事。 Codex 不应将新的用户指令拼接到任意工具副作用的中间。运行时会等待，直到它可以保留排序、历史和取消语义。

## 4. `turn/interrupt` 取消；它不会继续

`turn/interrupt` 是不同的操作。它请求取消特定的飞行中turn。如果成功，该 turn 最终会被中断。取消令牌遍历任务和工具执行路径，以便运行时可以结束正在进行的工作。

不要这样描述：
```text
turn/interrupt = start a new turn with a stop instruction
```
那是错误的。更好的版本是：
```text
turn/interrupt = the current active turn ends here
new turn = may happen later, but it is not the interrupt itself
```
稍后的轮次可能来自用户发送的新的`turn/start`。它还可能来自线程空闲后运行时发现的待处理工作。但中断本身是为了结束当前的执行，而不是继续它。

![开始转向中断挂起的工作](/assets/img/notion/codex-source-dive-agentic-loop-03.png)

## 5. 待处理输入、待处理工作和运行时引导是三种不同的想法

最初的注释是最弱的，它们将这些名称放在同一水平上。它们听起来很相似，但它们回答了不同的问题。

### 待处理的输入属于活动 turn

待处理输入是当前活动 turn 已接受但尚未写入历史记录的用户输入。 `turn/steer` 是规范来源。问题是：

> 该用户消息是否应该成为已经运行的 turn 的语义边界的一部分？

如果是，则正在等待输入。

### 待处理的工作属于空闲线程

待处理工作是指在活动 turn 已经解决后唤醒线程。邮箱项目或触发器可能意味着“该线程处于空闲状态，但它应该处理更多工作。”问题是：

> 当前 turn 结束后，是否有需要开始下一个 turn 的工作？

这就是为什么待处理的工作可以创建一个新的 turn，而待处理的输入通常会保持同一 turn 处于活动状态。

### 运行时转向是系统生成的模型可见控制

运行时控制不是协议 `turn/steer`。它是运行时写入历史记录的一项，以便模型看到控制约束。示例包括表示模型尚未完成的停止钩子、上下文压缩后的延续或来自长期运行目标的预算消息。

明确的区别是：
```text
turn/steer -> user input enters pending input
runtime steering -> system-generated control item enters history
pending work -> idle-thread condition may start later work
```
这三者都可以使执行继续进行。它们并非来自同一层，不应被解释为一种机制。

## 6. 为什么边界如此细粒度

对于玩具智能体来说，`while model -> tool -> model` 循环就足够了。对于 coding agent 来说，事实并非如此。

用户可以在测试运行时添加约束。 shell 命令可能需要很长时间并且需要取消。补丁可能需要审批。沙箱可能会阻止文件写入或网络访问。上下文窗口可能会被填满并需要压缩。模型可能总结得太早，而停止钩可能需要将其拉回。子智能体可以发送邮箱结果。用户界面仍然需要项目级别的进度，而不是一个巨大的一整块最终输出。

这些是运行时边界问题，而不仅仅是模型质量问题。

我将 Codex 分为五层：

|层|提问即回答 |典型名称|
| ------------ | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
|协议|外界如何开始、添加、取消和观察turn？ | `turn/start`、`turn/steer`、`turn/interrupt`、事件流 |
|任务|谁拥有生命周期和取消？ | `RegularTask`、`SessionTask`、取消令牌 |
|历史|接下来模型实际上会看到什么？ |历史记录、响应项目、工具输出、指导项目 |
|工具运行时 |操作是如何路由、授权、执行和记录的？ | `ToolRouter`、`ToolCallRuntime`、沙箱、审批 |
|控制|是什么力量让我们继续或停止？ |待处理输入、压缩、停止挂钩、邮箱、待处理工作 |

一旦这些层被分离，代码看起来就不再像一堆术语了。它变成了一个关于执行窗口的故事。

## 7. 源代码阅读清单

当阅读 Codex 的这一部分时，不要一开始就问“循环在哪里？”从这些问题开始：
```text
Who created the active turn?
Who owns its cancellation token?
What input is already in history, and what input is only pending?
What model-visible items are user-authored versus runtime-authored?
What tool results were written back as evidence?
Why did the loop decide to continue?
Why was it allowed to stop?
```
该清单比记住函数名称更有用。 Codex 的智能体循环不仅仅是 `while(tool)`。它是用户意图、模型采样、工具副作用、历史记录和取消之间精心管理的边界。

## 源图

读完这篇文章后需要阅读的有用文件和区域：

- `codex-rs/app-server/README.md` 用于转向协议形状和事件语义。
- `codex-rs/core/src/tasks/regular.rs` 用于常规任务生命周期。
- `codex-rs/core/src/session/turn.rs` 用于模型/工具/历史循环。
- 用于授权、沙箱和工具输出记录的工具路由和运行时模块。
