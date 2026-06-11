---
title: 'Codex Source Dive (I): the agentic loop is a runtime boundary'
date: '2026-06-11'
overview: >-
  TLDR: A Codex turn is not one model call. It is a managed execution window where user input, tool calls, tool results,
  cancellation, compaction, and final answers are ordered by the runtime.
description: >-
  A source-reading note on turn/start, RegularTask, run_turn, turn/steer, turn/interrupt, pending input, and why Codex's
  agentic loop is more than while model calls tools.
tags:
  - codex
  - agent-runtime
categories:
  - agents
  - systems
math: false
mermaid: true
toc: true
relatedPosts: false
---

<!-- notion-sync: 37c4e07a-a023-8103-b020-e7336f1c7a59 parent=codex blogs url=https://app.notion.com/p/37c4e07aa0238103b020e7336f1c7a59 -->

Subtitle: **A turn is not one model call. It is a runtime boundary.**

The first trap in the Codex codebase is vocabulary. You open the source and immediately meet `turn/start`, `RegularTask`, `run_turn`, `pending input`, `pending work`, steering items, mailbox events, and interrupts. If you explain those names one by one, the post becomes a glossary. It will also be misleading, because the names live at different layers: some are protocol actions, some are task state, some are model-visible history, and some are conditions that may wake an idle thread.

This post follows one thread instead:

> A Codex turn is not a single request to the model. It is a managed execution window that can accept more input, call tools, write evidence back into history, be cancelled, and eventually settle.

Start with a simple story.

```text
Fix this failing test.
```

Codex does not send that sentence to the model and wait for one final answer. The app server receives `turn/start`, creates an in-progress turn, starts a regular task, and enters the core loop. The model may inspect files, run the failing test, read stdout and stderr, patch code, run the test again, and summarize only after the runtime has enough evidence. Every tool result becomes part of history; the next model request is grounded in what actually happened, not in what the model guessed would happen.

Now imagine that, while the task is running, you add:

```text
Actually, prioritize the API layer. Do not touch the UI.
```

That should not create a brand-new turn. It should also not kill the command that is already running. It is a mid-flight constraint, so it goes through `turn/steer`: the runtime appends the new user input to the active turn and drains it at a safe boundary.

If you press stop, that is a different operation. `turn/interrupt` is not another steering message. It cancels the active turn and lets the task wind down as interrupted.

Those three moments give the whole post its shape:

```text
turn/start     -> open an active turn
RegularTask    -> own lifecycle and cancellation
run_turn       -> loop through model, tools, and history
turn/steer     -> add input to the same active turn
turn/interrupt -> cancel the active turn
pending work   -> maybe wake an idle thread later
```

![Codex turn runtime](/assets/img/notion/codex-source-dive-agentic-loop-01.png)

## 1. `turn/start` opens an execution window

`turn/start` is a protocol entry point. The client sends user input and may also attach turn-level overrides such as model, working directory, sandbox or approval behavior, and permission profile. The app server returns a turn object, usually in an in-progress state, and streams events as the turn runs: turn started, item started, item completed, assistant-message deltas, tool output, and finally turn completed.

The important distinction is this:

```text
Protocol layer: “start a turn”
Core layer:     “run a managed task that may call the model many times”
```

A useful source-shaped call path is:

```text
turn/start
  -> create or activate turn
  -> RegularTask::run
  -> run_turn
  -> run_sampling_request
```

`RegularTask::run` owns the outer lifecycle. It emits the start event, holds the cancellation token, and then repeatedly calls `run_turn` until the active turn has no more input waiting to be consumed.

In rough form:

```text
next_input = initial input from turn/start
loop:
    last_agent_message = run_turn(next_input)
    if the active turn has no pending input:
        return last_agent_message
    next_input = []
    continue the same task
```

That outer loop explains why `turn/steer` does not need a new turn. The steering input enters a pending-input queue owned by the active turn. When `run_turn` reaches a safe point, the regular task can continue the same execution with that newly recorded input.

The better mental model is:

```text
turn/start = begin a controllable execution window
run_turn   = run the model/tool/history loop inside that window
turn/steer = add one more user constraint to that same window
```

If you treat `turn/start` as “call the model once,” every later concept will feel contradictory. The design only becomes clear when you see the turn as a runtime boundary.

## 2. `run_turn` is the actual agentic loop

`run_turn` is where the familiar loop lives: model, tool, model, final answer. But Codex’s loop is not the toy version.

A toy agent can be written as:

```python
while True:
    response = model(messages)
    if response.tool_call:
        messages.append(run_tool(response.tool_call))
    else:
        break
```

That explains tool calling, but it does not explain Codex. Codex also needs to handle mid-flight user input, cancellation, sandbox and approval policy, context compaction, stop hooks, event streaming, rollout recovery, and cross-agent mailbox messages. A production coding agent needs a runtime around the loop.

A better question for `run_turn` is:

> After this sample, is there any reason the runtime must take another step?

The reason might come from the model. It asked for a function call. It might also come from the runtime. A hook may require continuation. A compacted history may need a new sampling pass. A pending input may now be safe to drain. An interrupt may require the loop to stop even if the model wants to continue.

![run_turn loop](/assets/img/notion/codex-source-dive-agentic-loop-02.png)

One pass through `run_turn` roughly looks like this:

1. It records input. The first input comes from `turn/start`; later input may come from `turn/steer` once a safe point is reached.
2. It builds the sampling request. The runtime clones the model-visible history, adds instructions, visible tool schemas, output schema, and other turn configuration.
3. It samples the model. The model can produce assistant text, function calls, or both.
4. It executes tool calls through the runtime. The model sees a schema; the runtime handles routing, policy, sandboxing, approval, and the actual side effect.
5. It writes the result back into history. stdout, stderr, patch results, command status, and tool errors become the evidence for the next sample.

That last step is the heart of the design. A tool result is not a UI log. It is a fact that the next model request must see. Without that feedback, the agent is guessing. With it, the agent can correct itself against the actual repo, actual tests, and actual command output.

So the loop stops only when several layers agree that it can stop:

```text
The model has no tool follow-up.
No pending input is waiting to be consumed.
No compaction continuation is required.
Stop hooks allow the turn to settle.
No interrupt, replacement, or error branch has taken over.
```

That is the line between a demo agent and a coding agent. The model proposes the next move. The runtime decides whether it is allowed, when it runs, how the result is recorded, and when the execution window should close.

## 3. `turn/steer` is mid-flight input, not a new turn

`turn/steer` is easy to misread because the word “steer” also appears in runtime-generated steering. Keep them separate.

At the protocol layer, `turn/steer` does one main thing: it appends user input to an already in-flight regular turn. It is for a situation like this:

```text
User: Fix this bug.
Codex: reads files, runs tests, starts a patch.
User: One more constraint: do not change the public API.
```

The second user message belongs to the same execution window. It does not mean “start over.” It does not mean “cancel.” It means “when you reach a safe boundary, incorporate this into the current task.”

That input goes into pending input. Pending input is not automatically the prompt. It is a queue the runtime has accepted and will later write into history. Two details matter:

- Fresh input from `turn/start` should be handled first at the beginning of a turn.
- If context compaction or a tool continuation is already in progress, the runtime may need to finish that continuation before draining steering input.

The lifecycle is:

```text
turn/steer
  -> pending input
  -> safe point
  -> conversation item in history
  -> same active turn continues
```

The phrase “safe point” is doing real work. Codex should not splice a new user instruction into the middle of an arbitrary tool side effect. The runtime waits until it can preserve ordering, history, and cancellation semantics.

## 4. `turn/interrupt` cancels; it does not continue

`turn/interrupt` is a different operation. It requests cancellation for a specific in-flight turn. If it succeeds, that turn eventually settles as interrupted. The cancellation token travels through the task and tool execution path so the runtime can wind down ongoing work.

Do not describe it this way:

```text
turn/interrupt = start a new turn with a stop instruction
```

That is wrong. The better version is:

```text
turn/interrupt = the current active turn ends here
new turn        = may happen later, but it is not the interrupt itself
```

A later turn may come from a new `turn/start` sent by the user. It may also come from runtime-discovered pending work after the thread becomes idle. But the interrupt itself is about ending the current execution, not continuing it.

![start steer interrupt pending work](/assets/img/notion/codex-source-dive-agentic-loop-03.png)

## 5. Pending input, pending work, and runtime steering are three different ideas

The original notes were weakest where they put these names on the same level. They sound similar, but they answer different questions.

### Pending input belongs to the active turn

Pending input is user input that has been accepted for the current active turn but has not yet been written into history. `turn/steer` is the canonical source. The question is:

> Should this user message become part of the semantic boundary of the turn that is already running?

If yes, it is pending input.

### Pending work belongs to an idle thread

Pending work is about waking a thread after the active turn has already settled. A mailbox item or trigger may mean, “This thread is idle, but there is more work it should process.” The question is:

> After the current turn has ended, is there work that should start a later turn?

That is why pending work can create a new turn, while pending input usually keeps the same turn alive.

### Runtime steering is system-generated model-visible control

Runtime steering is not protocol `turn/steer`. It is an item the runtime writes into history so the model sees a control constraint. Examples include a stop hook that says the model should not finish yet, a continuation after context compaction, or a budget message from a long-running Goal.

The clean distinction is:

```text
turn/steer        -> user input enters pending input
runtime steering  -> system-generated control item enters history
pending work      -> idle-thread condition may start later work
```

All three can make execution continue. They do not come from the same layer and should not be explained as one mechanism.

## 6. Why the boundaries are this fine-grained

For a toy agent, a `while model -> tool -> model` loop is enough. For a coding agent, it is not.

A user may add constraints while tests are running. A shell command may take too long and need cancellation. A patch may require approval. A sandbox may block a file write or network access. The context window may fill and require compaction. A model may summarize too early, and a stop hook may need to pull it back. A subagent may send a mailbox result. The UI still needs item-level progress rather than one huge final blob.

Those are runtime-boundary problems, not just model-quality problems.

I would split Codex into five layers:

| Layer        | Question it answers                                                   | Typical names                                                |
| ------------ | --------------------------------------------------------------------- | ------------------------------------------------------------ |
| Protocol     | How does the outside world start, add to, cancel, and observe a turn? | `turn/start`, `turn/steer`, `turn/interrupt`, event stream   |
| Task         | Who owns lifecycle and cancellation?                                  | `RegularTask`, `SessionTask`, cancellation token             |
| History      | What does the model actually see next?                                | history, response items, tool output, steering item          |
| Tool runtime | How are actions routed, authorized, executed, and recorded?           | `ToolRouter`, `ToolCallRuntime`, sandbox, approval           |
| Control      | What forces continuation or stop?                                     | pending input, compaction, stop hooks, mailbox, pending work |

Once those layers are separated, the code stops looking like a pile of terms. It becomes a story about an execution window.

## 7. The source-reading checklist

When reading this part of Codex, do not start by asking “where is the loop?” Start with these questions:

```text
Who created the active turn?
Who owns its cancellation token?
What input is already in history, and what input is only pending?
What model-visible items are user-authored versus runtime-authored?
What tool results were written back as evidence?
Why did the loop decide to continue?
Why was it allowed to stop?
```

That checklist is more useful than memorizing function names. Codex’s agentic loop is not just `while(tool)`. It is a carefully managed boundary between user intent, model sampling, tool side effects, history, and cancellation.

## Source map

Useful files and areas to read after this post:

- `codex-rs/app-server/README.md` for turn protocol shape and event semantics.
- `codex-rs/core/src/tasks/regular.rs` for the regular task lifecycle.
- `codex-rs/core/src/session/turn.rs` for the model/tool/history loop.
- Tool routing and runtime modules for authorization, sandbox, and tool-output recording.
