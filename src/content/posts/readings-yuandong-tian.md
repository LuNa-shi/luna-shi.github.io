---
title: Yuandong tian
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

搜索不是只靠更多 rollouts，关键是把 action space 表示成适合搜索的形状。

- **AlphaZero**：棋盘规则天然给了很好的搜索空间，MCTS 很有效。

- **LaMCTS**：很多现实优化问题没有天然好树结构，所以要学习 search space partition。

- **Learning Beyond Gradients**：coding agent 在程序空间里搜索 heuristic；当程序空间不够表达任务时，就要升级抽象，比如宏动作、状态图、MPC、memory。

- **RSI**：真正的自我改进系统不只是改答案，而是会改自己的搜索空间、评估器、程序结构和迭代方式。

[https://yuandong-tian.com/talks/](https://yuandong-tian.com/talks/) 这里面是田渊栋最近几年公开发表的 talk 的 Slides 文件，其中我想让你着重仔细看 [https://yuandong-tian.com/talks/talk_mit_nlp.pdf、https://yuandong-tian.com/talks/talk_eit.pdf、以及最新的在](https://yuandong-tian.com/talks/talk_mit_nlp.pdf%E3%80%81https://yuandong-tian.com/talks/talk_eit.pdf%E3%80%81%E4%BB%A5%E5%8F%8A%E6%9C%80%E6%96%B0%E7%9A%84%E5%9C%A8) RSI workshop [https://recursive-workshop.github.io](https://recursive-workshop.github.io/) 上讲的 [https://yuandong-tian.com/talks/rsi_workshop.pdf](https://yuandong-tian.com/talks/rsi_workshop.pdf)

这里的关键字段是 `metaproductivity`。Huxley-Gödel Machine 的核心洞见就是：一个 agent 当前 benchmark performance 高，不代表它有更好的后续自我改进潜力；他们称之为 Metaproductivity-Performance Mismatch，并用 descendant performance 的 clade-level 指标来指导 self-modification tree search。

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

- [talk_mit_nlp_annotated_notes](https://app.notion.com/p/3684e07aa02380169547f2c1b7b7f36c)
