---
title: 'Building a C compiler with agent teams'
date: '2026-05-13'
overview: >-
  The C compiler experiment worked because the project had the right substrate for agents: a modular architecture,
  objective tests, Git as shared memory, task locks, readable logs, and oracles that turned one giant goal into many
  local failures.
description: >-
  A reading note on Anthropic's multi-agent C compiler experiment, focused on why Git, tests, task locks, logs, and
  verifier design mattered more than agent chat.
math: true
toc: true
relatedPosts: false
tags:
  - compiler-agents
  - multi-agent-systems
categories:
  - reading
  - agents
---

<!-- notion-sync: 3524e07a-a023-801e-b99b-cabbe0723411 parent=Readings url=https://app.notion.com/p/3524e07aa023801eb99bcabbe0723411 -->

## The mistaken lesson

The shallow lesson is:

```text
Run many coding agents in parallel.
Get a huge software project.
```

That is not what makes the experiment interesting.

The real lesson is that the project turned a giant goal - build a C compiler capable of compiling large real software - into a feedback-rich environment where agents could find, claim, fix, test, merge, and continue thousands of small tasks.

The agents did not need a fancy group chat. They needed a substrate.

## The system shape

The harness was simple:

```text
many Claude Code sessions
    -> local repo clones in isolated environments
    -> shared upstream Git repo
    -> task files as locks
    -> tests as judge
    -> README/progress files as memory
```

Git was the shared workspace. `current_tasks/` was the coordination layer. Tests were the authority. Logs were the communication medium.

This matters because it reframes multi-agent collaboration:

> Collaboration did not happen mainly through conversation. It happened through shared state.

## Git as blackboard

The project behaves like a blackboard architecture.

```text
code       -> current implementation
Git log    -> who changed what
task files -> what is currently claimed
tests      -> what is broken
docs       -> what later agents need to know
logs       -> what failed and why
```

An agent can enter a fresh container, read the repo, inspect failures, claim a task, make a patch, run tests, merge, and push. The next agent inherits the new world through Git, not through private memory.

That is much more robust than asking agents to remember a group conversation.

## Task locks as minimal scheduling

The task mechanism is deliberately low-tech. To claim work, an agent writes a file under `current_tasks/`.

```text
current_tasks/fix-arm-casp-instruction.txt
current_tasks/fix-x86-kernel-link-errors.txt
current_tasks/implement-string-literal-deduplication.txt
```

If two agents claim the same task, Git conflict becomes the scheduler. The losing agent backs off and picks another task.

That is crude, but it works because the unit of work is concrete:

- fix one assembler instruction;
- repair one relocation expression;
- handle one ABI edge case;
- add one regression test;
- improve one compiler pass.

The system succeeds when the giant task keeps breaking into independently testable failures.

## Why compilers fit this pattern

A C compiler is a good target for agent teams because the architecture has natural layers:

```text
C source
  -> preprocessor
  -> lexer
  -> parser
  -> semantic analysis
  -> IR lowering
  -> optimization passes
  -> backend
  -> assembler
  -> linker
  -> executable
```

That gives agents boundaries. One agent can work on macro expansion while another works on ARM assembly or linker expressions.

Even better, compiler correctness has external signals:

| Signal | Use |
| --- | --- |
| Unit tests | Check small compiler components |
| Integration tests | Compile and run C programs |
| GCC/Clang | Provide behavior or build oracle |
| Open-source projects | Stress real code paths |
| Linux build | Ultimate integration target |

The project had a real hill to climb because the tests exposed gradients.

## The verifier is the boss

The most important design sentence is:

> The agent loop is useful only when the agent can tell whether it made progress.

For this project, the verifier is more authoritative than another LLM. A patch that sounds plausible but fails tests is not progress.

The control loop is:

```text
test failure
    -> agent reads targeted log
    -> agent claims one task
    -> agent patches code
    -> agent runs fast tests
    -> CI protects regressions
    -> merged state becomes next starting point
```

This is why logs must be written for agents. Long noisy logs pollute context. Good logs summarize the failure, keep details on disk, and make important lines grep-friendly.

## When parallelism disappeared

Parallelism worked while there were many independent failures. It weakened when the Linux kernel build became one giant earliest-failure bottleneck. Every agent hit the same wall.

The fix was not "add more agents." The fix was to redesign the verifier.

Use GCC as a known-good oracle:

```text
compile most files with GCC
compile a sampled subset with the new compiler
link and test
if it fails, shrink the subset
repeat until a file or interaction is isolated
```

That turns one monolithic failure back into many local tasks.

This is the deepest lesson of the post:

> When a task stops being parallel, change the feedback structure before adding agents.

## Roles beyond coding

Not every agent should write features.

Useful roles include:

| Role | Job |
| --- | --- |
| Bugfix agent | Repair failing tests or projects |
| Regression agent | Preserve old behavior |
| Refactor agent | Merge duplicated implementations |
| Performance agent | Improve compiler speed or generated code |
| Documentation agent | Keep progress and design notes usable |
| Review agent | Attack architecture and consistency |

The project did not need a perfect central scheduler to benefit from specialization. It needed enough shared state for these roles to avoid fighting each other.

## What is reusable

To reproduce this kind of multi-agent project, the important checklist is:

```text
choose a target with objective verification
make failures small and claimable
use Git or files as durable shared memory
write logs for machine readers
add fast deterministic test subsets
protect progress with CI
assign some agents to quality, docs, and refactoring
redesign the verifier when parallelism collapses
```

## My takeaway

The upper bound of a multi-agent software system is not the number of agents. It is whether the task can be verified, decomposed, isolated, and fed back into the next iteration.

The C compiler experiment is exciting because it shows that agent teams can scale when the environment is built for them. It is also a warning: without tests, oracles, logs, and human-designed feedback, autonomous code can look busy while drifting away from correctness.
