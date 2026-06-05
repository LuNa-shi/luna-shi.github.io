---
title: Compression Is All You Need：把数学进展看成可测压缩
date: '2026-05-21'
overview: >-
  TLDR: Mathematical progress can be viewed as compression when a new abstraction makes many downstream proofs shorter,
  reusable, or easier to maintain.
description: >-
  TLDR: Mathematical progress can be viewed as compression when a new abstraction makes many downstream proofs shorter,
  reusable, or easier to maintain.
tags:
  - readings
categories:
  - reading
  - systems
math: true
toc: true
relatedPosts: true
---

<!-- notion-sync: 3674e07a-a023-80e7-bb86-f340766fef05 parent=Readings url=https://app.notion.com/p/3674e07aa02380e7bb86f340766fef05 -->

## 0. 一句话

这篇论文最有用的地方，是把“数学进展”转成一个可测的工程指标：压缩。一个好的 abstraction 不只是看起来优雅，而是应该让更多证明变短、复用率变高、维护成本下降。

## 1. 压缩作为评价指标

一个新 abstraction 是否有价值，可以问：

```text
加入它之后，多少证明变短了？
多少重复模式消失了？
多少 downstream theorem 更容易证明了？
它是否成为高 PageRank/高复用的依赖节点？
它是否降低了 proof depth 或 wrapped length？
```

这套问题把“数学家的 taste”部分转成了可观测信号：如果一个抽象真的有价值，它应该能压缩一批已有证明，并且在依赖图里产生稳定复用。

## 2. 抽象推荐系统

这非常适合 AI 团队做。团队不一定要先具备完整的数学直觉，但可以构造一个“抽象推荐系统”：

1. 在 mathlib 依赖图里找重复证明片段、重复 term pattern、重复 tactic pattern。

1. 提出候选 definition / lemma / theorem。

1. 自动重写一批已有证明，看是否显著缩短。

1. 用 Lean 验证全部新证明。

1. 用压缩率、复用率、破坏率、命名复杂度排序。

1. 只把 top candidates 交给数学家或 maintainer 审查。

这就把数学家从“亲自找所有抽象”变成“审核高置信候选”。杠杆会高很多。

## 3. 不只是 proof performance

我会把可做的贡献分成三层：

### 第一层：固定 mathlib 下的证明生成

这是现在很多 AI4Lean 的主战场：给 theorem，生成 proof。重要，但容易变成 benchmark chasing。

### 第二层：library-aware proof engineering

模型不只是证明一个 theorem，而是会建议“先加这个 lemma，后面 30 个 theorem 都变短”。这已经是在搭数学体系。

### 第三层：abstraction discovery

自动发现某类证明共享同一个结构，提出新定义、新 typeclass、新 theorem schema。这是最接近数学家的地方，也是最有研究价值的地方。

## 4. Takeaway

即使不是数学团队，也可以主攻第二、三层中的“可测部分”：找重复、提出抽象、重写证明、验证压缩率，再把高置信候选交给真正的 maintainer 审查。
