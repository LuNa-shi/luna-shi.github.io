---
title: 与智能体团队一起构建 C 编译器
date: '2026-05-13'
overview: C 编译器实验之所以成功，是因为该项目为智能体提供了合适的基础：模块化架构、客观测试、Git 作为共享内存、任务锁、可读日志以及将一个巨大目标变成许多局部失败的预言机。
description: 关于 Anthropic 的多智能体 C 编译器实验的阅读笔记，重点讨论了为什么 Git、测试、任务锁定、日志和验证器设计比智能体聊天更重要。
math: true
toc: true
relatedPosts: false
tags:
 - compiler-agents
 - multi-agent-systems
categories:
 - reading
 - agents
lang: zh
translationKey: readings-building-c-compiler-agent-teams
canonicalSlug: readings-building-c-compiler-agent-teams
---

<!-- notion-sync: 3524e07a-a023-801e-b99b-cabbe0723411 parent=Readings url=链接 0 -->

## 错误的教训

浅薄的教训是：
```text
Run many coding agents in parallel.
Get a huge software project.
```
这并不是让实验变得有趣的原因。

真正的教训是，该项目将一个巨大的目标——构建一个能够编译大型真实软件的 C 编译器——转变为一个反馈丰富的环境，在这个环境中，智能体可以查找、声明、修复、测试、合并和继续数千个小任务。

智能体们不需要花哨的群聊。他们需要一个基材。

## 系统形态

harness 很简单：
```text
many Claude Code sessions
 -> local repo clones in isolated environments
 -> shared upstream Git repo
 -> task files as locks
 -> tests as judge
 -> README/progress files as memory
```
Git 是共享工作区。 `current_tasks/` 是协调层。测试就是权威。日志是通信媒介。

这很重要，因为它重新构建了多智能体协作：

> 合作并非主要通过对话进行。它是通过共享状态发生的。

## Git 作为黑板

该项目的行为就像黑板架构。
```text
code -> current implementation
Git log -> who changed what
task files -> what is currently claimed
tests -> what is broken
docs -> what later agents need to know
logs -> what failed and why
```
智能体可以进入一个新的容器，读取 repo，检查故障，声明任务，制作补丁，运行测试，合并和推送。下一个智能体通过 Git 继承新世界，而不是通过私有内存。

这比要求客服人员记住群组对话要可靠得多。

## 任务锁作为最小调度

任务机制故意采用低技术含量。为了领取工作，智能体在 `current_tasks/` 下写入一个文件。
```text
current_tasks/fix-arm-casp-instruction.txt
current_tasks/fix-x86-kernel-link-errors.txt
current_tasks/implement-string-literal-deduplication.txt
```
如果两个智能体声明相同的任务，Git 冲突就会成为调度程序。失败的智能体退后并选择另一项任务。

这很粗糙，但它有效，因为工作单元是具体的：

- 修复一条汇编指令；
- 修复一处重定位表达式；
- 处理一种 ABI 边缘情况；
- 增加一项回归测试；
- 改进一个编译器通道。

当庞大的任务不断出现可独立测试的故障时，系统就会成功。

## 为什么编译器适合这种模式

C 编译器是智能体团队的一个很好的目标，因为该架构具有自然的层次：
```text
C source
 -> preprocessor
 -> lexer
 -> parser
 -> semantic analysis
 -> IR lowering
 -> optimization passes
 -> backend
 -> assembler
 -> linker
 -> executable
```
这给了智能体界限。一个智能体可以处理宏扩展，而另一个智能体可以处理 ARM 汇编或链接器表达式。

更好的是，编译器的正确性有外部信号：

|信号|使用|
| --- | --- |
|单元测试 |检查小型编译器组件 |
|集成测试|编译并运行 C 程序|
| GCC/Clang |提供行为或构建预言机 |
|开源项目 |强调真实的代码路径 |
| Linux 构建 |最终整合目标|

该项目有一座真正的山需要爬，因为测试暴露了梯度。

## 验证者是老大

最重要的设计语句是：

> 仅当智能体可以判断其是否取得进展时，智能体循环才有用。

对于这个项目来说，验证者比另一个 LLM 更有权威。听起来合理但未通过测试的补丁并不是进步。

控制回路为：
```text
test failure
 -> agent reads targeted log
 -> agent claims one task
 -> agent patches code
 -> agent runs fast tests
 -> CI protects regressions
 -> merged state becomes next starting point
```
这就是为什么必须为智能体编写日志的原因。长而嘈杂的日志会污染上下文。好的日志会总结故障，将详细信息保留在磁盘上，并使重要的行易于 grep 读取。

## 当并行性消失时

当存在许多独立的失败时，并行性仍然有效。当 Linux 内核构建成为最早失败的一个巨大瓶颈时，它就被削弱了。每个智能体都碰上了同样的墙。

解决办法不是“添加更多智能体”。解决方法是重新设计验证器。

使用 GCC 作为已知良好的预言机：
```text
compile most files with GCC
compile a sampled subset with the new compiler
link and test
if it fails, shrink the subset
repeat until a file or interaction is isolated
```
这会将一个单一的故障重新转化为许多本地任务。

这是这篇文章最深刻的教训：

> 当任务停止并行时，请在添加智能体之前更改反馈结构。

## 编码之外的角色

并非每个智能体都应该编写功能。

有用的角色包括：

|角色 |工作 |
| --- | --- |
|错误修复智能体 |修复失败的测试或项目 |
|回归智能体|保留旧的行为 |
|重构剂 |合并重复的实现 |
|性能智能体|提高编译器速度或生成的代码 |
|文件智能体|保持进度和设计笔记可用 |
|审查智能体|攻击架构和一致性|

该项目不需要完美的中央调度程序即可从专业化中受益。这些角色需要足够的共享状态以避免相互冲突。

## 什么是可重用的

要重现这种多智能体项目，重要的清单是：
```text
choose a target with objective verification
make failures small and claimable
use Git or files as durable shared memory
write logs for machine readers
add fast deterministic test subsets
protect progress with CI
assign some agents to quality, docs, and refactoring
redesign the verifier when parallelism collapses
```
## 我的收获

多智能体软件系统的上限不是智能体的数量。就是任务能否被验证、分解、隔离、反馈到下一次迭代中。

C 编译器实验令人兴奋，因为它表明智能体团队可以在为其构建环境时进行扩展。这也是一个警告：如果没有测试、预言机、日志和人为设计的反馈，自主代码可能会看起来很忙，同时却偏离了正确性。
