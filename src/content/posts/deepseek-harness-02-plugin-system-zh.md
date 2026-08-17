---
title: '为什么 Agent Loop 也是插件？DeepSeek Harness 的插件系统'
date: '2026-08-17'
overview: >-
  TLDR：Cordis 是 DeepSeek Harness 底下的同进程插件框架。它把 TypeScript 模块装入 Context，用具名 Service 连接提供方与使用方，通过 inject 等待依赖就绪，并在 Plugin 离开时撤回它拥有的 Effect。Tool 只是 Plugin 可能注册的一份模型可见动作定义。DeepSeek Harness 把同一套生命周期规则用于 Tool Registry、Session，甚至 Agent Loop。
lang: zh
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

**如果熟悉微服务，可以先把 Cordis 想成一种被压进单进程的“微服务式组件架构”。**

TLDR：Cordis 是 DeepSeek Harness 底下的同进程插件框架。它把 TypeScript 模块装入 Context，用具名 Service 连接提供方与使用方，通过 inject 等待依赖就绪，并在 Plugin 离开时撤回它拥有的 Effect。Tool 只是 Plugin 可能注册的一份模型可见动作定义。DeepSeek Harness 把同一套生命周期规则用于 Tool Registry、Session，甚至 Agent Loop。

> 版本说明：本文依据 DeepSeek Harness commit [`47f94385`](https://github.com/deepseek-ai/deepseek-harness/commit/47f943859bef60e4160492346772ded9b24f765a) 核验，时间为 2026 年 8 月 16 日。该版本对应 `dsh@0.1.0-rc.5`。项目仍处于开发者预览阶段，后续版本可能改变本文介绍的设计。

“像微服务”是一个有用的起点。一个组件用稳定名字提供某项能力，另一个组件声明自己需要它。框架等到提供方就绪，再让使用方运行。以后即使换掉提供方，使用方仍可依赖原来的能力约定。

但 Cordis 不会把每个组件变成一台服务器。它的 Plugin 是装在同一个 Node.js 进程里的可信模块，通常通过方法调用和进程内事件通信，不走 RPC。Cordis 管的是组件组合、依赖是否就绪以及退出时怎样清理，不是网络路由、独立部署或分布式故障恢复。

有了这条边界，Cordis 是什么就清楚多了：它不是 DeepSeek Harness 里的某一个 Plugin，而是负责装入和管理所有 DSH Plugin 的底层框架。

因此，“Agent Loop 也是 Plugin”并不是说 Agent Loop 可有可无。Cordis 里的 Plugin 也不是给完整软件增加功能的外围附件。它指的是一个在运行系统中拥有明确依赖、作用范围和生命周期的模块。

## 1. Cordis 像服务化架构，但没有网络边界

官方 [Cordis primer](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/docs/cordis-primer.md) 对它的定义是：DeepSeek Harness 底下内置的插件框架。“底下”说明了两者的关系。Cordis 提供容器和生命周期规则；DSH 提供被装入其中的具体组件。

它与微服务相似的是提供方和使用方的关系，而不是部署方式。

| 问题             | 微服务架构                       | Cordis                                       |
| ---------------- | -------------------------------- | -------------------------------------------- |
| 组合的对象       | 各自运行的独立服务               | 同一进程里的模块                             |
| 怎样找到能力     | 网络地址或服务发现名称           | `ctx` 上的 Service 名称，例如 `tools`、`llm` |
| 怎样声明依赖     | 部署配置、服务发现或客户端配置   | Plugin 上的 inject                           |
| 组件怎样通信     | RPC、消息队列或网络协议          | 直接调用 Service 和进程内事件                |
| 平台主要管理什么 | 部署、健康检查、路由和分布式故障 | 激活、作用范围、所有权和清理                 |

两者共享的判断是：使用方应该依赖能力约定，而不是亲自构造某个具体提供方。它们的故障边界却完全不同。一个微服务可能仍在运行，只是网络不可达；Cordis Service 在当前 Context 里要么存在，要么不存在。Service 消失以后，Cordis 会停用所有把它列为必需依赖的 Plugin。

所以，Cordis 更像一个带有动态生命周期的 Service 容器，而不是缩小版 Kubernetes。它知道哪一个 Plugin 提供了能力，哪些 Plugin 正在等待或使用这项能力，也知道当前注册内容属于谁。

Cordis 的几个主要概念分别对应这些工作：

- **Context**：Plugin 当前能够看见的能力容器，也是它的生命周期作用范围。
- **Plugin**：由 Cordis 装入 Context 的模块。
- **Service**：一个 Plugin 用稳定名字提供给其他 Plugin 的运行时能力。
- **inject**：Plugin 激活前必须存在的 Service 清单。
- **Effect**：Plugin 激活期间造成、并在它离开时反向撤回的变化。

只背这些定义仍然很抽象。下面直接跟着一个 Plugin 从装入走到退出。

## 2. Cordis 调用 `apply(ctx)` 时，一个 Plugin 才真正开始运行

最小的 Harness Plugin 只是一个 TypeScript 模块。仓库里的官方[第一个 Plugin 教程](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/docs/user/develop/basic/index.zh.md)从下面这个结构开始：

```ts
import type { Context } from '@deepseek-ai/cordis';

export const name = 'hello-plugin';

export function apply(ctx: Context) {
  console.log('[hello-plugin] plugin loaded!');
}
```

这里没有 Plugin 基类，也没有模型参与。这个文件只导出了名字和 `apply` 函数。Cordis 配置里的一行记录告诉 Loader 要装入哪个模块。Loader 导入文件，为它建立生命周期作用范围，然后调用 `apply(ctx)`。

`ctx` 是这个 Plugin 进入运行系统的入口。它可以从 Context 取得已经存在的 Service，也可以提供新的 Service、注册事件监听、加入 Tool，或者启动一项由自己负责的工作。因为这些变化都经过当前 Context，Cordis 能把它们记在创建者名下。

这些关系始终留在同一个进程里：

![Cordis Context 在单进程内通过 Service、inject、Effect 和 cleanup 连接多个 Plugin](/assets/img/blog/deepseek-harness-02-plugin-system/cordis-one-process.webp)

_Figure 1（图 1）：多个 Plugin 在同一个进程里的 Cordis Context 上相遇。提供方贡献具名 Service，使用方通过 inject 声明依赖，Plugin 拥有的 Effect 最终沿 cleanup 路径撤回。_

Cordis 会在这张关系图之上管理生命周期。模块被导入以后，Plugin 仍不一定激活。如果它声明了必需 Service，Cordis 会让它等待。等依赖全部出现以后，`apply(ctx)` 才会执行。

Plugin 停用时，它在运行期间造成的变化也要消失。假设它注册了一项 Tool 和一个事件监听，Cordis 的注册辅助方法会把两项变化记录成当前 Plugin 拥有的 Effect。如果 Plugin 打开了网络连接或定时器之类的外部资源，也可以用 `ctx.effect()` 明确返回清理函数。

所以，Context 不只是一个装满常用字段的全局对象。它还是所有权边界。同一个 `ctx` 一方面允许 Plugin 改变运行系统，另一方面也告诉 Cordis：这些变化以后应该跟着谁一起撤回。

## 3. Service、inject 和 Effect 决定 Plugin 怎样协作

一个 Plugin 往往要等另一个 Plugin 提供能力以后才能工作。Cordis 用具名 Service 表达这种关系。

DeepSeek Harness 中有名为 `tools`、`llm`、`sessions` 和 `agents` 的 Service。提供方在 Context 上占据一个稳定名称；使用方按名称取得能力，不必导入某个具体实现，更不需要亲自决定怎样创建它。

如果一个 Plugin 要注册 Tool，它的依赖声明可以只有一行：

```ts
export const inject = ['tools'];
```

这不是 JavaScript import，而是一项运行时就绪条件：当前 Context 里没有 `tools` Service，就不要激活这个 Plugin。等 Cordis 最终调用 `apply(ctx)` 时，`ctx.tools` 已经可以使用。

这条规则在启动结束后仍然有效。固定版本的 [Service 文档](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/docs/user/develop/framework/service.zh.md)明确写了必需 Service 消失后的两步行为：

1. Cordis 自动停用并清理依赖它的 Plugin。
2. Service 恢复以后，Cordis 再次装入这些 Plugin。

这一部分最像服务编排。使用方只声明自己需要什么，框架根据能力是否存在决定它何时可以运行；配置文件不必靠手工排列顺序来碰运气。

Effect 补上了最后一块。Service 描述 Plugin 能提供什么，inject 描述 Plugin 必须先拿到什么，Effect 则记录 Plugin 在激活期间改变了什么。

例如，一个 Tool Provider Plugin 注入 `tools`，随后注册两项 Tool 和一个监听器。这三项注册都归它的生命周期所有。如果 Tool Registry 消失，Cordis 会停用提供方，同时撤掉三项注册。Registry 恢复以后，提供方重新激活，再重新注册。使用方不会继续调用已经消失的 Registry，也不需要某个全局清理函数猜测应该删掉哪些内容。

这样也能更准确地理解“可替换”。新的提供方可以占据同一个 Service 名称，使用方继续依赖这个名字；Cordis 会让使用方在当前提供方就绪后重新运行。当然，名字相同并不自动保证兼容。事件顺序、取消方式、结果格式和退出行为仍然必须遵守同一份 Service 约定。

现在已经有足够的 Cordis 背景，可以处理最容易混淆的问题：如果 Plugin 能增加 Tool，Plugin 和 Tool 是否只是同一个东西的两种叫法？

## 4. 官方 `greet` 例子清楚地划出了 Plugin 与 Tool 的边界

DeepSeek Harness 官方的[开发一个 Tool 教程](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/docs/user/develop/basic/tool.zh.md)使用了 `greet`。这个例子足够短，正文可以把它完整讲明白，无需让读者跳到链接里自己拼出结论：

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

可以从外向内读这段代码。

第一，整个文件是 **Plugin**。Cordis 装入这个 TypeScript 模块。导出的 `name` 把它标识为 `greet-tool`，而 `inject = ['tools']` 让它在 Tool Registry Service 出现前保持等待。

第二，Cordis 在激活阶段调用 `apply(ctx)`。这里完全不需要等待模型。框架装入 Plugin 以后，它就已经开始参与运行系统。

第三，`defineTool({...})` 创建 **Tool 定义**。其中一部分是模型能够理解的接口：Tool 名字 `greet`、用途描述，以及一个要求传入字符串 `name` 的参数 schema。另一部分是运行系统用于兑现接口的行为：`execute`、规范输出 schema 和 `output.render`。

第四，`ctx.tools.register(...)` 把这份定义装进当前 Tool Registry。这一行就是两个概念的精确边界：外面的 TypeScript 模块是 Plugin，传给 `register` 的对象是 Tool。注册 Tool 是这个 Plugin 创建的一项 Effect。

第五，后续模型请求可以带上已经注册的 Tool schema。用户输入 `Use the greet tool to greet Ada.` 以后，模型可能返回相当于 `greet({ name: 'Ada' })` 的 Tool Call。Tool Runtime 先校验参数，再调用 `execute(args)`。

最后，`execute` 返回规范字符串 `Hello, Ada!`。`output.render` 再把这个值转换成模型可见的内容，结果被放回 Agent 的对话中。

注册发生在 Plugin 激活时，执行发生在模型调用时：

![greet Plugin 在激活时注册 Tool，模型稍后再请求执行这项 Tool](/assets/img/blog/deepseek-harness-02-plugin-system/plugin-vs-tool-greet.webp)

_Figure 2（图 2）：左侧较大的运行单元是 Plugin，`greet` 是它注册进去的较小 Tool 定义。稍后模型发出 Tool Call 时，Agent Loop 才在模型与现有 Tool Registry 之间协调这次执行。_

这个例子已经把两者分开：

|                  | Plugin                                      | Tool                                      |
| ---------------- | ------------------------------------------- | ----------------------------------------- |
| 例子里的具体对象 | `greet-tool` TypeScript 模块                | 传给 `ctx.tools.register` 的 `greet` 定义 |
| 主要面向谁       | Cordis 与整个运行系统                       | 模型与 Tool Runtime                       |
| 何时开始生效     | Cordis 装入并激活它时                       | schema 被暴露时，以及模型调用时           |
| 可以做什么       | 提供或使用 Service，注册 Tool、监听器和资源 | 描述并执行一项模型可以请求的动作          |
| 生命周期         | 由 Context 和依赖关系管理                   | 只在拥有它的 Plugin 保持激活时存在        |

一个 Plugin 可以注册多个 Tool、一个 Tool，也可以完全不注册 Tool。持久化 Plugin 或用户界面 Plugin 能参与整个应用，却不需要向模型暴露动作。反过来，Tool 不能自己装入系统，也不能声明自己处在依赖图的什么位置；必须由 Plugin 把它注册进去。

## 5. DeepSeek Harness 把同一套规则用在 Agent Loop 上

DeepSeek Harness 不只用 Cordis 管理第三方扩展。它自带的配置会分别装入 Session、Tool Registry、模型接入、默认 Agent Loop 和多个 Tool Provider。它们与刚才的 `greet-tool` 一样，都经过 Cordis Loader 和同一套生命周期规则进入系统。

默认 Agent Loop 是最直接的证据。在本文固定的版本中，它是 Cordis `Service` 的子类，并声明了五项必需依赖：

```ts
export class AgentLoop extends Service {
  static inject = ['agents', 'sessions', 'llm', 'tools', 'systemPrompt'];

  constructor(ctx: Context, config: Config) {
    super(ctx, 'agentLoop');
    // ...
  }
}
```

这几行已经足以回答标题。Agent Loop 是 Plugin，因为 Cordis 负责装入它、等待它的必需 Service、给它 Context，并在退出时清理它。激活以后，它又以 `agentLoop` 这个名字向其他 Plugin 提供 Service。职责位于运行流程中心，并不会让它脱离 Plugin 模型。

正式的 Bash 集成也与 `greet` 采用相同结构，只是依赖更多。Bash Plugin 会 inject `tools`、`shell`、`systemPrompt` 和 `shellEnv`，然后注册一项名为 `bash` 的 Tool。模型只看见 Tool 名字、描述和参数；Plugin 则在模型看不见的地方使用当前 Shell Service，并参与提示词、策略和清理过程。

Cordis 因此给 DSH 带来三项具体性质。核心职责可以沿具名 Service 接缝替换；使用方只在依赖有效时激活；注册内容会跟着拥有它的 Plugin 一起退出，不会变成失去来源的全局状态。

同一套模型也会增加调试成本。依赖图会动态变化，排查问题时需要确认当前 Context 中究竟是哪一个提供方存在、哪些使用方已经停用。替换实现除了方法名字相同，还必须兼容时间顺序和清理方式。Plugin 仍是同进程可信代码，所以 Cordis 提供的是组合和生命周期，不是沙箱或权限边界。

本篇讲到这里就够了。需要记住的词义是：Cordis 管理同进程 Plugin；Plugin 通过 Service、inject、事件和 Effect 协作；Tool 只是 Plugin 可能注册的一项模型可见动作。

DSH 怎样完整组装运行系统，应当单独展开。第 3 篇解释 Turn 与 Session 以后，第 4 篇会继续讨论 Profile、能力提供方、使用方、scope 和 Agent Loop 怎样共同组成一个实际运行的 Agent：[一个 Agent 是怎样被组装出来的？拆解 DeepSeek Harness 的 Cordis 架构](https://github.com/LuNa-shi/luna-shi.github.io/issues/5)

### 延伸阅读

- [固定版本的 Cordis primer](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/docs/cordis-primer.zh.md)
- [第一个 Plugin](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/docs/user/develop/basic/index.zh.md)
- [Service 与依赖](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/docs/user/develop/framework/service.zh.md)
- [完整的 `greet` Tool 教程](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/docs/user/develop/basic/tool.zh.md)
- [固定版本的 DeepSeek Harness 架构文档](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/docs/architecture.zh.md)
