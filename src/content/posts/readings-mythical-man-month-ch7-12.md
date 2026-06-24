---
title: 'The Mythical Man-Month, Chapters 7-12: coordination is the product'
date: '2026-06-09'
overview: >-
  TLDR: Chapters 7-12 make one old lesson feel new again: large software fails when coordination, budgets, documents,
  prototypes, and tools are treated as secondary work. Agent systems inherit the same constraints.
description: >-
  TLDR: Chapters 7-12 make one old lesson feel new again: large software fails when coordination, budgets, documents,
  prototypes, and tools are treated as secondary work. Agent systems inherit the same constraints.
math: true
toc: true
relatedPosts: false
tags:
  - mythical-man-month
  - software-engineering
categories:
  - reading
  - systems
---

<!-- notion-sync: 37a4e07a-a023-80a7-b4f5-c931cff627f8 parent=Readings url=https://app.notion.com/p/37a4e07aa02380a7b4f5c931cff627f8 -->

The tempting modern reading of *The Mythical Man-Month* is: "Brooks was warning us that adding people late makes projects slower." That is true, but it is too small.

Chapters 7-12 are really about the parts of engineering that do not look like coding: shared language, estimation, resource budgets, documentary control, prototype discipline, and common tools. Those parts sound managerial until they are missing. Then they become the project.

This is why the chapters still feel useful for agent systems. A coding agent can make a local change faster than a human. It cannot automatically make the whole organization clearer.

## The Babel failure

Brooks uses the Tower of Babel as an engineering failure: not a lack of ambition, material, labor, or time, but a failure of communication and organization.

The agent version is easy to imagine:

- the planner asks for an API change;
- the coder renames a field from `source` to `uri`;
- the test agent only checks the local module;
- the docs agent keeps writing the old contract;
- downstream callers break even though every agent reports success.

The problem is not that the agents are weak. The problem is that the system has no shared contract, no change propagation path, and no owner for the interface.

Agent orchestration is therefore communication design before it is task decomposition. Natural language messages are useful, but they are not enough. Multi-agent systems need schemas, typed tool contracts, interface versions, trace links, changelogs, and ownership.

## Estimation is not code generation time

Brooks pushes back against estimating a large system from small-program experience. Coding is only part of the work. Planning, documentation, testing, integration, training, and communication consume the rest.

The same mistake shows up when we estimate agent work by asking, "How long will the model take to write the patch?"

For a production change, the real unit is larger:

```text
accepted diff
  + passing evals
  + review cost
  + migration risk
  + rollback path
  + security boundary
  + monitoring and debugging cost
```

An agent may reduce the local typing and search cost, but the system still pays for integration. The bigger the cross-service, cross-data, or cross-permission surface, the less useful "lines generated per minute" becomes.

## The five-pound sack is now context

Chapter 9 talks about space budgets. The point is not nostalgia for small machines. The point is that every scarce resource needs a system-level budget.

In agent products, the five-pound sack is no longer only memory. It is also:

| Budget | Common failure |
| --- | --- |
| Context window | every module adds "just a little" more text |
| Token cost | self-checks, retries, and traces multiply silently |
| Latency | tool calls accumulate across agents |
| Attention | users receive too much explanation to act |
| Maintenance | prompts, tools, and schemas drift separately |

The dangerous version is not one obviously wasteful module. It is five reasonable modules, each adding one reasonable thing, until the workflow becomes slow, noisy, and hard to reproduce.

That makes compression, caching, data representation, and call boundaries architectural decisions. A prompt tweak cannot fix a system with no resource control plane.

## Documents as control surfaces

Brooks' "documentary hypothesis" sounds dry until you reinterpret it as a control problem. A project has too many facts for everyone to keep in memory. The job of documents is to make a small number of decisions explicit enough to inspect, update, and share.

For an agent platform, the critical documents are usually not long wikis. They are short, hard artifacts:

- product goal;
- architecture contract;
- tool registry;
- eval plan;
- release checklist;
- cost budget;
- owner map;
- incident and replay policy.

These documents should be useful to both humans and agents. That means they should be structured, versioned, searchable, and tied to tests or schemas where possible.

Documentation is not a side channel. It is how the system remembers what the chat history forgot.

## Throw one away on purpose

The famous lesson of Chapter 11 is that the first system should usually be thrown away. The danger is not writing a prototype. The danger is pretending the prototype is the product.

This is especially important for agent workflows. A first version often hard-codes prompts, tool calls, memory schema, retries, and evaluation logic into one loop. After a few weeks, the team learns that:

- the planner over-splits tasks;
- the retriever injects noise;
- the test agent misses real failures;
- memory contaminates the next run;
- traces are too weak for debugging.

At that point, patching may be more expensive than rewriting the loop around what was learned.

The healthy move is to label the throwaway parts early: prompt format, memory schema, trace format, eval set, tool protocol, and orchestration policy. Prototypes should produce knowledge, not permanent debt.

## Sharp tools are shared tools

Brooks also argues against every programmer maintaining a private toolbox. In a large project, private tools increase friction because the team loses comparability.

The agent version is sharper. If every engineer uses a different prompt library, sandbox, test command, local memory, and replay convention, agent-generated diffs stop being comparable. There is no shared notion of "done."

A serious agent toolchain needs common infrastructure:

```text
sandbox
test runner
dependency scanner
trace viewer
eval dashboard
fixture library
permission model
replay mechanism
rollback path
```

The toolsmith becomes more important, not less. The toolsmith is defining what the agents can safely do, how failures are reproduced, and what evidence counts as progress.

## What still survives

The dated parts of the book are machine prices, job titles, and some tool shapes. The durable part is the systems lesson:

```text
programmer coordination -> agent orchestration
manual review -> eval, CI, trace
architecture handbook -> executable contract
late manpower -> late agent swarm
space budget -> token, latency, context budget
pilot system -> throwaway agent prototype
tool room -> shared sandbox, replay, eval harness
```

The chapters do not say that modern teams should copy Brooks' organization. They say something more basic: implementation speed is not delivery speed.

Agent coding makes local implementation cheaper. It does not remove the need for communication, estimation, budgets, documents, prototypes, and tools. In many cases, it makes those constraints more visible, because more work can now be produced before anyone notices that the system has no shared shape.
