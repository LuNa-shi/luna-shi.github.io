---
title: 'Anthropic Blogs: harness engineering and context engineering'
date: '2026-05-13'
overview: >-
  The shared lesson across these Anthropic engineering posts is that long agent tasks fail at the runtime layer:
  context, evaluation, sandboxing, permissions, handoff, and feedback have to be engineered.
description: >-
  A reading synthesis of Anthropic engineering posts on context reset, generator/evaluator loops, managed agents,
  sandboxing, credential boundaries, and harness design.
tags:
  - readings
categories:
  - reading
  - research
math: true
toc: true
relatedPosts: false
---

<!-- notion-sync: 3424e07a-a023-8070-b2e1-f2c5c55f26ea parent=Readings url=https://app.notion.com/p/3424e07aa0238070b2e1f2c5c55f26ea -->

## One shared lesson

Across these Anthropic engineering posts, the theme is not "make the model think harder."

The theme is:

> Long agent tasks need a runtime, not just a prompt.

Context can drift. Evaluators can praise bad work. Sandboxes can leak authority. Tools can expose credentials. Handoffs can lose the real objective. The useful work is harness engineering.

## Context reset is not forgetting

Long tasks degrade as the context fills. Some models also show a kind of context anxiety: once they sense the window is nearly full, they start wrapping up too early.

Context reset is a runtime answer:

```text
old agent context
    -> structured handoff
    -> fresh agent
    -> continuation from compressed state
```

The goal is not to throw away history. It is to compress history into a better working entry point.

That is the distinction:

```text
raw history  = everything that happened
handoff      = what the next agent needs to continue
```

## Evaluators need standards

An evaluator that only asks "is this good?" will drift.

A better evaluator asks against concrete principles:

```text
Does this follow the design rules?
Does it satisfy the task constraints?
Does the page actually work?
Does the output provide evidence?
What failed the rubric?
```

For frontend or artifact work, the evaluator should not only read text. It should use tools: open the page, interact, inspect screenshots, check layout, and score each criterion.

The loop becomes:

```text
planner -> generator -> tool-using evaluator -> revised generator
```

The harness creates the feedback that the model alone cannot reliably invent.

## Managed agents split brain, hands, and memory

The managed-agent architecture is useful because it separates roles that are easy to blur.

| Component | Owns | Should not own |
| --- | --- | --- |
| Session | Append-only event log, audit, recovery | Context-selection policy |
| Harness / brain | Agent loop, model calls, tool routing, context engineering | Long-lived credentials or sandbox resources |
| Model | Reasoning, planning, tool selection | Direct infrastructure access |
| Sandbox / hands | Code execution, file edits, commands | Main agent state or global credentials |
| Tool proxy | External service calls | Exposing tokens to model or sandbox |
| Credential vault | Secrets | Generated code or raw context |

The sentence I want to keep:

> Session is not context.

Session is durable history. Context is a runtime view built from that history.

## Security boundary

The security story is also a runtime story. The model, harness, and sandbox should not all receive the same authority.

![Managed agent boundary](/assets/img/notion/readings-anthropic-blogs-01.webp)

External service credentials should live behind a proxy and vault. The agent can request an action; the proxy executes with scoped credentials; the model receives only the result it needs.

This prevents a generated script, untrusted web page, or accidental log dump from inheriting broad OAuth tokens.

## The pattern I would reuse

For long-horizon agents:

```text
1. Keep a durable event log.
2. Build context views from that log.
3. Reset context through structured handoff.
4. Use tool-enabled evaluators.
5. Separate brain, hands, and credentials.
6. Treat sandbox provisioning as a runtime resource.
7. Design logs and tool outputs for the model that will read them.
```

## My takeaway

Harness engineering is the practical form of agent alignment at runtime.

It decides what the model sees, what it can do, how it gets feedback, how it recovers, and what authority it never receives. Prompting matters, but the durable leverage is in the loop around the model.
