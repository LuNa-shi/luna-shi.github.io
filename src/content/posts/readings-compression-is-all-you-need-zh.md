---
title: 压缩就是你所需要的：衡量数学进步
date: '2026-05-21'
overview: TLDR：数学抽象在压缩下游工作时很有价值：证明变得更短，重复的模式消失，并且库变得更容易扩展。
description: TLDR：数学抽象在压缩下游工作时很有价值：证明变得更短，重复的模式消失，并且库变得更容易扩展。
math: true
toc: true
relatedPosts: false
tags:
 - mathematical-progress
 - evaluation
categories:
 - reading
 - systems
lang: zh
translationKey: readings-compression-is-all-you-need
canonicalSlug: readings-compression-is-all-you-need
---

<!-- notion-sync: 3674e07a-a023-80e7-bb86-f340766fef05 parent=Readings url=链接 0 -->

“良好的抽象”一词通常被视为品味。数学家通常可以感觉到定义何时正确，但这种感觉很难实施。

这篇文章的有用举措是将数学进步视为压缩。新的抽象不仅仅是优雅。它应该使证明工作区域更短、更可重用或更容易维护。

这将品味变成了可测量的工程信号。

## 压缩测试

对于候选抽象，询问：
```text
After adding it, how many proofs get shorter?
How many repeated proof patterns disappear?
How many downstream theorems become easier to prove?
Does it become a high-reuse dependency node?
Does it reduce proof depth or wrapped proof length?
Does it make future maintenance simpler?
```
关键不是任何单一指标。关键是有价值的抽象应该在证明库中留下痕迹。它应该将工作压缩到超出引入它的定理之外。

## 为什么这是一个很好的 AI 问题

对于围绕 Lean 或类似形式化库工作的 AI 系统来说，这是一项很自然的任务。

团队不需要模型就能在第一天就成为完全自主的数学家。第一个有用的系统可以是抽象推荐器：

1. 在库中搜索重复的证明术语、策略模式和局部引理。
2. 提出排除重复的候选定义或引理。
3. 使用候选抽象重写一批现有证明。
4. 使用 Lean 验证所有重写后的证明。
5. 根据压缩、重用、破坏和命名成本对候选进行排名。
6. 只将最好的候选人发送给人类维护人员。

这将维护人员的工作从“手动发现每个抽象”转变为“审查证据充分的候选者”。

## 贡献的三个级别

我会将 AI 用于形式数学的工作分为三层。

|层|系统的作用 |为什么这很重要 |
| --- | --- | --- |
|证明生成|在固定库中证明一个定理 |重要，但很容易变成基准追逐 |
| 库感知工程 | 建议能缩短许多证明的引理 | 开始塑造数学代码库 |
|抽象发现|寻找共享结构并提出新概念 |最接近数学味道的作品|

第二层和第三层是长期杠杆的有趣层。它们不仅仅是解决今天的定理。它们是为了让明天的定理变得更容易。

## 维护角度

压缩也可能失败。新的抽象可能会缩短证明，但会使名称变得混乱。它可能会成为一种脆弱的依赖。它可能隐藏应保持明确的结构。它可能会对一个领域有所帮助，同时使另一个领域更难理解。

所以我不会仅仅通过长度缩减来对候选人进行排名。有用的分数应包括：
```text
compression
reuse
proof stability
dependency centrality
name clarity
review cost
future extensibility
```
这个系统看起来不该像定理证明者，而更像库工程师。

## 我的收获

这里最深刻的想法是抽象有证据。

如果一个定义确实很好，它应该压缩数学工作的邻域。这为 AI 系统提供了立足点：提出、重写、验证、测量，然后要求人类用最有力的证据来判断候选人。

对我来说，最有前途的研究方向不是“生成更多 Lean 证明”，而是“维护一个证明库，让接下来的一百个证明变得更简单”。
