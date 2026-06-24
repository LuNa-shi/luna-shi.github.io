---
title: 'Dynamic Workflows: from prompt to runtime'
date: '2026-06-06'
overview: >-
  Dynamic Workflows reframes long-horizon agent work as runtime synthesis: split context, externalize state, verify
  intermediate outputs, and let the harness carry the parts a single prompt cannot reliably hold.
description: >-
  A reading note on Dynamic Workflows as an agent-system design pattern rather than a Claude Code feature note.
math: true
toc: true
relatedPosts: false
tags:
  - agent-runtime
  - workflows
categories:
  - reading
  - agents
---

<!-- notion-sync: 3774e07a-a023-8017-897a-cec0c6080c93 parent=Readings url=https://app.notion.com/p/3774e07aa0238017897acec0c6080c93 -->

Anthropic's Dynamic Workflows are easy to describe as a product feature: Claude Code can generate a temporary workflow and use subagents to complete a task.

The more interesting reading is architectural. Dynamic Workflows point to a general agent-system pattern:

> Generate a task-specific orchestration layer at runtime, then let that layer manage decomposition, parallelism, state, verification, retries, and synthesis.

That changes the diagnosis of long-horizon agent failure. The problem is often not that the model cannot reason at all. The problem is that the execution organization is too soft:

```text
one context
  owns the goal
  remembers the plan
  calls tools
  tracks progress
  verifies itself
  decides when to stop
```

For long tasks, that is too much responsibility for one context window.

## Core idea

Dynamic Workflow is a kind of **online workflow synthesis**. A natural-language task is compiled into a temporary execution graph.

That graph may include:

- workers for independent shards;
- verifiers for adversarial checks;
- classifiers for routing;
- judges for pairwise comparison;
- synthesizers for merging structured results;
- stop-condition checks for deciding when the work is actually done.

The important shift is this:

```text
plan hidden in the model's context
        ->
plan represented in runtime state
```

Once the plan is represented outside the model, the system can schedule it, inspect it, replay parts of it, and refuse to finish until explicit conditions are met.

## What failures does this address?

Dynamic Workflows mainly help with three failure modes.

| Failure | What happens | Workflow countermeasure |
| --- | --- | --- |
| Agentic laziness | The model stops after partial coverage because the answer feels complete | External task queue and coverage state |
| Self-preferential bias | The same context proposes and validates its own answer | Separate worker and verifier roles |
| Goal drift | Constraints disappear during long runs or compaction | Persist goal, rubric, budget, and stop conditions in workflow state |

The reliability gain comes from **context splitting**, **state externalization**, and **role separation**. A stronger model helps, but the harness is doing real work.

## Runtime components

A generalized Dynamic Workflow system needs at least these pieces:

| Component | Responsibility | Design pressure |
| --- | --- | --- |
| Workflow generator | Turn the task into an executable graph | It must produce structure, not just a prose plan |
| State store | Keep tasks, artifacts, decisions, and dependencies | State should not live only in chat history |
| Scheduler | Decide what can run now and what must wait | Needs fan-out, barriers, retries, and loops |
| Agent router | Assign model, role, tools, and context slice | Roles should have different permissions |
| Verification layer | Check schemas, evidence, tests, and counterclaims | Correctness cannot be pure self-report |
| Synthesizer | Merge verified artifacts | It should consume structured outputs, not vibes |

My favorite rule from this pattern:

> Let LLMs make local judgments. Let the runtime carry global control.

![Dynamic workflow overview](/assets/img/notion/readings-dynamic-workflows-agent-runtime-01.webp)

## Static vs dynamic workflow

Static workflows are designed before the task arrives. They are best for repeated work with stable inputs.

Dynamic workflows are generated when the task arrives. They are best for one-off work where the structure is part of the problem.

| Dimension | Static workflow | Dynamic workflow |
| --- | --- | --- |
| Creation time | Designed ahead of time | Generated per task |
| Best fit | Stable production pipeline | Exploratory long-horizon task |
| Reliability source | Human design and regression tests | Task-specific decomposition plus verification |
| Main risk | Too rigid | Expensive and harder to reproduce |
| Long-term value | Durable automation | Workflow discovery |

The bridge between them is important: dynamic workflows can discover reusable patterns. Once a generated workflow proves useful repeatedly, it should become a static workflow, skill, or template.

## Patterns I want to reuse

### Fan out and synthesize

Use this for coverage tasks: code review, migration, documentation audit, source collection, or claim checking.

```text
shard -> independent workers -> barrier -> structured synthesis
```

The value is not "many agents." The value is isolated local context and explicit coverage.

### Adversarial verification

Use this for high-stakes claims. The verifier's job is not to polish the worker's answer. It is to attack it.

Good verifier input should include:

- the claim;
- source evidence;
- confidence;
- what would falsify the claim;
- unresolved doubts.

### Tournament or generate-and-filter

Use this for judgment-heavy tasks such as names, designs, architecture options, or research hypotheses. Pairwise comparison is often more stable than absolute scoring.

### Loop until done

Use this for unknown-duration tasks such as flaky test reproduction or root-cause investigation. The hard part is the stop condition:

```text
no new high-severity finding
all claims have sources
tests pass N times
all shards have verified output
```

Without a hard stop condition, a loop only amplifies subjective convergence.

### Classify and act

Use this for queues: bug reports, alerts, support tickets, user feedback, or document collections.

For untrusted input, the classifier and actor should be separated. The component that reads arbitrary web or user content should not also get high-permission actions by default.

## Where this is worth the cost

Dynamic Workflows are expensive. I would reserve them for tasks where execution organization is itself the bottleneck.

| Scenario | Why it fits |
| --- | --- |
| Large codebase review | Coverage, sharding, and verification matter more than one long answer |
| Deep research | Sources can be collected independently, then reconciled |
| Technical blog verification | Claims can be extracted and checked one by one |
| Root-cause investigation | Competing hypotheses need disjoint evidence |
| Memory mining | Past corrections can be clustered, tested, and promoted into rules |
| Agent evaluations | Trajectories need failure attribution, not just final scores |

![Verification workflow](/assets/img/notion/readings-dynamic-workflows-agent-runtime-05.webp)

For this blog project, the most relevant application is **deep verification**. A polished technical post can still contain unsupported claims. A workflow that extracts claims, assigns verifiers, and returns evidence would be a strong writing assistant.

## Costs and limits

Dynamic Workflow is not free infrastructure magic.

- It spends more tokens and tool calls.
- Generated workflows are harder to regression-test than static pipelines.
- Worker and verifier errors can be correlated if they share the same model and evidence.
- Synthesis can erase minority signals unless conflicts are represented explicitly.
- Permission boundaries must be designed, especially around code edits, browsers, email, Slack, and untrusted web pages.

The pattern is useful because it makes these costs visible. A single prompt hides them.

## My takeaway

The future of agent systems will not be only model intelligence. It will also be harness intelligence.

Dynamic Workflows matter because they move agent work from "try hard inside one context" toward "create a temporary execution system for this task."

If prompt engineering asks how to make one model answer better, workflow engineering asks how models, tools, state, and verification should be organized so the system can finish work that one context cannot safely hold.

## References

- Anthropic, _A harness for every task: dynamic workflows in Claude Code_.
- Anthropic, _Introducing dynamic workflows in Claude Code_: <https://claude.com/blog/introducing-dynamic-workflows-in-claude-code>
