---
title: 'Graph of Agents: multi-agent value comes from information flow'
date: '2026-06-08'
overview: >-
  TLDR: Graph of Agents is useful because it treats collaboration as a test-time graph problem: choose relevant agents,
  score their answers, pass messages in the right direction, and pool the result.
description: >-
  TLDR: Graph of Agents is useful because it treats collaboration as a test-time graph problem: choose relevant agents,
  score their answers, pass messages in the right direction, and pool the result.
tags:
  - 'readings'
categories:
  - 'reading'
math: true
toc: true
relatedPosts: false
---

<!-- notion-sync: 3794e07a-a023-80ec-a232-d6059c614420 parent=Readings url=https://app.notion.com/p/3794e07aa02380eca232d6059c614420 -->

The weak version of multi-agent collaboration is simple: ask several models, combine the answers, hope the crowd is wiser than the parts.

Graph of Agents is interesting because it does not stop there. It asks a more structural question: for this query, which agents should participate, who should listen to whom, and how should the final answer be pooled?

That makes the paper less about agent quantity and more about information flow.

![Notion image](/assets/img/notion/readings-graph-of-agents-01.webp)

## The model zoo problem

Once there are many available models, "use multiple agents" becomes under-specified.

Some models are stronger at code, some at medicine, some at law, some at general reasoning. Calling all of them for every question wastes tokens and adds noise. A multi-agent system therefore needs selection before collaboration.

Graph of Agents starts with model-card information and a meta-LLM that chooses a small top-k set for the current query. This is already an important design choice. The system is not trying to make a larger meeting. It is trying to invite the right room.

## Edges are earned by peer scoring

After selection, each agent answers independently. Then agents score one another's answers for correctness, coherence, and relevance. Those scores become a relevance structure.

The graph is not fixed in advance:

```text
query
  -> select relevant agents
  -> collect initial answers
  -> peer-score answers
  -> form directed communication edges
  -> pass messages
  -> pool final answer
```

This is the part that separates Graph of Agents from a simple mixture. The communication pattern is constructed at test time from the agents' own outputs.

## Direction matters

The most useful intuition is that messages should not move symmetrically.

High-relevance answers first guide lower-relevance agents. Then the lower-relevance agents, after absorbing that guidance, can send updated information back. In other words, the graph has a directional refinement loop.

The paper's ablations suggest that reversing this direction hurts. That makes sense. If weaker or less relevant answers steer the stronger ones too early, collaboration becomes contamination.

The lesson is not "let agents talk more." The lesson is "control who gets to influence whom, and when."

## Pooling is a design choice too

The final answer still needs aggregation. Graph of Agents tests pooling variants such as mean and max. That detail is easy to skip, but it matters because pooling expresses a trust policy.

Mean pooling says the group signal matters. Max pooling says the strongest signal may be enough. A production system might need more explicit policies:

| Pooling policy | When it fits |
| --- | --- |
| Mean-like | broad reasoning where several partial views help |
| Max-like | domains where one specialist may dominate |
| Verifier-weighted | tasks with an external checker |
| Human-gated | high-risk outputs or unclear disagreement |

The graph is only useful if the final decision rule matches the task.

## My takeaway

Graph of Agents is a useful paper because it reframes multi-agent design from "more agents" to "adaptive topology."

The reusable pattern is:

```text
select fewer agents
score relevance
direct information flow
pool with a task-appropriate policy
```

This is also a good caution for agent builders. A six-agent system with a fixed all-to-all chat can be weaker, slower, and more expensive than a three-agent system with the right communication structure.

[Paper](https://arxiv.org/abs/2604.17148) | [Code](https://github.com/UNITES-Lab/GoA/tree/main)
