---
title: 'The Agent Loop Is Only the Beginning: What Does DeepSeek Harness Do Around the Model?'
date: '2026-08-16'
overview: >-
  TL;DR: The Agent Loop explains how a model alternates between reasoning and tool calls. A Harness must also decide what the model sees, turn tool calls into real operations, preserve task progress, and stop unsafe actions before they reach the host system.
lang: en
translationKey: deepseek-harness-01-agent-runtime
canonicalSlug: deepseek-harness-01-agent-runtime
tags:
  - deepseek-harness
  - agent-runtime
  - harness-engineering
categories:
  - agents
  - systems
toc: true
image: /assets/img/blog/deepseek-harness-01-agent-runtime/harness-boundary-en.png
---

**A failing test reveals the part of a Coding Agent that the usual loop diagram leaves out.**

TL;DR: An Agent Loop explains why a model can inspect a result and try again. It does not explain who prepared the model's context, who turned its JSON into a shell command, what survived an interruption, or why a dangerous write never reached the file system. Those are Harness problems. DeepSeek Harness is especially useful to study because it makes many of these responsibilities pluggable, which exposes both the power and the cost of that architecture.

> Version note: This article was checked against DeepSeek Harness commit [`47f94385`](https://github.com/deepseek-ai/deepseek-harness/commit/47f943859bef60e4160492346772ded9b24f765a) on August 16, 2026. That commit corresponds to `dsh@0.1.0-rc.5`. The project is still in developer preview, so later releases may change the design described here.

## 1. Where does the Agent Loop stop?

Give a Coding Agent a small but realistic task:

```text
This test started failing after the refactor. Find the cause, fix it, and run the relevant tests again.
```

The first few steps feel familiar. The Agent reads the failure, searches for the affected code, inspects a file, makes an edit, and runs the test. If the test fails again, the output returns to the model and informs another attempt.

That behavior is usually drawn as an Agent Loop:

```text
model -> choose an action -> call a tool -> read the result -> call the model again
```

The loop captures a genuine change from chat. The model no longer has to produce a complete answer from its initial context. It can act, observe, and revise.

Now pause the task at four ordinary moments.

Before the first model call, something has already selected the project instructions, conversation history, and available tools. When the model asks to read a file, something has to translate that structured request into a file-system operation. After the edit, something must remember that the file changed but the test has not run. If the model chooses a path outside the workspace, something must prevent the write from reaching the host.

The model handles none of those moments by itself. It emits tokens that describe an intention. It does not own a file system, a shell, a network connection, or the authority to use them.

This is where the simple loop runs out of explanatory power. The arrow labelled "call a tool" compresses several decisions into one line: which tools the model can see, whether the requested tool exists, whether its arguments are valid, whether the action is allowed, where it runs, and how the result returns to the next model call.

Anyone who has used Codex or Claude Code has encountered these decisions through the product. Project instructions affect the Agent's behavior. Command output appears in the next step. Some operations trigger an approval request. A task can continue after the user adds a new constraint. The exact design differs by product, but the surrounding runtime is always doing more than repeating a model call.

The Agent Loop describes the rhythm of a task. The Harness supplies the conditions that let the task become real, resumable, and constrained.

That leaves four questions for the rest of this article:

1. What can the model see in the current step?
2. How does a tool request become a real operation?
3. What preserves the task between model calls?
4. What stops an unsafe action before it runs?

## 2. What begins where the loop ends?

Here, **Harness** means the runtime around the model. It prepares the model's input, connects model intent to the execution environment, records what happened, and applies limits before an action crosses into the real world.

The order matters. The Harness acts before the model when it assembles context. It acts again after the model produces a tool call. The model chooses the next move, but the runtime defines what the model knows and what its choice is allowed to do.

Four responsibilities follow from that boundary.

**Context assembly** builds the next model request from project instructions, prior messages, task state, and the tools currently available. A context window is finite, so history is rarely a literal replay of everything that happened. The selection of instructions, the representation of older events, and the visible tool set all shape the next decision.

**Tool execution** connects a structured request to a host operation. The model sees a tool name, an argument schema, and a description. The runtime must parse the call, locate an implementation, handle cancellation and timeouts, and return success, failure, or refusal in a form the model can understand.

**Task state** carries work across model calls. User messages, model output, tool requests, tool results, approvals, and interruptions can all affect what happens later. A durable record lets the next step, a resumed task, or a branch from earlier work begin from known facts.

**Safety controls** separate a proposed action from permission to perform it. The runtime decides when the user must approve an operation and relies on execution boundaries to restrict what the process can reach. A prompt that tells the model to be careful cannot enforce either rule.

The diagram below shows how these responsibilities relate. It is a logical map, not a process diagram or deployment topology.

![DeepSeek Harness as a logical boundary around context assembly, the Agent Loop, safety controls, tool execution, and task state](/assets/img/blog/deepseek-harness-01-agent-runtime/harness-boundary-en.png)

*Figure 1. The Harness boundary around one model-and-tool cycle. Arrows show the flow of intent, results, and recorded state.*

There are two loops in the diagram. The obvious one runs from the model to a tool and back with a result. The quieter loop runs through task state: messages and step events are recorded, then used to build the next model context. An Agent can call tools without that second loop, but it will have trouble carrying a long task through interruption, recovery, and changing context.

The outer boundary matters too. The Harness is not the entire product. The interface, model service, file system, shell, and external services can all sit outside it. The Harness coordinates access to them under a shared account of state and permission. If every part of a Coding Agent product is called "the Harness," the term explains nothing.

This boundary gives us enough vocabulary to examine DeepSeek Harness without touring its source tree. We can follow the four questions instead.

## 3. How does DeepSeek Harness organize the work?

DeepSeek Harness summarizes its architecture with the phrase "everything is a plugin." It means more than tool plugins. Model access, tool registration, task records, and even the Agent Loop can enter the runtime through plugins.

First follow where those plugin contributions appear during one failing-test task. Once the four paths meet, we can return to the plugin system itself.

### What enters the next model call?

The model cannot begin debugging until it receives the user's request, project constraints, useful history, and tools it can call. It does not know where those inputs live. DeepSeek Harness assembles them before each model step.

Plugins can contribute sections of the system prompt, additional context, and tool definitions. The current Agent scope limits which registered contributions are visible. Before the step advances, the runtime can still rewrite or reject the assembled input.

So context is a result, not a static prompt. Change the project instructions, unload a tool, or resume an older task, and the next request may differ even when the model stays the same.

This distinction helps diagnose behavior. If the Agent does not know the project's required test command, the model may be missing context rather than debugging skill. If an unloaded tool remains in the tool list, the runtime has allowed advertised capability to drift away from actual capability.

DeepSeek Harness also records the rendered system prompt and tool definitions. After an interruption, the runtime can recover what the model actually received instead of reconstructing it from a simplified chat transcript. That makes the task easier to resume and gives debugging a concrete starting point.

### How does a tool call reach the real world?

Suppose the model chooses to read `src/parser.ts`. Its output is still only a structured tool call: a tool name plus arguments. The model pauses there. The Harness takes over.

DeepSeek Harness records the call, resolves the tool, parses its arguments, and applies permission checks before the implementation runs. It then normalizes the outcome into one result that can be stored in the task record, displayed in the interface, and sent back to the model.

That path is more deliberate than calling a function directly because three views of the operation must agree: what the model requested, what the interface reports, and what the host executed. If a middle layer can silently replace `src/parser.ts` with another path, the task log ceases to describe reality. Approvals and later debugging would rest on a false record.

Failure takes the same path back. A missing file, a rejected permission request, and a test process that exits with an error are all useful observations. Hiding or smoothing over them would leave the model reasoning about an action that never happened.

The loop draws one arrow between model and tool. The Harness keeps every step along that arrow consistent.

### What survives an interruption?

Imagine the Agent has edited the parser but the task stops before the verification run. The last assistant message is not enough to recover the work. A resumed task needs to know what the user asked, which calls ran, whether the edit succeeded, and where execution stopped.

DeepSeek Harness stores those facts in an append-only task record called the **Session**. User messages, model output, tool calls, and tool results enter the Session in order. The runtime derives the history for the next model request from that record.

The visible conversation is one view of a Session, not the whole thing. The interface may compress an operation into a small "Run tests" card. The runtime still needs the exact call, its completion state, and its result.

For our failing test, the Session can preserve a precise state: the source file changed; verification has not run. That is enough for the next step to continue from the interruption instead of starting from a vague summary. Article three will go deeper into turns, recovery, and branches. The architectural point here is that continuity belongs to the Harness, not to the model's memory.

### What keeps an unsafe action from becoming real?

A tool call expresses the model's choice. It does not grant authority. The difference becomes concrete when a request moves from reading an ordinary source file to writing outside the workspace, deleting data, or launching a process with broader access.

DeepSeek Harness treats user approval and the execution boundary as separate controls. Approval asks whether the user permits an action. A sandbox and related boundaries determine what the process can reach even after it starts. An operation that does not need a prompt still cannot exceed its configured boundary.

Safety decisions must also move in one direction. Once a check rejects a call, a later stage cannot convert the rejection into permission. Otherwise, adding another extension to the tool path could weaken a decision that an earlier component had already made.

In the failing-test task, an edit inside the configured workspace may proceed. A write elsewhere may require approval or fail. The refusal returns through the same result path and enters the Session, giving the Agent a fact it must respond to.

These controls do not prevent the model from choosing a bad action. They prevent that choice from automatically becoming system authority. Article five will examine the mechanisms in detail.

The four paths now meet. Context assembly prepares the step. The Agent Loop asks the model what to do. Tool execution connects its choice to the environment. The Session records the outcome. Safety controls decide which choices may cross the boundary. DeepSeek Harness makes these parts work together without fixing all of them inside one implementation.

## 4. What does the plugin system actually do?

The word "plugin" often suggests an optional feature added to an otherwise fixed application. A browser extension adds a capability; an editor plugin adds a command or a language. That picture is too narrow for DeepSeek Harness.

The distinction starts with their roles. A tool is an action the model may request. A plugin is a component that participates in the runtime. It may register tools, but it can also contribute context, provide model access, maintain task records, listen for events, or change how one step of execution is handled. Some plugins never expose a tool to the model.

The plugin system gives these components a common way to enter and leave the runtime. When a plugin loads, its contributions become available wherever that plugin is active. It may also rely on services supplied by other plugins. When it unloads, the runtime has to withdraw everything it added. If one of its dependencies changes, the system must decide what happens to the plugin that was using it.

Without that system, the main program would create the model client, build the tool list, open the Session store, install permission checks, and connect every piece to the Agent Loop itself. Each replacement would require another branch in the core runtime. With plugins, the core coordinates a set of current contributions instead of naming every implementation in advance.

Cordis provides the environment in which DeepSeek Harness manages those plugins. The next article will examine its dependency and lifecycle rules. For this article, one compact model is enough:

```text
load a plugin -> expose its contributions -> use them during a task -> remove them when it leaves
```

This explains why "everything is a plugin" matters. The phrase does not mean that every part of the Harness turns into a model-callable tool. It means that major runtime responsibilities can join the system through the same extension mechanism and remain replaceable.

### Where does the complexity go?

The plugin system lets a team change model providers, expose a different tool set, or move file and shell operations into an isolated environment without rewriting the whole task flow. It does not make the connections between those parts disappear. It turns them into rules that the runtime has to preserve.

Take the execution environment. If file tools point at a remote sandbox while the shell still runs on the local machine, the Agent now inhabits two file systems. It may inspect one copy of the project and test another. Matching function signatures does not solve that problem. Related tools must share the same view of files and processes.

Unloading exposes another rule. A plugin may register tools, subscribe to events, start background work, and depend on another service. Removing its name is easy. The runtime must also remove its listeners, stop its tasks, and release resources that should no longer exist.

Dependency replacement raises the same question while the system is running. When a service changes, does its consumer restart, become unavailable, or continue holding a stale object? Each answer can work in a particular design, but the runtime needs an explicit rule. Load order and surviving references should not decide by accident.

Pluggability also expands the debugging surface. A failed test run may originate in the model's choice, the assembled context, plugin order, a tool provider, a permission decision, or the persistence layer. Clear boundaries help isolate failures. More boundaries still create more places to inspect.

Compatibility becomes part of the architecture. DeepSeek Harness is in developer preview and warns that breaking changes will occur. Once the Agent Loop and task record are replaceable, event order, cancellation behavior, and record formats cannot depend on convention alone. An implementation can change; the rules that its neighbors rely on must remain legible.

Security makes the trade-off sharper. A plugin that adds a read-only search tool has limited authority. A plugin that can alter tool policy or task persistence sits much closer to the runtime's trust boundary. An extension point needs enough authority to do its job, while the runtime still prevents one component from quietly widening another component's authority.

The plugin system therefore moves complexity. Connections that once lived as fixed code in the main program become lifecycle, dependency, compatibility, debugging, and security rules shared by the runtime.

Codex and Claude Code face the same underlying jobs: assemble context, execute tools, retain progress, and constrain actions. The useful comparison is which boundaries remain internal and which boundaries users can configure or extend. Any stronger comparison needs a fixed version and a specific engineering problem.

## 5. Why does the next article begin with plugin lifecycle?

Our failing test has now crossed the whole runtime. The Harness prepared what the model saw, carried a tool call into the file system, recorded the unfinished verification step, and kept an unsafe path outside the execution boundary. The Agent Loop mattered, but it was only the visible rhythm running through those systems.

DeepSeek Harness makes many of those systems pluggable. That choice leaves harder questions behind. When a plugin unloads, how do its tools, listeners, and background tasks disappear together? When a dependency is replaced, who reconnects or restarts its consumers? If several plugins inspect one tool call, how does the runtime preserve order and stop a later component from reversing a safety rejection?

Those are lifecycle questions. The Agent Loop has no answer for them.

The next article is [Why Does DeepSeek Harness Need a Plugin System?](https://github.com/LuNa-shi/luna-shi.github.io/issues/3). It enters Cordis through a practical observation: loading a plugin is easy; making it leave cleanly, and keeping it correct while dependencies change, is much harder.

### Further reading

- [DeepSeek Harness at the fixed commit](https://github.com/deepseek-ai/deepseek-harness/tree/47f943859bef60e4160492346772ded9b24f765a)
- [DeepSeek Harness architecture](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/docs/architecture.md)
- [Session and model history](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/docs/subsystems/session.md)
- [Tool execution pipeline](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/docs/tool-execution-pipeline.md)
- [Permission presets](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/docs/subsystems/permission-presets.md) and [sandbox boundaries](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/docs/subsystems/sandbox.md)
