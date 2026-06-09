---
title: 'Anthropic Blogs: Harness Engineering and Context Engineering'
date: '2026-05-13'
overview: >-
  TLDR: Long agentic tasks fail when context, tool use, and coordination drift; the useful lesson is to treat context
  engineering as runtime design.
description: >-
  TLDR: Long agentic tasks fail when context, tool use, and coordination drift; the useful lesson is to treat context
  engineering as runtime design.
tags:
  - readings
categories:
  - reading
  - research
math: true
toc: true
relatedPosts: true
---

<!-- notion-sync: 3424e07a-a023-8070-b2e1-f2c5c55f26ea parent=Readings url=https://app.notion.com/p/3424e07aa0238070b2e1f2c5c55f26ea -->

## 0. 一句话

这些 Anthropic engineering posts 最有价值的共同点是：长任务 agent 的问题不只是“模型够不够聪明”，而是 context、tool use、evaluation、sandbox、permission 和 handoff 有没有被设计成一个稳定 runtime。

## 1. Context 会漂移，也会焦虑

Models tend to lose coherence on lengthy tasks as the context window fills. Some models also exhibit **context anxiety**: once they believe the context limit is close, they start wrapping up work too early.

Context reset 可以缓解这两个问题：清空 context window，启动一个 fresh agent，同时用 structured handoff 带上前一个 agent 的状态、已完成内容和下一步。重点不是“忘掉历史”，而是把历史压缩成新的工作入口。

## 2. Evaluator 要有具体标准

当 agent 评价自己产出的工作时，它很容易自信地表扬自己的结果，即使人看起来明显一般。所以 evaluator 不能只问：

> Is this design beautiful?

更好的问题是：

> Does this follow our principles for good design?

后者给 Claude 一个具体可评分的标准。为了减少 evaluator 的 score drift，还需要用 few-shot examples 和 detailed score breakdowns 校准偏好。

## 3. Generator / Evaluator loop

一个典型 harness 可以拆成三类角色：

- planner：拆分任务、维护方向。

- generator：根据用户提示生成 HTML / CSS / JS 或其他产物。

- evaluator：用工具直接检查产物，并按标准给出反馈。

这里很关键的一点是 evaluator 不应该只看静态截图。比如前端任务里，可以给 evaluator Playwright MCP，让它直接打开页面、交互、截图、检查实现，再对每个标准评分和写 review。反馈再回到 generator，进入下一轮迭代。

每次生成可以跑 5 到 15 轮。真正有价值的 harness 不是堆更多 agent，而是用更少但更精准的 loop，撬开更高的任务上限。

## 4. Managed agents 的结构

| 组件                   | 职责                                                                               | 不应该承担的职责                                      |
| ---------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Session                | 记录所有发生过的事件，是 append-only durable log；用于恢复、审计、上下文回放       | 不直接决定如何压缩、筛选、组织上下文                  |
| Harness / Brain        | 驱动 agent loop；调用 Claude；解释 Claude 的 tool call；路由工具调用；做上下文工程 | 不持久保存关键状态；不直接持有 sandbox 资源或长期凭据 |
| Claude                 | 推理、规划、决定下一步动作、选择工具                                               | 不直接接触底层基础设施凭据                            |
| Sandbox / Hands        | 执行代码、编辑文件、运行命令、访问初始化后的资源                                   | 不保存 agent 主状态；不持有可让攻击者扩权的全局凭据   |
| Tool Interface         | 把所有外部能力统一成 `execute(name, input) → string`                               | 不暴露具体执行环境实现细节                            |
| Provisioning           | 当需要 sandbox 时创建或重建执行环境，接口类似 `provision({resources})`             | 不要求每个 session 一开始就启动容器                   |
| MCP Proxy / Tool Proxy | 代表 Claude 调用外部服务；从 vault 取凭据并执行调用                                | 不把 OAuth token 暴露给 Claude、harness 或 sandbox    |
| Credential Vault       | 安全保存外部服务凭据                                                               | 不把 token 放进生成代码能访问的环境变量里             |

这个表的核心是把 session、brain、hands、credential proxy 分清楚：

- session 是持久化 log，用于重启 harness、审计和回放；它记录 `emitEvent`，但不负责决定下一步。

- brain / harness 驱动 agent loop，调用 Claude，解释 tool call，并做 context engineering。

- hands / sandbox 负责实际执行代码、编辑文件、运行命令，但不保存 agent 主状态。

- tool interface 把所有外部能力抽象成 `execute(name, input) -> string`。

- provisioning 只在需要时初始化或重建 sandbox。

- MCP proxy / tool proxy 代表 Claude 调外部服务，但 token 留在 credential vault 里。

session 不等于 context。context 可以通过 `getEvents()` 从 session 里按需查询、压缩和组织。

## 5. Security：brain 和 sandbox 要解耦

安全链路里最重要的是：不要让 harness、Claude 或 sandbox 直接看到 OAuth token。需要外部服务时，通过 proxy 去 vault 里取凭据并执行调用。

这也解释了为什么 brain 和 sandbox 要解耦。sandbox 应该是可创建、可销毁、可重建的执行环境，而不是长期保存主状态或全局凭据的地方。

![Notion image](/assets/img/notion/readings-anthropic-blogs-01.webp)

## 6. Takeaway

好的 agent harness 本质上是 multi-agent + multi-round iteration + runtime design。它要解决的不是“让模型多思考几步”，而是让上下文、评估、工具、安全边界和 handoff 都能在长任务里持续工作。

最后还要警惕一个常见问题：XY problem。用户提出的操作请求，可能只是解决更深层目标的一种假设路径；好的 harness 应该能在执行前把真实目标重新对齐。
