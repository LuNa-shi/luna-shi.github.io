---
title: 'After You Say ‘Fix This Bug’: How DeepSeek Harness Organizes Turns and Sessions'
date: '2026-08-17'
overview: >-
  TL;DR: In DeepSeek Harness, a follow-up Input can wake the Agent Loop; a Turn is one continuous run that may contain several Steps, and each Step is one model request together with the Tools it asks to run. The Session Event Log records more than chat: it preserves execution boundaries, model-visible content, and action results. The Agent Loop is a Plugin that coordinates those Services in order, while persistence, resume, crash recovery, and fork all build on the same history.
lang: en
translationKey: deepseek-harness-03-turn-session
canonicalSlug: deepseek-harness-03-turn-session
tags:
  - deepseek-harness
  - agent-runtime
  - session
  - plugin-system
  - harness-engineering
categories:
  - agents
  - systems
toc: true
---

**A short follow-up Input can become several model requests before one Turn is over.**

TL;DR: In DeepSeek Harness, a follow-up Input can wake the Agent Loop. A Turn is one continuous run that may contain several Steps, and each Step is one model request together with the Tools it asks to run. The Session Event Log records more than chat: it preserves execution boundaries and action results. The Agent Loop is a Plugin that coordinates those Services in order, while persistence, resume, crash recovery, and fork all build on the same history.

> Version note: This article was checked against DeepSeek Harness commit [`47f94385`](https://github.com/deepseek-ai/deepseek-harness/commit/47f943859bef60e4160492346772ded9b24f765a) on August 17, 2026. That commit corresponds to `dsh@0.1.0-rc.5`. The project is still in developer preview, so later releases may change the design described here.

## 1. One Input can produce several Steps

Suppose the user writes:

```text
sum([]) should return 0, but it returns undefined. Fix this bug.
```

The familiar Agent Loop picture says that the model chooses an action, calls a Tool, receives a result, and tries again. That picture is useful, but it leaves one question unanswered: how many model requests belong to this one piece of work, and where does the runtime draw the boundary around them?

In DeepSeek Harness, the answer begins with an **Input**. An Input is a message or runtime signal that enters the Agent inbox and waits to be claimed. It is not a durable container for all the work that follows. A Follow-up Input can wake an idle Agent and make the driver continue.

The wake opens a **Turn**. A Turn is one continuous period of Agent activity. It starts before the runtime claims the Input and closes once no further work is currently owed. A Turn can contain zero or more **Steps**.

A Step is one model request together with the Tool executions requested by that model output. The boundary is therefore around a model call, not around one Tool call and not around one user message. If the model requests a Tool and the result requires another model request, the runtime closes the first Step and opens the next one inside the same Turn.

The smallest useful path looks like this:

```text
Input 1: “sum([]) should return 0. Fix it.”

Turn 1
├─ Step 1: model requests an edit; the edit Tool succeeds
├─ Step 2: model requests the test; the test Tool passes
└─ Step 3: model gives the final answer without requesting another Tool

Input 2: “Why should empty input return 0?”

Turn 2
└─ Step 1: model explains the result from the same Session history
```

This path has two Turns but only one continuing history. The second Input does not reopen Turn 1. It starts Turn 2 on the same Agent and Session.

## 2. Turn and Step mark different boundaries

That distinction matters because a Turn is not “one user message,” and a Step is not “one action.” A Turn is an execution envelope. A Step is the rhythm inside that envelope: prepare one request, receive one model output, run the Tools that output requests, and decide whether another request is owed.

Input is not another stored level above Turn. It names incoming work that enters the Agent inbox. A follow-up message can wake an idle Agent and open a new Turn. A steering message can be admitted into the next Step of a Turn that is already running. Injected context can wait without waking the Agent at all. Only Input that is admitted to the model-visible surface becomes a durable user message in the Session.

A Step may request several Tools in one model output. The runtime can schedule those calls according to their execution rules, but they remain inside the same Step because they came from the same model request. The opposite case is also valid: the final answer in the example requests no Tool, but it is still Step 3 because the model was called once more to interpret the test result.

A Turn can also contain no Step. For example, a pre-step extension can reject the first claimed Input, or the claimed Input can become empty before a model request begins. The durable log can still record that a Turn opened and ended without pretending that a model call happened.

Closing a Turn means that the driver currently owes no continuation. It does not claim that every broader objective a person might have in mind is finished. A later follow-up opens another Turn if the Agent is idle, and the Session keeps both Turns in one history.

Once several Steps can live inside one Turn, a new question appears: what component keeps this order intact?

## 3. Agent Loop is the Plugin that owns the order

The previous article established why a central runtime component can still be a Plugin. A Plugin is not defined by being optional or small. It is a module that Cordis mounts into a Context, activates after its required Services are ready, and tears down with the scope that owns its changes.

The default Agent Loop follows that same contract. At the fixed commit, it is a Cordis `Service` and declares five required Services:

```text
agents       publish and look up live Agents
sessions     create and hold Session objects
llm          prepare and stream model requests
tools        expose the Tool Registry and execute Tool Calls
systemPrompt assemble prompt sections and Tool schemas
```

The Agent Loop does not implement all five capabilities inside one class. It owns the live driver and asks the other Services to perform their parts. That is why calling it a Plugin describes its architecture more accurately than calling it the “core” in the sense of one privileged block of code.

There are two related paths.

The first is the Agent lifecycle path:

```text
Agent Loop Plugin
  → creates or resumes a Session
  → creates a scoped live Agent
  → publishes that Agent through the Agent Registry
  → owns its running lifetime and teardown
```

When the Plugin leaves, its factory registration and the Agents it created leave with it. Resume is not a special kind of permanent Agent object; it is a new live Agent scope built on a loaded Session history.

The second is the Turn and Step path:

1. The Agent Loop opens `turn/start` before it claims the next Input.
2. It assembles prompt sections and Tool schemas for the current scope.
3. It runs the pre-step decision that can rewrite or reject the claimed Input.
4. For an admitted Input, it opens `step/start`, records the messages entering the Step, and derives model history from the Session.
5. It asks the LLM Service to prepare and stream the model request.
6. It records assistant chunks and the assembled assistant message.
7. If the output contains Tool Calls, it gives them to the Tool Service. The Tool Service validates and executes them, then returns Tool Results.
8. It records those results, closes the Step, and checks whether the Tool results or new queued Input require another Step.
9. When no further work is owed, it closes the Turn with a reason.

The Agent Loop therefore owns **when** the next thing happens. The Services own **how** their capability works:

| Runtime responsibility | Agent Loop owns                                                  | The Service supplies                                              |
| ---------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------- |
| Agent lifetime         | create, publish, resume, cancel, and dispose the live Agent      | Agent Registry and Session Store                                  |
| Prompt input           | decide when a Step needs a request                               | System Prompt sections, Tool schemas, and Session-derived history |
| Model call             | choose the point at which the model is asked to continue         | LLM preparation and streaming                                     |
| Tool action            | pass model Tool Calls to the execution path and wait for results | Tool lookup, validation, execution, and result presentation       |
| Durable history        | decide which execution facts must be appended and in what order  | Session Event Log data model and append operations                |

Persistence is deliberately not another row in the ordinary Step path. It is the durable seam around the Session log. A running Agent reads and appends its Session in memory; the persistence Plugin batches and checkpoints those events, and later loads them for Resume.

This division is the practical meaning of “Agent Loop is a Plugin.” The Plugin is a coordinator with a managed lifetime. It does not become a monolith merely because the order it coordinates is complicated.

The coordination is strict even when the underlying capabilities are asynchronous. The LLM can stream chunks, several Tool Calls can run according to Tool Service rules, and Persistence can flush later, but the Agent Loop still has to know which Step owns each result before it decides what comes next. It waits at semantic boundaries: a model output has been assembled, the requested Tool work has settled, the durable Session facts have been appended, and the continuation decision can now be made. This is where much of the runtime’s complexity lives—not in a larger model prompt, but in preserving ownership and order while independent Services do their work.

Making that driver a Plugin gives the complexity a clear installation boundary. Cordis can activate it only after the required Services exist, expose the resulting Agent factory through the current Context, and dispose the Agents and registrations owned by that scope. “Plugin” therefore says how the coordinator enters and leaves the system, how it obtains capabilities, and which lifetime owns its effects. It does not say that the coordinator is peripheral.

The main execution path is easier to read when the two layers are visible together:

![Agent Loop coordinating System Prompt, Session, LLM, and Tools while appending two Turns to the Session Event Log](/assets/img/blog/deepseek-harness-03-turn-session/agent-loop-session-log-en.webp)

_Figure 1. The upper path is live coordination: Agent Loop asks Services for the next request and action. The lower path is the record that survives as Session history. Persistence receives durable batches from that history; it is not a synchronous Tool call in every Step._

The distinction between the two layers prevents a common mistake. The Agent Loop is not a database that happens to call a model. It is a driver that uses a Session to make its decisions inspectable and repeatable.

## 4. The Session Event Log is more than chat

The word “Session” can sound like a conversation transcript. In DeepSeek Harness, that is only one view of the object.

A Session is an append-only log of typed events and the stable identity associated with that history. It is the source of truth for the Agent interaction. The model message history is derived from the log rather than stored as a separate, authoritative array.

The log needs to preserve more than the messages a person sees. It can be understood through four compact categories.

**Running boundaries** record when a Turn and Step open and close, including why a Turn ended. Without these markers, a consumer could see two adjacent model messages but could not tell whether they belonged to one continuous run or two separate Inputs.

**Model-visible content** records user messages, injected runtime context, assistant messages, and Tool Results. Raw assistant chunks can also remain in the log for replay and interface fidelity even though they are not all re-sent to the model one by one.

**Action facts** record which Tool the model requested, the raw arguments it produced, the call identity, and the Tool Result or error that came back. This keeps “the model asked for an edit” distinct from “the edit Tool returned success.”

**Request and extension state** records information needed to reconstruct a request, such as the effective model route, rendered system prompt, and Tool schemas. Other Plugins can add their own durable event types for features such as todos or compaction.

These categories do not mean that every internal callback becomes history. The runtime has live interception points for work that is still in flight. A listener that rewrites a request or decides whether a Tool may proceed is part of the current execution; the durable log records the resulting fact that later consumers need to reconstruct.

The most important invariant is simple:

> If information reaches a model request, the runtime must be able to reconstruct it from the Session log.

That rule explains why the rendered system prompt and Tool schemas can be logged even though they do not look like chat messages. It also explains why a new model-visible contribution should enter through a Session event rather than hiding in an unrecorded in-memory variable.

The log can then produce several views. `deriveMessages()` folds the ordered surface events into the messages sent to the model. The interface can use the same events to render a transcript, a Tool card, or a replay of streamed output. A projection can expose a todo list without replacing the underlying event sequence.

This also makes reconstruction concrete. Before the next model request, the runtime does not need to guess which visible bubble came from which action. It can walk the ordered events, recover the admitted Input, the assistant output that requested a Tool, the matching Tool Result, and the current request configuration. Turn and Step markers explain the execution structure around those messages even when the markers themselves are not model messages. The next request is therefore a projection of recorded facts, not a second history assembled by convention.

Those views can differ without creating competing truths. The user interface may show a compact “tests passed” card. The Session still retains the Tool Call, its arguments, its result, and the Step that contained it. The model may receive only the derived messages required for its next request. The log remains the record from which both views are rebuilt.

This is why a Session is not merely “memory for the Agent.” It is a chronological account of what the runtime admitted, requested, executed, and committed to history.

## 5. One history supports Persistence, Resume, Recovery, and Fork

The Session event model first exists in memory. Durable storage is a separate capability. DeepSeek Harness exposes that seam through `SessionPersistence`, whose backends store the Session header and its contiguous events.

That separation gives the normal path a clean meaning. The Agent Loop can append an event without knowing whether the deployment uses JSONL, SQLite, or another backend. A persistence Plugin observes the Session event stream, writes durable batches, and checkpoints at the points its policy requires. The Session remains the source of truth for the running Agent; the backend is the durable copy used after the process is gone.

Once the log has a stable identity and order, four continuations become different operations rather than variations of “load the chat.”

### Persistence keeps the history beyond the process

Persistence stores the Session header and the event sequence with contiguous sequence numbers. The important property is not the file format. It is that the durable unit is the same event that the live Session used, rather than a second message schema that loses boundaries or Tool facts.

The persistence seam can batch writes, so “append to the Session” and “one filesystem write completed” are not the same moment. The article does not need the backend’s flush policy, but it does need this boundary: a live event model and a durable checkpoint are related, not identical.

### Resume keeps the same Session identity

Resume loads a persisted Session, reconstructs its history, and creates a fresh live Agent scope around it. The Session ID remains the same. Existing event sequence numbers and Turn numbering remain the basis for the next run.

Resume therefore continues a history; it does not copy that history into a new conversation. A process can disappear and return, but the Agent does not begin by asking the model to trust a summary of what happened. It rebuilds the request history from the recorded events.

### Crash Recovery closes an incomplete tail honestly

A process can stop after a complete event has been written but before the final Step or Turn marker arrives. The persistence loader keeps the valid committed prefix. A torn physical record is discarded, and an interrupted final run is balanced with explicit missing-result or closing events as required by the log contract.

The result is deliberately not a false success. The recovered history says that execution was interrupted. A later Input can open a new Turn on that history. Resume does not silently pretend that an open Turn completed normally.

### Fork creates a new Session at a valid boundary

Fork takes a source Session and a legal closed boundary, then creates a child Session whose leading history is an immutable copy of that prefix. The child records its parent Session and the length of its inherited seed. The parent is unchanged.

Fork is therefore not editing the old conversation and not resuming the same identity. It is a new history that agrees with the old one up to a known point and can diverge afterward. The boundary matters: a child should not inherit half of an open Turn and call that a completed starting point.

The relationships are easier to compare in one picture:

![Resume, Crash Recovery, and Fork using one Session history in different ways](/assets/img/blog/deepseek-harness-03-turn-session/session-continuations-en.webp)

_Figure 2. Resume continues Session A. Crash Recovery preserves the valid prefix and marks an unfinished tail as interrupted. Fork creates Session B from a closed boundary and leaves the parent history unchanged._

The Session reconstructs the Agent’s recorded execution history; it does not copy the state of every external system the Agent touched.

## 6. What this model buys, and what it costs

Separating Input, Turn, Step, and Session gives each question a place to live.

- Turn answers: “Which continuous run does this work belong to?”
- Step answers: “Which model request and Tool results moved it forward?”
- Session answers: “What ordered history can the runtime rebuild?”
- Persistence answers: “Which part survives the process?”
- Resume answers: “How does the same identity continue?”
- Fork answers: “Where can a new identity share history and then diverge?”

The model also makes behavior easier to inspect. A missing Tool Result is different from a model that never requested the Tool. An interrupted Turn is different from a completed Turn. A child Session is different from the parent it inherited. These distinctions are useful to the interface, debugging tools, and future extensions.

They also give an operator better questions. If the Agent appears to repeat work, inspect whether the previous Tool Result entered the Session before the next Step. If a resumed Agent behaves differently, inspect the reconstructed prompt, Tool schemas, and model route rather than only the visible transcript. If a fork begins from an unexpected point, inspect the chosen closed Turn boundary and lineage metadata. The event model does not remove failures, but it narrows each failure to a boundary with recorded evidence.

The cost is more explicit coordination. The Agent Loop must preserve event order. Prompt assembly and Tool schemas must match the capabilities that are actually active. Persistence must keep a contiguous durable prefix. Resume must keep the same Session identity and composition assumptions. Fork must reject boundaries that cut through an open Turn. A Plugin can replace one responsibility, but its neighbors still depend on the events, result formats, and lifecycle rules that connect them.

This is the same trade-off the series has been following. A simple loop diagram hides decisions inside arrows. A pluggable runtime exposes those arrows as Services, events, scopes, and records. The system becomes easier to replace and inspect, but there are more contracts to preserve.

The next article follows the remaining assembly question: which Providers and Consumers give the Agent Loop its actual model, tools, prompts, and execution capabilities, and how does Cordis compose them into one running Agent? That is the point where the runtime’s individual responsibilities become a configured tree.

### Further reading

- [DeepSeek Harness at the fixed commit](https://github.com/deepseek-ai/deepseek-harness/tree/47f943859bef60e4160492346772ded9b24f765a)
- [DeepSeek Harness architecture — Turn flow and Session log](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/docs/architecture.md)
- [Sessions and derived model history](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/docs/subsystems/session.md)
- [Session persistence and crash recovery](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/docs/subsystems/persistence.md)
- [Agent Loop implementation](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/core/agent-loop/src/index.ts)
- [Agent Turn and Step driver](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/core/agent-loop/src/agent.ts)
- [Session Fork behavior](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/core/session/tests/fork.spec.ts)
