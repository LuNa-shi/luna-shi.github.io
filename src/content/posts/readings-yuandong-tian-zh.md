---
title: 田远东谈：搜索质量就是动作空间质量
date: '2026-05-22'
overview: TLDR：更多 rollout 还不够。只有当动作空间、表示、评估器和记忆让好轨迹更容易被找到时，搜索才会真正变强。
description: TLDR：更多 rollout 还不够。只有当动作空间、表示、评估器和记忆让好轨迹更容易被找到时，搜索才会真正变强。
math: true
toc: true
relatedPosts: false
tags:
 - search
 - research-methods
categories:
 - reading
 - research
lang: zh
translationKey: readings-yuandong-tian
canonicalSlug: readings-yuandong-tian
---

<!-- notion-sync: 3674e07a-a023-80d7-86aa-ec175675ff65 parent=Readings url=链接 0 -->

从搜索中得到的浅薄教训是“尝试更多的事情”。

更重要的教训是，搜索质量取决于动作空间的形状。如果表示不好，更多 rollout 大多只是更快地探索坏区域。如果表示良好，搜索就可以变得样本高效、可解释且强大。

这是我从田远东的演讲中得到的要点。

## 搜索需要一个形状

AlphaZero 之所以有效，部分原因是棋盘游戏为搜索提供了干净结构。规则定义合法动作，状态可检查，而且可以通过稳定的游戏目标评估 rollout。

许多真正的优化问题并不是伴随着这份礼物而来的。 LaMCTS 很有趣，因为它学习如何划分搜索空间。超越梯度学习很有趣，因为它将 coding agent 视为搜索启发式程序而不仅仅是答案的系统。

常见的模式是：
```text
better representation
 -> better local moves
 -> better search
 -> better learning from feedback
```
当行动空间太弱时，正确的举措往往不是“更多样本”。这就是“改变抽象”。

## 这对于 coding agent 意味着什么

coding agent 可以在多个空间中进行搜索：

- 文字回复；
- 补丁；
- 工具调用序列；
- 测试；
- 状态机；
- 控制器；
- 记忆记录；
- 评估定义；
- 环境发生器。

错误在于将智能体保留在最小的空间中并期望智能来弥补。如果任务需要宏操作、状态图、重放或评估器，那么“编写下一个补丁”是错误的操作空间。

这就是递归自我完善变得具体的地方。自我改进的系统不应仅仅改进当前的答案。它应该改进未来搜索使用的表示。

## 元生产力

这里最有用的词是 `metaproductivity`。

当前的绩效和改进潜力不是同一回事。一个系统可以在今天的基准上表现良好，但不会为明天留下可重用的结构。另一个系统可能会产生适度的即时增益，但会创建更好的评估器、控制器、抽象或内存格式，使未来的改进变得更容易。

这种区别对于智能体研究很重要。我们不仅应该跟踪直接的任务增益，还应该跟踪更改是否改进了下一轮搜索。

## 值得保存的上下文模式

这是我用来将智能体体验保留为可搜索、可测试对象的模式：
```json
{
 "type": "trace | failure_mode | heuristic | controller | evaluator | environment_generator | test | negative_result | abstraction | protocol",
 "content": "natural language, code, prompt, test, replay, state graph, or controller parameters",
 "scope": "tasks, state regions, model families, budget ranges, and known invalid conditions",
 "evidence": "positive trials, negative trials, ablations, and held-out transfer",
 "lineage": "agents, trajectories, and previous context pieces that produced it",
 "fitness": {
 "direct_gain": "...",
 "cost_reduction": "...",
 "transfer": "...",
 "robustness": "...",
 "metaproductivity": "...",
 "diversity_impact": "...",
 "safety_risk": "..."
 },
 "status": "raw | candidate | validated | canonical | deprecated | distilled"
}
```
重要的字段不仅仅是`direct_gain`。它是`metaproductivity`：这个对象会让以后的改进变得更容易吗？

## 阅读路径

演讲页面是最好的起点：

- [田远东讲座](https://yuandong-tian.com/talks/)
- [MIT NLP 讲座](https://yuandong-tian.com/talks/talk_mit_nlp.pdf)
- [EIT 讲座](https://yuandong-tian.com/talks/talk_eit.pdf)
- 【递归自我提升工作坊】(https://recursive-workshop.github.io/)
- [RSI 研讨会演讲](https://yuandong-tian.com/talks/rsi_workshop.pdf)

## 我的收获

搜索不仅仅是算法预算。它是可能操作空间的接口。

对于智能体系统来说，最重要的改进可能来自于设计更好的搜索空间：更丰富的动作、更清晰的状态、更强大的评估器、可重用的内存以及提高未来学习速度的抽象。

[注释](https://app.notion.com/p/3684e07aa02380169547f2c1b7b7f36c)
