---
title: Yuandong Tian Talks：搜索空间、RSI 与 Metaproductivity
date: '2026-05-22'
overview: >-
  TLDR: Search quality depends on shaping the action space, not only increasing rollouts; good representations make
  planning and learning much more effective.
description: >-
  TLDR: Search quality depends on shaping the action space, not only increasing rollouts; good representations make
  planning and learning much more effective.
tags:
  - readings
categories:
  - reading
  - research
math: true
toc: true
relatedPosts: true
---

<!-- notion-sync: 3674e07a-a023-80d7-86aa-ec175675ff65 parent=Readings url=https://app.notion.com/p/3674e07aa02380d786aaec175675ff65 -->

## 0. 一句话

搜索不是只靠更多 rollouts，关键是把 action space 表示成适合搜索的形状。

## 1. 搜索空间的形状

- **AlphaZero**：棋盘规则天然给了很好的搜索空间，MCTS 很有效。

- **LaMCTS**：很多现实优化问题没有天然好树结构，所以要学习 search space partition。

- **Learning Beyond Gradients**：coding agent 在程序空间里搜索 heuristic；当程序空间不够表达任务时，就要升级抽象，比如宏动作、状态图、MPC、memory。

- **RSI**：真正的自我改进系统不只是改答案，而是会改自己的搜索空间、评估器、程序结构和迭代方式。

## 2. 重点材料

[Yuandong Tian 的 talks 页面](https://yuandong-tian.com/talks/)收集了他近几年公开发表的 slides。这里最值得优先看的几份是：

- [MIT NLP talk](https://yuandong-tian.com/talks/talk_mit_nlp.pdf)

- [EIT talk](https://yuandong-tian.com/talks/talk_eit.pdf)

- [Recursive Self-Improvement Workshop](https://recursive-workshop.github.io/)

- [RSI workshop talk](https://yuandong-tian.com/talks/rsi_workshop.pdf)

## 3. Metaproductivity

这里的关键字段是 `metaproductivity`。Huxley-Gödel Machine 的核心洞见就是：一个 agent 当前 benchmark performance 高，不代表它有更好的后续自我改进潜力；他们称之为 Metaproductivity-Performance Mismatch，并用 descendant performance 的 clade-level 指标来指导 self-modification tree search。

## 4. 一个可记录的 context pattern

```js
{
  "type": "trace | failuremode | heuristic | controller | evaluator | environmentgenerator | test | negativeresult | abstraction | protocol",
  "content": "自然语言、代码、prompt、测试、replay、state graph、controller 参数等",
  "scope": "适用任务、状态区域、模型族、预算区间、不可用条件",
  "evidence": "positive trials, negative trials, ablation, held-out transfer",
  "lineage": "由哪些 agent、哪些 trajectory、哪些 previous CP 生成",
  "fitness": {
    "directgain": "...",
    "costreduction": "...",
    "transfer": "...",
    "robustness": "...",
    "metaproductivity": "...",
    "diversityimpact": "...",
    "safetyrisk": "..."
  },
  "status": "raw | candidate | validated | canonical | deprecated | distilled"
}
```

这个 schema 的重点是把一次 agent 轨迹中产生的经验，记录成可以被后续搜索、验证、废弃和蒸馏的对象。特别是 `metaproductivity` 字段，它记录的不是当前收益，而是这个对象是否提高了后续自我改进的能力。

## 5. 后续阅读

- [talk_mit_nlp_annotated_notes](https://app.notion.com/p/3684e07aa02380169547f2c1b7b7f36c)
