---
title: 'Heuristic Learning: maintaining a learning system in code'
date: '2026-05-21'
overview: >-
  TLDR: Heuristic Learning treats iterative agent work as maintaining a verifiable software system. Feedback updates
  code, tests, rules, state representations, and memory rather than neural network weights.
description: >-
  TLDR: Heuristic Learning treats iterative agent work as maintaining a verifiable software system. Feedback updates
  code, tests, rules, state representations, and memory rather than neural network weights.
math: true
toc: true
relatedPosts: false
tags:
  - heuristic-learning
  - learning-systems
categories:
  - reading
  - systems
---

<!-- notion-sync: 3674e07a-a023-8075-8242-f7df546ecb44 parent=Readings url=https://app.notion.com/p/3674e07aa02380758242f7df546ecb44 -->

After working with coding agents for a while, I needed a name for a pattern that was not quite reinforcement learning and not just manual programming.

I started calling it **Heuristic Learning**.

The loop is familiar: state, action, feedback, update. The difference is the update target. Deep RL updates neural network parameters. Heuristic Learning updates a software system: code, state detectors, rules, tests, evaluators, configuration, memory, and documentation.

## The object being maintained

A single heuristic is not enough. A heuristic becomes useful when it belongs to a system that can absorb feedback and preserve what worked.

I call that object a **Heuristic System**.

It usually contains:

- a programmatic policy;
- an explicit state representation;
- feedback channels such as tests, logs, rewards, videos, or replays;
- experiment records;
- memory of failures and fixes;
- an update mechanism, often executed by a coding agent.

The important point is connectivity. A rule, a replay, and a test have to meet. Otherwise the system learns once and then forgets the reason.

## How it differs from Deep RL

The comparison is useful because the surface loop looks similar.

| Axis | Deep RL | Heuristic Learning |
| --- | --- | --- |
| Policy | neural network parameters | code, rules, state machines, controllers, macro-actions |
| State | observations and learned representations | explicit variables, detectors, caches, typed state |
| Action | neural network forward pass | executable logic or tool calls |
| Feedback | mostly reward signals | tests, logs, replays, environment feedback, human judgment |
| Update | gradient-based training | direct edits by a coding agent or human |
| Memory | replay buffers or hidden weights | trials, summaries, failures, replays, version diffs |

This does not make Heuristic Learning better in every domain. It makes it attractive when the environment is inspectable and verification is cheap enough to run repeatedly.

## Why it is worth doing now

Before coding agents, many heuristic systems were too annoying to maintain. They accumulated special cases, stale comments, weak tests, and forgotten context.

Agents change the cost curve. They can read logs, edit code, add tests, simplify rules, and compare behavior across runs. That makes a new class of explicit heuristic systems worth owning.

The benefits are practical:

- **Explainability**: policies can often be translated into ordinary language.
- **Sample efficiency**: one good code edit can jump to a better policy immediately.
- **Regression testing**: old wins can become tests, replays, or golden cases.
- **Constrained overfitting**: multi-seed checks and simplification act as engineering regularization.
- **Less forgetting**: capabilities can live in tests and rules, not only in weights.

The risk is also practical. A heuristic system can overfit to seeds, exploit test loopholes, or become an unreadable pile of patches. That is why compression is part of learning.

## The minimum healthy loop

A healthy Heuristic System needs two repeated operations:

```text
absorb feedback
  -> write failures, rewards, logs, and replays back into the system

compress history
  -> fold local patches into simpler rules, tests, and representations
```

Without absorption, the system does not learn. Without compression, it becomes unmaintainable.

## A small example

Imagine an agent controlling a browser workflow. The first version fails when a modal appears. A coding agent adds a rule: close the modal if it exists. Later, another failure shows that the modal is sometimes a login prompt that should not be closed.

A weak system keeps both patches as special cases.

A stronger Heuristic System adds:

- a state detector for modal type;
- a replay for each failure;
- a test that distinguishes dismissible overlays from authentication gates;
- a policy rule that acts only after classification;
- a note explaining why the rule exists.

The system did not update weights. It still learned.

## My takeaway

Heuristic Learning turns continual learning into a software maintenance problem:

```text
What can be verified can often be improved.
What can be improved should be compressed.
What is compressed becomes reusable practice.
```

This is one of the reasons coding agents feel powerful. They do not only write code. They can help maintain the loop that turns repeated failure into a readable, testable system.
