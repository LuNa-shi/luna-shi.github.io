---
title: 'Claude Code Source: an agent as an operating-system process'
date: '2026-05-13'
overview: >-
  Reading Claude Code through an operating-system lens makes the agent runtime concrete: context preparation, tools,
  permissions, subprocesses, cancellation, compaction, plugins, and exit paths.
description: >-
  A source-reading note that treats Claude Code as an agent process with filesystem, tool-call, permission, and context
  management boundaries.
math: true
toc: true
relatedPosts: false
tags:
  - claude-code
  - agent-runtime
categories:
  - reading
  - systems
---

<!-- notion-sync: 3414e07a-a023-809f-8b9d-e5c4c2151d32 parent=Readings url=https://app.notion.com/p/3414e07aa023809f8b9de5c4c2151d32 -->

## The useful lens

The phrase "the model uses tools" is too soft.

Claude Code becomes easier to reason about if I treat it as an agent process running in a local operating environment:

```text
model reasoning
    -> runtime prepares context
    -> model requests tool calls
    -> runtime checks permissions
    -> tools touch files, commands, plugins, and subprocesses
    -> results return to context
    -> loop exits, compacts, or continues
```

This lens makes the hidden substrate visible.

## Agent as process

An agent runtime has to manage ordinary process-like concerns.

| OS-like concern | Agent-runtime version |
| --- | --- |
| Process lifecycle | Start, wait, cancel, resume, stop |
| Filesystem | Source files, diffs, temporary files, notes, logs |
| Permissions | What commands, files, domains, and tools are allowed |
| Plugins | Extra capabilities loaded through plugins, MCP, or tool discovery |
| Syscalls | Tool calls are requests to the runtime to act on the world |
| Signals | User interruption, budget limits, fatal errors |

The model does not directly change the world. It asks the runtime to do so.

## The agent loop

A simplified loop looks like this:

```text
prepare messages
    -> call model
    -> inspect result
    -> if tool call:
           check permission
           run tool
           append tool result
           continue
       else:
           produce final answer
           stop
```

That loop has more exit paths than "answer is done."

| Exit | Trigger | Where it appears |
| --- | --- | --- |
| Normal completion | No tool call or final response ready | Result handling |
| Budget boundary | Token, cost, or turn budget | Model call / runtime accounting |
| User interruption | UI cancel or signal | Any cooperative boundary |
| Fatal error | Tool failure, compaction failure, invalid state | Preparation or result handling |

The runtime needs all of these from the start. If only normal completion is designed, every other boundary becomes an awkward exception.

## Prompt and tool safety

The system prompt is not one static blob. It has stable policy and dynamic environment context.

```text
static layer:
    long-term behavior, authority, safety boundaries

dynamic layer:
    current tools, repo state, budget, task state, environment facts
```

Tools also have semantics. A tool is not only a function signature. It has discovery text, permission requirements, input/output shaping, and safety checks.

The syscall analogy helps:

```text
model: I want to run this action
runtime: Is it allowed? How should it execute? What result is safe to return?
```

## Context engineering

Context is not the same as session history.

The runtime may have durable events, files, logs, and notes, but the model sees only a shaped context window. That makes context engineering a core runtime job.

Three operations matter:

| Operation | Purpose |
| --- | --- |
| Structured pruning | Keep task-critical fields and remove irrelevant detail |
| Compaction | Replace old raw context with a high-recall continuation summary |
| Handoff | Compress an old phase into a stronger state snapshot for the next phase |

For coding agents, a good continuation summary should preserve:

```text
intent
constraints
files read
files modified
errors
tests run
open questions
next action
```

The point is not to summarize beautifully. The point is to make the next action possible.

## Notes and subagents

Two practices matter beyond compaction.

First, write notes into the filesystem when they must survive context churn. A `NOTES.md`, plan file, or progress log can be more reliable than asking the model to remember.

Second, use subagents for bounded exploration. A main agent can hold the goal and delegate a narrow investigation to another context, then consume only the distilled result.

That pattern protects the main context:

```text
main agent keeps objective and synthesis
subagent burns context on local exploration
summary returns
```

## My takeaway

Claude Code-like systems are not just prompt wrappers. They are agent processes with runtime responsibilities:

- prepare context;
- route tool calls;
- enforce permissions;
- handle cancellation;
- compact history;
- expose plugins;
- keep enough state to continue;
- exit honestly when a boundary is reached.

The operating-system lens is useful because it turns a vague "AI agent" into something inspectable: process, state, tools, permissions, and syscalls.
