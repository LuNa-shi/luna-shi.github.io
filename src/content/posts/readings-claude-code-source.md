---
title: 'Claude Code Source: 把 Agent 看成一个操作系统进程'
date: '2026-05-13'
overview: >-
  TLDR: Looking at Claude Code as an OS process exposes the practical substrate of agents: files, permissions, plugins,
  subprocesses, and tool calls.
description: >-
  TLDR: Looking at Claude Code as an OS process exposes the practical substrate of agents: files, permissions, plugins,
  subprocesses, and tool calls.
tags:
  - readings
categories:
  - reading
  - systems
math: true
toc: true
relatedPosts: true
---

<!-- notion-sync: 3414e07a-a023-809f-8b9d-e5c4c2151d32 parent=Readings url=https://app.notion.com/p/3414e07aa023809f8b9de5c4c2151d32 -->

## 0. 一句话

用操作系统的视角看 Claude Code，会发现 agent runtime 的底层不是一句“模型会用工具”，而是一整套进程管理、文件系统、权限、插件和 tool call 协议。

## 1. OS 视角

可以把 Claude Code 看成一个运行在本地环境里的 agent process：

- 进程管理：任务如何启动、等待、取消、恢复。

- 文件系统：上下文、代码、diff、临时文件都落在真实路径上。

- 权限系统：哪些命令能跑，哪些文件能改，哪些操作需要确认。

- plugin system：外部能力通过插件、MCP 或 tool search 进入 runtime。

- tools as syscalls：模型不是直接改变世界，而是通过工具调用请求 runtime 执行动作。

## 2. 关键问题域

这套 runtime 里最重要的几个问题是：

- 会话、历史和上下文管理。

- 扩展系统。

- UI 和用户中断。

- security。

- tool use。

## 3. Agent loop

一个简化 pipeline 可以写成：

1. message preparation：组织上下文，必要时做 context compacting。

1. api calling：调用模型，并检查 token budget。

1. result check：判断调用是否成功。

1. tool use check：如果有 tool use，把工具结果 append 回 query；如果没有 tool use，就整理输出并结束。

## 4. 退出条件

| **出口类型** | **典型触发**       | **在哪一步最密集**                 |
| ------------ | ------------------ | ---------------------------------- |
| 正常完成     | 无 `tool_use`      | tool use check                     |
| 预算耗尽     | token / 钱 / 轮次  | api calling                        |
| 用户中断     | 信号 / UI 取消     | 任意 `yield` 间可协作取消          |
| 致命错误     | 不可恢复、压缩熔断 | message preparation / result check |

这个表提醒我：agent runtime 必须从一开始就设计退出路径。正常完成只是其中一种情况，预算耗尽、用户取消和压缩失败都要能被处理。

## 5. Prompt 与 tool safety

system prompt 可以理解成 static + dynamic 两部分。static prompt 定义长期行为边界，dynamic prompt 则把当前环境、工具、上下文预算和任务状态注入进去。

ToolSearchTool 这类工具也有自己的 prompt，例如 `prompt.js`。这说明 tool 不是简单函数，它也有“如何被发现、如何被描述、如何被约束”的语义层。

tool 调用安全性很重要，需要 pre-tool-use 和 post-tool-use 的层层检查：执行前判断是否允许，执行后再把结果整理成模型可读、且不破坏安全边界的形式。

## 6. Context engineering

我把 context 管理分成三种方式：

1. 结构化剪枝：按任务状态保留关键字段，删除无关细节。

1. 自动压缩：对话接近 context window 上限时，把内容总结压缩，再用摘要开启新的 context window。这里优先高 recall，再追求 precision。

1. 完全压缩：把旧上下文折叠成更强结构的 handoff，只保留继续任务必需的信息。

### 九节摘要

1. **意图**：用户到底想达成什么。

1. **概念**：领域名词、约束、定义。

1. **文件**：关键路径与模块职责。

1. **错误**：未解决问题与复现信息。

1. **消息**：必须保留的用户原话要点。

1. **任务**：分解后的 TODO 与完成标准。

1. **当前工作**：下一步建议动作。

1. （若你的资料版本为 9 节，可在此扩展「环境/依赖/风险」等固定栏目）

1. **链式思考后剥离**：把中间推理移出持久上下文，只留结论。

## 7. Notes 与 sub agents

除了 compaction，还有两种实践很重要：

- note taking：Claude Code 维护 to-do list；自定义 agent 可以维护 `NOTES.md`，把跨轮次信息留在文件系统里。

- sub agents：主 agent 先制定高层计划，把某个子问题分配给 sub-agent；sub-agent 在独立 context 中深度探索、查资料、跑工具，最后只把浓缩摘要交还给主 agent。

## 8. Takeaway

Claude Code 这类系统的关键，不是模型单点能力，而是 agent process 的运行时设计：如何准备消息，如何调用工具，如何退出，如何压缩上下文，如何把安全边界落实到每一次 syscall 式工具调用。
