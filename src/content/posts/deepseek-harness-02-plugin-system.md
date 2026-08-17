---
title: "Why Is the Agent Loop a Plugin? Inside DeepSeek Harness's Plugin System"
date: '2026-08-17'
overview: >-
  TL;DR: Cordis is the same-process plugin framework underneath DeepSeek Harness. It loads TypeScript modules into a Context, connects providers and consumers through named Services, waits for dependencies through inject, and cleans up each Plugin's Effects when it leaves. A Tool is only one model-facing definition that a Plugin may register. DeepSeek Harness applies the same lifecycle model to the Tool Registry, Session, and even the Agent Loop.
lang: en
translationKey: deepseek-harness-02-plugin-system
canonicalSlug: deepseek-harness-02-plugin-system
tags:
  - deepseek-harness
  - plugin-system
  - cordis
  - harness-engineering
categories:
  - agents
  - systems
toc: true
---

**Cordis feels a little like a microservice architecture collapsed into one process.**

TL;DR: Cordis is the same-process plugin framework underneath DeepSeek Harness. It loads TypeScript modules into a Context, connects providers and consumers through named Services, waits for dependencies through inject, and cleans up each Plugin's Effects when it leaves. A Tool is only one model-facing definition that a Plugin may register. DeepSeek Harness applies the same lifecycle model to the Tool Registry, Session, and even the Agent Loop.

> Version note: This article was checked against DeepSeek Harness commit [`47f94385`](https://github.com/deepseek-ai/deepseek-harness/commit/47f943859bef60e4160492346772ded9b24f765a) on August 16, 2026. That commit corresponds to `dsh@0.1.0-rc.5`. The project is still in developer preview, so later releases may change the design described here.

The microservice comparison gives us a useful starting picture. One component provides a capability under a stable name. Another component declares that it needs that capability. The framework waits until the provider exists, then lets the consumer run. Replace the provider, and the consumer can keep using the same capability contract.

But Cordis does not turn every component into a server. Its Plugins are trusted modules mounted inside the same Node.js process. They usually communicate through method calls and in-process events, not RPC. Cordis is responsible for composition, dependency readiness, and cleanup, not network routing or distributed failure recovery.

Cordis is therefore not a Plugin inside DeepSeek Harness. It is the framework that loads and manages DeepSeek Harness Plugins.

Once that point is clear, the surprising sentence "the Agent Loop is a Plugin" becomes much less mysterious. In Cordis, Plugin does not mean optional decoration. It means a module with a managed place in the running application's dependency graph and lifecycle.

## 1. Cordis resembles service architecture, without the network boundary

The official [Cordis primer](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/docs/cordis-primer.md) calls Cordis "the vendored plugin framework underneath DeepSeek Harness." The word "underneath" matters. Cordis supplies the container and lifecycle rules; DSH supplies the concrete components mounted into it.

The resemblance to microservices lies in the relationship between providers and consumers, not in deployment.

| Question                                   | Microservice architecture                            | Cordis                                            |
| ------------------------------------------ | ---------------------------------------------------- | ------------------------------------------------- |
| What is composed?                          | Independently running services                       | Modules inside one process                        |
| How is a capability found?                 | A network endpoint or service-discovery name         | A Service name on `ctx`, such as `tools` or `llm` |
| How does a consumer declare a requirement? | Deployment configuration, discovery, or client setup | `inject` on the Plugin                            |
| How do components communicate?             | RPC, queues, or network protocols                    | Direct Service calls and in-process events        |
| What does the platform manage?             | Deployment, health, routing, and distributed failure | Activation, scoped ownership, and cleanup         |

The shared idea is that a consumer depends on a capability contract rather than constructing one specific provider. The different failure boundary is equally important. A microservice may be alive but unreachable across the network. A Cordis Service either exists in the current Context or it does not. If it disappears, Cordis deactivates the Plugins that require it.

This is closer to a service container with a live module lifecycle than to Kubernetes in miniature. The framework knows which Plugin provided a capability, which consumers require it, and which registrations belong to each active Plugin.

Those three jobs explain the main Cordis terms:

- A **Context** is the capability container and lifecycle scope visible to a Plugin.
- A **Plugin** is a module Cordis mounts into that Context.
- A **Service** is a named capability one Plugin exposes to other Plugins.
- **inject** declares which Services must exist before a Plugin can activate.
- An **Effect** is a change owned by an active Plugin and reversed when that Plugin leaves.

These terms become easier to remember when we follow one Plugin through its life.

## 2. A Plugin begins when Cordis calls `apply(ctx)`

The smallest useful Harness Plugin is just a TypeScript module. The repository's official [first-Plugin tutorial](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/docs/user/develop/basic/index.md) starts with this shape:

```ts
import type { Context } from '@deepseek-ai/cordis';

export const name = 'hello-plugin';

export function apply(ctx: Context) {
  console.log('[hello-plugin] plugin loaded!');
}
```

There is no Plugin base class in this example and no model interaction. The module exports a name and an `apply` function. A Cordis configuration row tells the Loader to mount that module. The Loader imports it, creates the Plugin's lifecycle scope, and calls `apply(ctx)`.

The `ctx` argument is the Plugin's doorway into the running application. The Plugin can use Services that already exist on the Context, provide a new Service, register an event listener, add a Tool, or start some owned work. Because those changes go through the current Context, Cordis can associate them with the Plugin that created them.

The important relationships all remain inside one process:

![Cordis Context connecting same-process Plugins through a Service, inject, Effects, and cleanup](/assets/img/blog/deepseek-harness-02-plugin-system/cordis-one-process.webp)

_Figure 1. Plugins meet through one Cordis Context inside a single process: providers contribute named Services, consumers declare them through inject, and Plugin-owned Effects converge on cleanup._

Cordis applies a lifecycle to this picture. Importing the module does not make the Plugin active. If the module declares required Services, Cordis keeps it waiting until those Services exist. Only then does `apply(ctx)` run.

The other important transition is from active to disposed. Suppose the Plugin registers a Tool and an event listener. Those registrations must disappear when the Plugin unloads. Cordis helpers record them as Effects owned by the current lifecycle scope. For an external resource such as a connection or timer, the Plugin can use `ctx.effect()` and return an explicit cleanup function.

So Context is more than a global object full of useful fields. It is also an ownership boundary. The same `ctx` that lets a Plugin change the application tells Cordis which changes must be taken back later.

## 3. Service, inject, and Effect define how Plugins cooperate

A Plugin often needs another Plugin before it can do useful work. Cordis represents that relationship through a named Service.

DeepSeek Harness has Services named `tools`, `llm`, `sessions`, and `agents`. A provider claims one of those stable names on the Context. A consumer uses the name without importing or constructing that provider's concrete implementation.

Consider a Plugin that wants to register a Tool. Its dependency declaration can be only one line:

```ts
export const inject = ['tools'];
```

This line is not a JavaScript import. It is a runtime readiness condition: "Do not activate this Plugin until the current Context contains the `tools` Service." When `apply(ctx)` eventually runs, `ctx.tools` is ready.

The rule stays live after startup. The fixed-version [Service guide](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/docs/user/develop/framework/service.md) specifies two consequences when a required Service disappears:

1. Cordis disposes the dependent Plugins.
2. Cordis loads them again when the Service returns.

This is the part that most resembles service orchestration. The consumer declares what it needs, while the framework derives when it may run. Configuration order does not have to encode the dependency order by hand.

Effect completes the relationship. Service describes what a Plugin can offer. inject describes what a Plugin must receive. Effect records what the Plugin changes while it is active.

Imagine a Tool provider that injects `tools`, then registers two Tool definitions and one listener. Those three registrations belong to the provider's lifecycle. If the Tool Registry disappears, Cordis deactivates the provider and withdraws all three. If the registry returns, the provider activates and registers them again. The consumer never calls a global cleanup routine and never keeps using a registry that no longer exists.

This also explains replaceability more precisely than “Plugins are flexible.” A replacement provider can claim the same Service name. Consumers keep their dependency on that name, but Cordis restarts them against the provider now present in their Context. Whether the replacement is truly compatible still depends on the Service contract, event order, cancellation behavior, and result formats.

We now have enough Cordis to answer the question that usually causes the most confusion: if a Plugin can add a Tool, are Plugin and Tool just two names for the same thing?

## 4. The official `greet` example shows where Plugin ends and Tool begins

DeepSeek Harness's official [Build a Tool tutorial](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/docs/user/develop/basic/tool.md) uses a `greet` example. The complete example is small enough to explain in the article rather than sending the reader away to reconstruct it:

```ts
import type { Context } from '@deepseek-ai/cordis';
import { defineTool } from '@deepseek-ai/dsh-tools';

export const name = 'greet-tool';
export const inject = ['tools'];

export function apply(ctx: Context) {
  ctx.tools.register(
    defineTool({
      name: 'greet',
      description: 'Greet someone by name.',
      parameters: {
        name: { type: 'string', required: true, description: 'The name to greet' },
      },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      async execute(args) {
        return `Hello, ${args.name}!`;
      },
    }),
  );
}
```

Read it from the outside inward.

First, the file is the **Plugin**. Cordis loads this TypeScript module. The exported `name` identifies it as `greet-tool`, and `inject = ['tools']` keeps it inactive until a Tool Registry Service exists.

Second, Cordis calls `apply(ctx)` at activation time. Nothing here waits for the model. The Plugin is already participating in the application because the framework has mounted it.

Third, `defineTool({...})` constructs the **Tool definition**. This object contains the part the model can understand: the Tool name `greet`, a description, and a parameter schema requiring a string called `name`. It also contains the runtime behavior that backs the contract: `execute`, the canonical output schema, and `output.render`.

Fourth, `ctx.tools.register(...)` installs that definition into the current Tool Registry. This is the exact boundary between the two concepts. The surrounding module is the Plugin. The object passed to `register` is the Tool. Tool registration is one Effect created by the Plugin.

Fifth, a later model request can include the registered Tool schema. If the user asks, "Use the greet tool to greet Ada," the model may return a Tool Call equivalent to `greet({ name: 'Ada' })`. Tool Runtime validates the arguments and invokes `execute(args)`.

Finally, `execute` returns the canonical string `Hello, Ada!`. `output.render` converts that value into model-facing content, and the result goes back into the Agent's conversation.

Registration and execution happen at different times:

![The greet Plugin registering a Tool during activation, followed by a later model-requested Tool call](/assets/img/blog/deepseek-harness-02-plugin-system/plugin-vs-tool-greet.webp)

_Figure 2. The large runtime unit on the left is the Plugin; `greet` is the smaller Tool definition it registers. Later, Agent Loop coordinates the model's Tool Call with the existing Tool Registry._

The example now separates the terms directly:

|                                | Plugin                                                                   | Tool                                                       |
| ------------------------------ | ------------------------------------------------------------------------ | ---------------------------------------------------------- |
| Concrete object in the example | The `greet-tool` TypeScript module                                       | The `greet` definition passed to `ctx.tools.register`      |
| Primary audience               | The running system and Cordis                                            | The model and Tool Runtime                                 |
| When it starts mattering       | When Cordis mounts and activates it                                      | When its schema is exposed, then when the model calls it   |
| What it can do                 | Provide or consume Services, register Tools and listeners, own resources | Describe and execute one model-requestable action          |
| Lifetime                       | Managed by its Context and dependencies                                  | Registered for as long as the owning Plugin remains active |

One Plugin may register several Tools, one Tool, or no Tool. A persistence Plugin or user-interface Plugin can participate in the application without exposing any action to the model. Conversely, a Tool cannot load itself or declare its own place in the runtime graph. A Plugin must put it there.

## 5. DeepSeek Harness applies these Cordis rules to the Agent Loop itself

DeepSeek Harness uses Cordis for more than third-party additions. Its shipped Plugin configuration includes separate entries for Session, the Tool Registry, model access, the default Agent Loop, and many Tool providers. They enter the system through the same loader and lifecycle model as the small `greet-tool` module.

The default Agent Loop makes the point concrete. At the fixed commit, its implementation is a Cordis `Service` subclass with five required dependencies:

```ts
export class AgentLoop extends Service {
  static inject = ['agents', 'sessions', 'llm', 'tools', 'systemPrompt'];

  constructor(ctx: Context, config: Config) {
    super(ctx, 'agentLoop');
    // ...
  }
}
```

This excerpt is small, but it answers the title's question. The Loop is a Plugin because Cordis mounts it, waits for its required Services, gives it a Context, and owns its teardown. The Loop also provides the named `agentLoop` Service after activation. Its central job does not place it outside the Plugin model.

The production Bash integration follows the same shape as `greet`, only with more dependencies. Its Plugin injects `tools`, `shell`, `systemPrompt`, and `shellEnv`, then registers a `bash` Tool. The model sees the Tool's name, description, and parameters. The Plugin uses the current Shell Service and participates in prompt, policy, and cleanup behavior that the model never sees.

Cordis lets DSH replace core responsibilities through named Service seams. It activates consumers only while their dependencies are valid and removes registrations with the Plugin that owns them.

The same model imposes costs. The dependency graph is dynamic, so debugging may require checking which provider exists in the current Context and which consumer has been deactivated. Replacement implementations must honor timing and cleanup contracts as well as method names. Plugins are trusted same-process code, so Cordis composition is not a sandbox or a security boundary.

This article needs no more DSH detail. Cordis manages same-process Plugins. Plugins cooperate through Services, inject, events, and Effects. A Tool is one model-facing contribution a Plugin may register.

The complete DSH composition deserves its own article. After article three explains Turns and Sessions, article four will follow how Profiles, capability providers, consumers, scopes, and the Agent Loop are assembled into one running Agent: [“How Is an Agent Assembled? Inside DeepSeek Harness's Cordis Architecture”](https://github.com/LuNa-shi/luna-shi.github.io/issues/5)

### Further reading

- [Cordis primer at the fixed commit](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/docs/cordis-primer.md)
- [Your first Plugin](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/docs/user/develop/basic/index.md)
- [Services and dependencies](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/docs/user/develop/framework/service.md)
- [The complete `greet` Tool tutorial](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/docs/user/develop/basic/tool.md)
- [DeepSeek Harness architecture at the fixed commit](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/docs/architecture.md)
