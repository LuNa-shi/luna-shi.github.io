---
title: 'Codex Source Dive (II): goals are runtime state, not prompts'
date: '2026-06-11'
overview: >-
  TLDR: A Codex Goal is a thread-level long-running task state machine. It stores objective, status, budget, usage, resume
  state, and continuation gates instead of relying on one remembered prompt.
description: >-
  A source-reading note on Codex Goals: thread ownership, GoalRuntimeEvent, accounting, idle continuation, budget steering,
  authority separation, and resume.
math: false
mermaid: true
toc: true
relatedPosts: false
tags:
  - codex-source-dive
  - agent-runtime
categories:
  - agents
  - systems
---

<!-- notion-sync: 37c4e07a-a023-8105-b6f1-fc49946cb014 parent=codex blogs url=https://app.notion.com/p/37c4e07aa0238105b6f1fc49946cb014 -->

Subtitle: **From a sentence to a resumable long-running task machine.**

The first post treated a turn as a runtime boundary rather than a single model call. This post takes the same lens and applies it to a more deceptive object: `Goal`.

The name is dangerous. It sounds like a field in a prompt. When people first see a command such as:

```text
/goal Reduce checkout p95 latency below 120 ms, verified by the checkout benchmark, while keeping the correctness suite green.
```

the natural assumption is that Codex simply inserts that sentence into the system prompt and asks the model to remember it. That is the shallow reading. It also makes the source look more confusing than it really is.

The stronger reading is:

> A Codex Goal is not a prompt. It is a thread-level long-running task state machine.

A prompt only answers one question: “What should the model see on the next sample?” A Goal has to answer more questions:

```text
Where is the objective stored?
When is it restored?
When may it continue without a new user message?
Who is allowed to change its status?
How are token and time usage counted?
What happens when budget or usage boundaries are reached?
```

Start with the checkout latency story.

A normal prompt says: “Try to optimize checkout latency now.” A Goal says something closer to a contract:

```text
Objective: checkout p95 < 120 ms
Evidence: checkout benchmark
Constraint: correctness suite stays green
Status: active / paused / blocked / complete / budget-limited / usage-limited
Ledger: token usage, elapsed time, and budget state
Continuation: after this turn ends, decide whether another autonomous turn is allowed
Authority: user, runtime, and model have different rights to mutate state
```

That is why Goal cannot be reduced to “put the objective into the prompt.” Prompting is one input to the next model call. Goal is a durable runtime object attached to the thread.

![Goal runtime map](/assets/img/notion/codex-source-dive-goals-01.png)

## 1. Why Goal belongs to a thread

From the app-server perspective, Goal is already thread-level. Interfaces such as `thread/goal/set`, `thread/goal/get`, and `thread/goal/clear` do not operate on one assistant message or one turn. They operate on the current thread. Goal updates and clears are also streamed back as thread-level events.

That design is necessary. A long-running objective does not only need the objective text. It needs durable state:

```text
goal id
objective text
status
budget limits
token usage
elapsed time
last accounting baseline
resume state
possibly the latest blocker or completion signal
```

If that state were stored only in one prompt, it would be lost as soon as the context changed, the app restarted, or the next turn began. If it were stored globally, it could bleed across unrelated threads. Attaching it to the thread is the natural boundary: the thread already owns the project conversation, rollout, tool evidence, and user intent.

So the first important sentence is:

> A Goal is not owned by a turn. A Goal outlives turns and uses turns as execution checkpoints.

This also explains why the code has to listen to runtime events. The Goal cannot know how much work has happened by reading only the objective text. It needs to observe turn starts, tool completions, turn finishes, idle checks, external mutations, usage limits, and thread resumes.

## 2. `GoalRuntimeEvent` is the bridge between turns and long-running state

The runtime-event names look scattered at first:

```text
TurnStarted
ToolCompleted
TurnFinished
MaybeContinueIfIdle
UsageLimitReached
ExternalSet
ExternalClear
ThreadResumed
```

They are not random. They mark the points where a long-running objective must update its ledger or decide whether work may continue.

![Goal runtime events](/assets/img/notion/codex-source-dive-goals-02.png)

Think of the Goal runtime as a small dispatcher sitting beside the turn runtime. It does not replace `run_turn`; it observes the boundaries around it.

- At `TurnStarted`, it binds this execution to the currently active Goal and records usage baselines.
- At `ToolCompleted`, it accounts for incremental token and time usage and may inject budget steering.
- At `TurnFinished`, it finalizes accounting and decides whether an idle continuation should be considered.
- At `MaybeContinueIfIdle`, it runs the continuation gate.
- At `UsageLimitReached`, it stops substantive work and surfaces the boundary honestly.
- At `ExternalSet` or `ExternalClear`, it accepts thread-level mutations from outside the model loop.
- At `ThreadResumed`, it rebuilds runtime state after a session comes back.

The event dispatcher is what turns a sentence into an operating mechanism. Without it, the Goal would only be another instruction in the prompt.

## 3. `TurnStarted`: bind the active turn to the active Goal

When a regular turn begins, the Goal runtime needs to ask:

> Is this turn part of an active Goal?

If yes, it records at least two baselines.

The first is a token baseline. Later, when a tool completes or the turn finishes, the runtime can subtract the previous baseline from current usage and account only for the delta. Without a baseline, token usage will be double-counted or missed.

The second is a wall-clock baseline. Long-running objectives may track elapsed time, not just tokens. A resumable autonomous task must have a ledger. If it cannot account for its own cost, the UI will eventually show a black box pretending to be a plan.

The flow is:

```text
turn/start
  -> RegularTask begins
  -> GoalRuntimeEvent::TurnStarted
  -> if the thread has an active Goal:
       capture active_goal_id
       capture token baseline
       capture wall-clock baseline
  -> run_turn enters the model/tool loop
```

Goal does not replace turn. It wraps a long-running state layer around turns.

## 4. `ToolCompleted`: tool output is both evidence and cost

For a coding agent, real progress happens between model samples and tools. The model reads files, executes tests, applies patches, runs benchmarks, and studies failures. Every step creates evidence and burns budget.

That is why `ToolCompleted` matters. After a tool finishes, the Goal runtime can do three things:

```text
1. Add the new token and time delta to the Goal ledger.
2. Check whether tokenBudget or usage limits are near or past their boundary.
3. If needed, inject model-visible budget steering.
```

Budget steering is not user `turn/steer`. It is runtime-authored control input. The message is roughly:

```text
You are at the budget boundary. Do not start new substantive work.
Summarize completed attempts, evidence, blockers, and the best next step.
```

The key point is:

> Budget exhausted is not the same as Goal complete.

If checkout p95 moves from 180 ms to 130 ms and the budget runs out, the Goal is not complete. It is budget-limited. That distinction protects trust. A runtime boundary forced the task to stop; it did not prove the objective had been achieved.

## 5. `TurnFinished` and `MaybeContinueIfIdle`: continuation must pass gates

This is the most interesting part of Goal.

For a normal turn, completion means the assistant is done and waits for the user. For an active Goal, a completed turn may only be a checkpoint. The runtime must ask: is the objective complete? If not, is it safe and useful to start another autonomous turn?

That question is deliberately gated. A Goal continuation is not a `while true` loop.

![Goal continuation gate](/assets/img/notion/codex-source-dive-goals-03.png)

A simplified version looks like this:

```text
on TurnFinished:
    account final usage
    maybe emit goal status update
    maybe schedule MaybeContinueIfIdle

on MaybeContinueIfIdle:
    if thread is not idle:
        stop
    if queued user input exists:
        stop and let the user win
    if goal is not active:
        stop
    if current mode is Plan mode:
        suppress continuation
    if token budget or usage limit is reached:
        stop substantive work
    if the previous continuation produced no counted autonomous activity:
        suppress the next automatic continuation
    else:
        start a continuation turn
```

Several design choices are hidden in that pseudocode.

First, continuation happens at an idle boundary. Goal should not jump into the middle of an active turn or override freshly queued user input.

Second, Plan mode suppresses continuation. Plan mode means “think and propose, do not execute.” If Goal were allowed to keep running in Plan mode, the runtime would silently convert planning into autonomous execution.

Third, empty continuations are suppressed. If the model only summarizes, hesitates, or says it will continue without producing counted tool activity, another automatic continuation is likely a waste. The runtime should not keep paying for self-talk.

Fourth, the continuation input is runtime-generated. It is not a new user prompt. The runtime brings the active objective back into model-visible context and asks for the next useful step based on the current evidence.

The correct mental model is:

```text
Goal continuation = turn-level autonomy after explicit runtime gates
```

not:

```text
Goal continuation = loop until the model says it is done
```

## 6. Authority boundary: the model should not own the whole Goal lifecycle

A long-running task becomes unsafe if the model can freely rewrite its own contract. Codex’s design therefore separates authority.

![Goal authority boundary](/assets/img/notion/codex-source-dive-goals-04.png)

The user and app server own the objective-level lifecycle: set, get, clear, pause, resume, and external limits. The runtime owns enforcement: accounting, continuation gates, budget steering, usage-limit behavior, and resume. The model can participate by reading the Goal and reporting progress states such as complete or blocked, but it should not be the sole owner of budget and lifecycle policy.

That split is important for two reasons.

First, it keeps the Goal honest. The model can say, “I believe the benchmark now proves the objective,” but the status change should still be grounded in evidence and runtime state. If the model says, “I am done” after reaching a budget boundary without verification, the runtime should not confuse that with completion.

Second, it keeps user intent above autonomous behavior. The user can clear or modify the Goal. Queued user input wins over continuation. Plan mode suppresses execution. These are not implementation details; they are the governance layer of a long-running agent.

## 7. Resume: a Goal must survive more than memory

Persistence is where the prompt-based interpretation completely breaks.

If the app restarts, a prompt-only Goal has no reliable state. It may be missing usage totals, status, previous baselines, blockers, and continuation state. It may also have no way to decide whether it is safe to resume.

A thread-level Goal can be restored. On `ThreadResumed`, the runtime can rebuild the active Goal state from the stored thread data and rollout. It can know whether the Goal is active, whether it was paused or limited, what usage had already been counted, and whether continuation should be allowed.

This is the difference between memory and state:

```text
Memory: “The model may remember the objective.”
State:  “The runtime can restore the objective and its ledger.”
```

For long-running coding work, state wins.

## 8. Why this matters for agent design

The Goal mechanism is not just a Codex feature. It is a design lesson for any long-running agent.

A serious long-running objective needs at least six pieces:

| Requirement            | Why it matters                                                          |
| ---------------------- | ----------------------------------------------------------------------- |
| Thread ownership       | The objective belongs to the project conversation, not a single sample. |
| Persistence            | The task must survive context changes and restarts.                     |
| Accounting             | Autonomous work needs a visible cost ledger.                            |
| Continuation gates     | The agent must not run forever or override the user.                    |
| Authority separation   | The model should not unilaterally rewrite its contract.                 |
| Honest boundary states | Budget-limited and usage-limited are not the same as complete.          |

That is why “Goal is just a prompt” is the wrong abstraction. It hides the hard part. The hard part is not telling the model what the user wants; it is building a runtime that can keep working on that objective without lying, looping, or stealing control from the user.

## 9. Source-reading checklist

When reading the Goal code, use these questions:

```text
Where is the Goal stored relative to the thread?
Which runtime events can mutate its state?
When is usage counted, and what baseline prevents double-counting?
What makes a continuation allowed or suppressed?
How does Plan mode change continuation behavior?
Who can mark complete, blocked, paused, cleared, budget-limited, or usage-limited?
What state is restored when a thread resumes?
```

Once you ask those questions, the structure becomes less mysterious. Goal is the runtime answer to a simple product promise: “Keep working toward this objective, but keep accounting, boundaries, and user control intact.”

## Source map

Useful files and areas to read after this post:

- `codex-rs/core/src/goals.rs` for Goal runtime events, accounting, continuation, and resume behavior.
- `codex-rs/app-server/README.md` for `thread/goal/set`, `thread/goal/get`, `thread/goal/clear`, and related events.
- `codex-rs/core/src/tools/handlers/goal_spec.rs` for model-facing Goal tools and authority boundaries.
- Turn and task modules from the first post, because Goal wraps around the turn lifecycle rather than replacing it.
