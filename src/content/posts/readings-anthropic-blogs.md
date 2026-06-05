---
title: Anthropic blogs
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

# Harness engineering

First is that models tend to lose coherence on lengthy tasks as the context window fills (see our post on [context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)). Some models also exhibit "**context anxiety**," in which they begin wrapping up work prematurely as they approach what they believe is their context limit. Context resets—clearing the context window entirely and starting a fresh agent, combined with a structured handoff that carries the previous agent's state and the next steps—addresses both these issues. 上下文长之后导致的不一致，以及上下文焦虑

When asked to evaluate work they've produced, agents tend to respond by confidently praising the work—even when, to a human observer, the quality is obviously mediocre. 对自己的工作过度评价

“Is this design beautiful?" is hard to answer consistently, but "does this follow our principles for good design?" gives Claude something concrete to grade against. 要有指标

I calibrated the evaluator using few-shot examples with detailed score breakdowns. This ensured the evaluator’s judgment aligned with my preferences, and reduced score drift across iterations.

首先，生成器代理会根据用户提示创建一个 HTML/CSS/JS 前端。我为评估者提供了 Playwright MCP，使其能够直接与实时页面交互，然后对每个标准进行评分并撰写详细的评论。实际上，评估者会自行浏览页面，截屏并仔细研究实现方式，然后再进行评估。这些反馈会作为输入返回给生成器，用于下一次迭代。每次生成运行 5 到 15 次迭代，每次迭代通常会根据评估者的评论，引导生成器朝着更明确的方向发展。浏览页面而不是对静态截图进行评分

planner

generator

evaluator

用更少、但更精准的 harness，去撬更高的任务上限。

harness 本质： multiagent + 多轮迭代，问题在于用更少的成本和调用次数

## Managed agents

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

session 持久化 log，用于重启 harness，保存记录，emitEvent 保存事件记录

brain → hand : execute(name,input) → string 都抽象成调用，包括 sandbox

provision，初始化容器

session ≠ context → getEvents() 操作查询上下文

安全 链路：不能让 harness 看到 token，使用 proxy

把 brain 和 sandbox 解耦— 需要的时候再 init sandbox

cattle vs pet

![Notion image](/assets/img/notion/readings-anthropic-blogs-01.webp)

xy problem
