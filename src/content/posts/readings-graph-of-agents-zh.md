---
title: Agent Graph：多 Agent 价值来自于信息流
date: '2026-06-08'
overview: TLDR：智能体图很有用，因为它将协作视为测试时图问题：选择相关智能体，对他们的答案进行评分，向正确的方向传递消息，并汇集结果。
description: TLDR：智能体图很有用，因为它将协作视为测试时图问题：选择相关智能体，对他们的答案进行评分，向正确的方向传递消息，并汇集结果。
math: true
toc: true
relatedPosts: false
tags:
 - multi-agent-systems
 - information-flow
categories:
 - reading
 - agents
lang: zh
translationKey: readings-graph-of-agents
canonicalSlug: readings-graph-of-agents
---

<!-- notion-sync: 3794e07a-a023-80ec-a232-d6059c614420 parent=Readings url=链接 0 -->

多智能体协作的弱版本很简单：询问几个模型，结合答案，希望群体比零件更聪明。

智能体图很有趣，因为它并不止于此。它提出了一个更具结构性的问题：对于这个查询，哪些智能体应该参与，谁应该听谁的意见，以及最终的答案应该如何汇集？

这样这篇文章较少关注智能体数量，而更多地关注信息流。

![概念图像](/assets/img/notion/readings-graph-of-agents-01.webp)

## 模型动物园问题

一旦有许多可用模型，“使用多个智能体”就变得不明确。

有些模型在代码方面更强，有些模型在医学方面更强，有些模型在法律方面更强，有些模型在一般推理方面更强。为每个问题都调用所有的人会浪费令牌并增加噪音。因此，多智能体系统需要在协作之前进行选择。

智能体图从模型卡信息和元 LLM 开始，元 LLM 为当前查询选择一个小的 top-k 集。这已经是一个重要的设计选择。这个系统并不是要召开更大的会议。它正在尝试邀请合适的房间。

## 优势是通过同行评分获得的

选择后，每个智能体独立回答。然后，智能体对彼此答案的正确性、连贯性和相关性进行评分。这些分数成为相关性结构。

该图并未预先固定：
```text
query
 -> select relevant agents
 -> collect initial answers
 -> peer-score answers
 -> form directed communication edges
 -> pass messages
 -> pool final answer
```
这是将智能体图与简单混合物分开的部分。通信模式是在测试时根据智能体自己的输出构建的。

## 方向很重要

最有用的直觉是消息不应该对称移动。

高相关性答案首先指导低相关性智能体。然后，相关性较低的智能体在吸收该指导后，可以发回更新的信息。换句话说，该图具有方向细化循环。

这篇论文的删减表明，扭转这个方向会带来伤害。这是有道理的。如果较弱或不太相关的答案过早引导较强的答案，那么合作就会变成污染。

教训不是“让智能体多说话”。这个教训是“控制谁在何时影响谁”。

## 池化也是一种设计选择

最终的答案还需要聚合。智能体图测试池变体，例如平均值和最大值。这个细节很容易被跳过，但它很重要，因为池化表达了一种信任策略。

平均池表示群体信号很重要。最大池化表示最强的信号可能就足够了。生产系统可能需要更明确的策略：

|统筹政策|当合适的时候|
| --- | --- |
|卑鄙的|广泛的推理，其中几个局部观点有帮助|
|麦克斯式|一位专家可能主宰的领域 |
|验证者加权|与外部检查员的任务|
|人门控|高风险产出或不明确的分歧|

仅当最终决策规则与任务匹配时，该图才有用。

## 我的收获

智能体图是一篇有用的论文，因为它将多智能体设计从“更多智能体”重新定义为“自适应拓扑”。

可重用的模式是：
```text
select fewer agents
score relevance
direct information flow
pool with a task-appropriate policy
```
这对于智能体建设者来说也是一个很好的警示。具有固定的全对所有聊天功能的六智能体系统可能比具有正确通信结构的三智能体系统更弱、更慢且更昂贵。

[论文](https://arxiv.org/abs/2604.17148) | [代码](https://github.com/UNITES-Lab/GoA/tree/main)
