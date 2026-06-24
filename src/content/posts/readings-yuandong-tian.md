---
title: 'Yuandong Tian talks: search quality is action-space quality'
date: '2026-05-22'
overview: >-
  TLDR: More rollouts are not enough. Search becomes powerful when the action space, representation, evaluator, and
  memory make good trajectories easier to find.
description: >-
  TLDR: More rollouts are not enough. Search becomes powerful when the action space, representation, evaluator, and
  memory make good trajectories easier to find.
math: true
toc: true
relatedPosts: false
tags:
  - search
  - research-methods
categories:
  - reading
  - research
---

<!-- notion-sync: 3674e07a-a023-80d7-86aa-ec175675ff65 parent=Readings url=https://app.notion.com/p/3674e07aa02380d786aaec175675ff65 -->

The shallow lesson from search is "try more things."

The stronger lesson is that search quality depends on the shape of the action space. If the representation is bad, more rollouts mostly explore bad neighborhoods faster. If the representation is good, search can become sample-efficient, interpretable, and surprisingly strong.

That is the through-line I take from Yuandong Tian's talks.

## Search needs a shape

AlphaZero works partly because board games give search a clean structure. The rules define legal moves, states are inspectable, and rollouts can be evaluated through a stable game objective.

Many real optimization problems do not arrive with that gift. LaMCTS is interesting because it learns how to partition the search space. Learning Beyond Gradients is interesting because it treats coding agents as systems that search over heuristic programs, not just answers.

The common pattern is:

```text
better representation
  -> better local moves
  -> better search
  -> better learning from feedback
```

When the action space is too weak, the right move is often not "sample more." It is "change the abstraction."

## What this means for coding agents

A coding agent can search in several spaces:

- text responses;
- patches;
- tool-call sequences;
- tests;
- state machines;
- controllers;
- memory records;
- eval definitions;
- environment generators.

The mistake is to keep the agent in the smallest space and expect intelligence to compensate. If a task needs a macro-action, a state graph, a replay, or an evaluator, then "write the next patch" is the wrong action space.

This is where recursive self-improvement becomes concrete. A self-improving system should not only improve the current answer. It should improve the representation that future searches use.

## Metaproductivity

The most useful word here is `metaproductivity`.

Current performance and improvement potential are not the same thing. A system can do well on today's benchmark while leaving no reusable structure for tomorrow. Another system may produce a modest immediate gain but create a better evaluator, controller, abstraction, or memory format that makes future improvement easier.

That distinction matters for agent research. We should track not only direct task gain, but also whether a change improves the next round of search.

## A context pattern worth saving

Here is a schema I would use to preserve agent experience as searchable, testable objects:

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

The important field is not just `direct_gain`. It is `metaproductivity`: does this object make future improvement easier?

## Reading path

The talks page is the best starting point:

- [Yuandong Tian's talks](https://yuandong-tian.com/talks/)
- [MIT NLP talk](https://yuandong-tian.com/talks/talk_mit_nlp.pdf)
- [EIT talk](https://yuandong-tian.com/talks/talk_eit.pdf)
- [Recursive Self-Improvement Workshop](https://recursive-workshop.github.io/)
- [RSI workshop talk](https://yuandong-tian.com/talks/rsi_workshop.pdf)

## My takeaway

Search is not only an algorithmic budget. It is an interface to a space of possible actions.

For agent systems, the most important improvements may come from designing better spaces to search: richer actions, clearer state, stronger evaluators, reusable memory, and abstractions that increase future learning speed.

[Annotated notes](https://app.notion.com/p/3684e07aa02380169547f2c1b7b7f36c)
