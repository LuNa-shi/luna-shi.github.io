---
title: Heuristic Learning
date: '2026-05-21'
overview: >-
  TLDR: Heuristic Learning frames iterative agent work as maintaining a living heuristic system, where patches, rules,
  and code are compressed into reusable practice.
description: >-
  TLDR: Heuristic Learning frames iterative agent work as maintaining a living heuristic system, where patches, rules,
  and code are compressed into reusable practice.
tags:
  - readings
categories:
  - reading
  - systems
math: true
toc: true
relatedPosts: true
---

<!-- notion-sync: 3674e07a-a023-8075-8242-f7df546ecb44 parent=Readings url=https://app.notion.com/p/3674e07aa02380758242f7df546ecb44 -->

After more iteration with Codex, I started calling this process **Heuristic Learning (HL)**:

- HL is built out of program code.

- Like Deep RL as commonly practiced today, it has a loop of state, action, feedback, and update; unlike that setup, the object being updated is software structure rather than neural-network parameters.

- Its feedback is consumed by a coding agent, and can come from environment reward, test cases, logs, videos, replays, or human feedback.

- Its updates do not use backpropagation. The coding agent directly edits policies, state detectors, tests, configuration, or memory.

- HL is the learning and update process. The object maintained by HL over time can be called a **Heuristic System (HS)**.

- An HS is more than an isolated `policy.py`. It contains at least a programmatic policy, state representation, feedback channels, experiment records, replays or tests, memory, and an update mechanism executed by a coding agent. A single rule is not enough. Rules, feedback, history, and the next update path all need to connect before it becomes an HS.

As a table:

| Axis     | Deep RL                                                                       | HL                                                                                              |
| -------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Policy   | Neural network parameters                                                     | Code: rules, state machines, controllers, MPC, macro-actions                                    |
| State    | Usually explicit observations                                                 | Usually explicit variables, detectors, caches, and other readable representations               |
| Action   | Produced by a neural network forward pass                                     | Produced by executing code logic                                                                |
| Feedback | Mainly fixed reward                                                           | Provided through coding-agent context: tests, environment feedback, logs, and replays all count |
| Update   | Gradient-based updates to neural-network parameters in a Deep RL algorithm    | Direct code edits by a coding agent                                                             |
| Memory   | On-policy methods basically have none; off-policy methods have replay buffers | Can explicitly store trials, summaries, failure reasons, replays, and version diffs             |

Heuristic Learning has several useful properties compared with Deep RL:

- Explainability: neural networks are hard to explain, while HL policies can often be translated into plain language.

- Sample Efficiency: one effective code update can jump directly to a new policy, rather than slowly climbing through learning-rate tuning.

- Regression-testability: old capabilities can become tests, replays, or golden cases.

- Overfitting can be constrained: code heuristics can still overfit to seeds, environment details, or test loopholes, but simplification, regression checks, and multi-seed evaluation provide an engineering form of regularization.

- It can avoid part of catastrophic forgetting: old capabilities do not have to live only inside model weights; they can be written into rule sets and tests.

The point is that a class of heuristics that used to be too expensive to maintain may now be worth owning.

A healthy HS therefore needs at least two operations:

1. Absorb feedback: write new failures, logs, and rewards back into the system.

1. Compress history: fold local patches back into simpler, more maintainable representations.

That turns Continual Learning from "how do we update parameters?" into "how do we maintain a software system that keeps absorbing feedback?"

凡是可以验证的，都开始能被解决。
