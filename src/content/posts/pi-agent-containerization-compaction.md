---
title: 'Pi Agent: containerization and compaction'
date: '2026-06-04'
overview: >-
  Coding agents need two boundaries at the same time: an execution boundary that controls what they can do, and a
  context boundary that controls what they can remember across long work.
description: >-
  A systems note on Pi Agent containerization, compaction, branch summarization, and why coding-agent reliability depends
  on both sandboxing and continuation memory.
math: true
toc: true
relatedPosts: false
tags:
  - pi-agent
  - agent-runtime
categories:
  - agents
  - research
---

<!-- notion-sync: 3754e07a-a023-8012-aca8-e0ea5c13afb5 parent=Pi agents doc url=https://app.notion.com/p/3754e07aa0238012aca8e0ea5c13afb5 -->

> Source: Pi docs on containerization and compaction.

## The system shape

Coding agents are not chatbots with nicer prompts.

```text
chatbot:
    text in -> text out

coding agent:
    read files
    write files
    run commands
    call tools
    preserve task state
```

That creates two separate reliability problems:

| Problem | Boundary | Failure if missing |
| --- | --- | --- |
| The agent can act on the machine | Containerization | Host files, credentials, and processes are exposed |
| The agent must work for a long time | Compaction | The task loses memory when context fills up |

The short version:

```text
containerization controls what the agent can do
compaction controls what the agent can remember
```

## Containerization

The execution boundary answers:

```text
where does the agent run?
what filesystem can it see?
which commands can it execute?
which credentials are available?
what network access is allowed?
where do file edits land?
```

For a coding agent, these are not deployment details. They define the blast radius of every tool call.

## Three patterns

| Pattern | Shape | Best fit | Watch out for |
| --- | --- | --- | --- |
| OpenShell | The whole Pi process runs behind a policy gateway/sandbox | Strong isolation and centrally controlled runtime | Higher operational complexity |
| Gondolin extension | Pi stays on host, but built-in tools and shell commands run in a micro-VM | Keep local auth/config while isolating tool execution | Custom extensions may still run on host |
| Plain Docker | Pi runs inside a local container with mounted project files | Simple local isolation | Bind mounts still write to the host project |

The Docker pattern is the easiest to misunderstand:

```bash
docker run -v "$PWD:/workspace" ...
```

That mount means edits inside `/workspace` are real edits to the host project. If API keys or agent config are mounted too, the container boundary includes those credentials.

## Extension boundary

One detail matters a lot:

```text
extensions run wherever the Pi process runs
```

So in a Gondolin-like setup:

```text
built-in tools -> micro-VM
custom extensions -> maybe still host
```

Tool isolation is not the same thing as full extension isolation. A good sandbox model should say which code path owns each permission.

## Compaction

The memory boundary answers a different question: how can the agent continue after the conversation becomes too large?

Long coding sessions accumulate:

```text
messages
tool calls
tool results
file reads
file edits
test outputs
branch history
user corrections
```

Compaction replaces old raw context with a structured summary while keeping recent messages intact.

```text
before:
    [old messages][middle messages][recent messages]

after:
    [summary][recent messages]
```

The goal is not to create a pleasant human summary. The goal is to preserve enough task state for the agent to keep working.

## Safe cut points

Compaction should not slice blindly by token count.

Tool calls and tool results belong together. If the cut happens between them, the model may see a result without the command that produced it, or a command without the result.

Good cut points tend to be:

- user messages;
- assistant messages;
- completed command executions;
- branch summaries;
- custom state snapshots.

Bad cut points include the middle of a tool-result pair.

## Structured summaries

A continuation summary should look more like task state than prose:

```text
Goal
Constraints and preferences
Progress
Key decisions
Current blockers
Next steps

Read files:
  ...

Modified files:
  ...

Commands run:
  ...
```

For coding agents, file and command history are part of memory. Without them, the agent may repeat work or lose the reason a change exists.

## Branch summarization

Branch summarization solves a related problem. When a user navigates from one work branch to another, the agent needs a portable summary of the abandoned branch.

| Mechanism | Trigger | Purpose |
| --- | --- | --- |
| Compaction | Context is too long or user requests it | Compress the current timeline |
| Branch summarization | Navigation across branches | Carry useful state from another branch |

One is vertical compression. The other is lateral context transfer.

## My takeaway

Containerization and compaction are paired design problems.

An agent that can act safely but cannot remember will stall. An agent that can remember perfectly but acts on the host with broad permissions is dangerous.

Reliable coding agents need both:

```text
safe action + reliable continuation
```

That is the useful mental model I want to keep.
