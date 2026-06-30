---
title: Codex 源码阅读（I）：agentic loop 是运行时边界
date: '2026-06-11'
overview: TLDR：Codex 的 turn 不是一次模型调用，而是一个托管执行窗口。用户输入、工具调用、工具结果、取消、压缩和最终答案都由运行时排序。
description: >-
 关于 turn/start、RegularTask、run_turn、turn/steer、turn/interrupt、待处理输入的源代码阅读注释，以及为什么 Codex
 的智能体循环不只是“模型调用工具”。
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

副标题：**一轮不是一次模型调用，而是运行时边界。**

Codex 代码库里的第一个陷阱是词汇。打开源码，很快就会碰到 `turn/start`、`RegularTask`、`run_turn`、`pending input`、`pending work`、steering item、邮箱事件和中断。如果逐个解释这些名字，文章会变成术语表，而且会误导读者：这些名字分属不同层。有些是协议操作，有些是任务状态，有些是模型可见的历史记录，有些则是唤醒空闲线程的条件。

这篇文章遵循一个线程：

> Codex 的 turn 不是发给模型的一次请求。它是一个托管执行窗口：可以继续接收输入、调用工具、把证据写回历史、处理取消，最后再收束成结果。

从一个简单的故事开始。
```text
Fix this failing test.
```
Codex 不会把这句话发给模型，然后坐等最终答案。应用服务器收到 `turn/start` 后，会创建一个进行中的 turn，启动常规任务，进入核心循环。模型可以检查文件、运行失败的测试、读取 stdout 和 stderr、修改代码、再次运行测试；只有运行时积累了足够证据，它才会总结。每个工具结果都会进入历史。下一次模型请求基于实际发生过的事，而不是模型想象中会发生的事。

现在想象一下，当任务运行时，您添加：
```text
Actually, prioritize the API layer. Do not touch the UI.
```
这不应该创建一个全新的 turn，也不应该直接终止已经在跑的命令。它是一个进行中的约束，因此会走 `turn/steer`：运行时把新的用户输入附加到活动 turn，并在安全边界处消耗它。

如果按下停止键，那就是另一种操作。`turn/interrupt` 不是另一条 steer 消息。它会取消当前 turn，让任务沿着取消路径收尾。

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

`turn/start` 是协议入口点。客户端发送用户输入，也可以附带 turn 级别的覆盖项，例如模型、工作目录、沙箱、审批行为和权限配置文件。应用服务器返回一个 turn 对象，通常处于进行中状态，并在 turn 运行时持续流式传回事件：turn 开始、项目启动、项目完成、助理消息增量、工具输出，以及最终的 turn 完成。

重要的区别是：
```text
Protocol layer: “start a turn”
Core layer: “run a managed task that may call the model many times”
```
一个有用的源码调用路径是：
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
这个外层循环解释了为什么 `turn/steer` 不需要开启新一轮。steer 输入会进入活动 turn 拥有的待处理输入队列。当 `run_turn` 到达安全点，常规任务就能把新记录的输入纳入同一个执行过程。

更好的心智模型是：
```text
turn/start = begin a controllable execution window
run_turn = run the model/tool/history loop inside that window
turn/steer = add one more user constraint to that same window
```
如果把 `turn/start` 理解成“调用模型一次”，后面的每个概念都会显得别扭。只有把 turn 看成运行时边界，这套设计才清楚。

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
这能解释工具调用，但解释不了 Codex。Codex 还要处理进行中的用户输入、取消、沙箱和审批策略、上下文压缩、停止钩、事件流、rollout 恢复，以及跨智能体邮箱消息。生产级 coding agent 需要的是循环运行时。

对于 `run_turn` 更好的问题是：

> 这次采样结束后，运行时还有没有理由再走一步？

理由可能来自模型：它请求了一次函数调用。也可能来自运行时：钩子需要继续，压缩后的历史需要新的采样，待处理输入现在可以安全消耗。反过来，即使模型想继续，中断也可能要求循环停下。

![run_turn 循环](/assets/img/notion/codex-source-dive-agentic-loop-02.png)

`run_turn` 的一次传递大致如下所示：

1. 它记录输入。第一个输入来自 `turn/start`；到达安全点后，后续输入也可能来自 `turn/steer`。
2. 构建采样请求。运行时克隆模型可见历史记录，添加指令、可见工具模式、输出模式和其他 turn 配置。
3. 对模型进行采样。模型可以生成辅助文本、函数调用或两者兼而有之。
4. 它通过运行时执行工具调用。模型看到的是 schema；运行时负责路由、策略、沙箱、审批和真实副作用。
5. 将结果写回历史记录。stdout、stderr、补丁结果、命令状态和工具错误，都会成为下一次采样的证据。

最后一步是设计核心。工具结果不是 UI 日志，而是下一次模型请求必须看到的事实。没有反馈，智能体只能猜；有了反馈，它才能根据真实 repo、真实测试和真实命令输出自我纠正。

因此，只有当多个层同意循环可以停止时，循环才会停止：
```text
The model has no tool follow-up.
No pending input is waiting to be consumed.
No compaction continuation is required.
Stop hooks allow the turn to settle.
No interrupt, replacement, or error branch has taken over.
```
这是演示智能体和 coding agent 之间的界限。模型提出了下一步行动。运行时决定是否允许、何时运行、如何记录结果以及何时关闭执行窗口。

## 3. `turn/steer` 是进行中的输入，不是新 turn

`turn/steer` 很容易被误读，因为 “steer” 这个词也出现在运行时生成的 steering item 里。先把两者分开。

在协议层，`turn/steer` 主要做一件事：把用户输入附加到已经在运行的常规 turn 上。它对应的是这样的情况：
```text
User: Fix this bug.
Codex: reads files, runs tests, starts a patch.
User: One more constraint: do not change the public API.
```
第二条用户消息仍属于同一个执行窗口。它不是“重新开始”，也不是“取消”，而是“到达安全边界后，把这条约束纳入当前任务”。

这条输入会进入待处理输入队列。待处理输入不会自动触发采样；它只是运行时已经接受、稍后会写入历史的队列。这里有两个细节：

- 来自 `turn/start` 的新输入应在 turn 开始时首先处理。
- 如果上下文压缩或工具延续已经在进行中，则运行时可能需要先完成该延续，再消耗 steer 输入。

生命周期是：
```text
turn/steer
 -> pending input
 -> safe point
 -> conversation item in history
 -> same active turn continues
```
“安全点”不是空话。Codex 不应该把新的用户指令硬插进任意工具副作用的中间。运行时会等到排序、历史和取消语义都能保住时再处理它。

## 4. `turn/interrupt` 取消；它不会继续

`turn/interrupt` 是另一种操作。它请求取消某个进行中的 turn。如果成功，这个 turn 最终会进入中断状态。取消令牌会穿过任务和工具执行路径，让运行时有机会结束正在进行的工作。

不要这样描述：
```text
turn/interrupt = start a new turn with a stop instruction
```
那是错误的。更好的版本是：
```text
turn/interrupt = the current active turn ends here
new turn = may happen later, but it is not the interrupt itself
```
后续 turn 可能来自用户发送的新 `turn/start`，也可能来自线程空闲后运行时发现的待处理工作。但中断本身的目的，是结束当前执行，而不是延续它。

![开始、steer、中断与待处理工作](/assets/img/notion/codex-source-dive-agentic-loop-03.png)

## 5. 待处理输入、待处理工作和运行时引导是三种不同的想法

我最初的笔记在这里最薄弱，因为把这些名字放在了同一层。它们听起来相似，但回答的是不同问题。

### 待处理的输入属于活动 turn

待处理输入是当前活动 turn 已接受、但还没写入历史记录的用户输入。`turn/steer` 是它的规范来源。问题是：

> 该用户消息是否应该成为已经运行的 turn 的语义边界的一部分？

如果是，则正在等待输入。

### 待处理的工作属于空闲线程

待处理工作是在活动 turn 已经结束后，用来唤醒线程的条件。邮箱项目或触发器可能表示：“这个线程空闲了，但还有工作要处理。”问题是：

> 当前 turn 结束后，是否有需要开始下一个 turn 的工作？

这就是为什么待处理的工作可以创建一个新的 turn，而待处理的输入通常会保持同一 turn 处于活动状态。

### 运行时 steering 是系统生成的模型可见控制

运行时 steering 不是协议 `turn/steer`。它是运行时写入历史记录的项目，用来让模型看到控制约束。例子包括表示模型还没完成的停止钩、上下文压缩后的延续，或长期目标发出的预算消息。

明确的区别是：
```text
turn/steer -> user input enters pending input
runtime steering -> system-generated control item enters history
pending work -> idle-thread condition may start later work
```
三者都可能让执行继续，但它们来自不同层，不能混成一种机制。

## 6. 为什么边界如此细粒度

对于玩具智能体来说，`while model -> tool -> model` 循环就足够了。对于 coding agent 来说，事实并非如此。

用户可能在测试运行时追加约束。shell 命令可能跑很久，需要被取消。补丁可能需要审批。沙箱可能阻止文件写入或网络访问。上下文窗口可能写满，需要压缩。模型可能过早总结，停止钩需要把它拉回来。子智能体可能发来邮箱结果。UI 还需要项目级进度，而不是最后吐出一整块巨大输出。

这些都是运行时边界问题，不能只归因于模型质量。

我将 Codex 分为五层：

|层|提问即回答 |典型名称|
| ------------ | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
|协议|外界如何开始、追加、取消和观察 turn？ | `turn/start`、`turn/steer`、`turn/interrupt`、事件流 |
|任务|谁拥有生命周期和取消？ | `RegularTask`、`SessionTask`、取消令牌 |
|历史|下一次模型实际会看到什么？ |历史记录、响应项目、工具输出、steering item |
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
这张清单比记函数名有用。Codex 的智能体循环不是简单的 `while(tool)`，而是用户意图、模型采样、工具副作用、历史记录和取消之间的运行时边界。

## 源图

读完这篇文章后需要阅读的有用文件和区域：

- `codex-rs/app-server/README.md` 用于 steer 协议形状和事件语义。
- `codex-rs/core/src/tasks/regular.rs` 用于常规任务生命周期。
- `codex-rs/core/src/session/turn.rs` 用于模型/工具/历史循环。
- 用于授权、沙箱和工具输出记录的工具路由和运行时模块。
