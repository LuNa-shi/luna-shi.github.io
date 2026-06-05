---
title: claude code source
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

用操作系统的时间看 claudecode

进程管理/ 文件系统/ 权限/ plugin 系统 /tools → syscall

关键点：

- 会话/ 历史/上下文管理

- 扩展

- ui

- security

- tooluse

pipeline:

message preparation( context compacting)

api calling(check token budget) → check success or not

success → check tooluse

if tooluse → append result in query, else organize and output.

退出条件：

| **出口类型** | **典型触发**       | **在哪一步最密集**        |
| ------------ | ------------------ | ------------------------- |
| 正常完成     | 无 `tool_use`      | 步骤 8                    |
| 预算耗尽     | token / 钱 / 轮次  | 步骤 6                    |
| 用户中断     | 信号 / UI 取消     | 任意 `yield` 间可协作取消 |
| 致命错误     | 不可恢复、压缩熔断 | 步骤 1 或 4               |

system prompt = static + dynamic

**ToolSearchTool： tool有一个 prompt.js**

tool 调用安全性很重要。 pretooluse and post use 层层调用

三种 context 管理：结构化剪枝，自动压缩，完全压缩

### **九节摘要**

1. **意图**：用户到底想达成什么。

1. **概念**：领域名词、约束、定义。

1. **文件**：关键路径与模块职责。

1. **错误**：未解决问题与复现信息。

1. **消息**：必须保留的用户原话要点。

1. **任务**：分解后的 TODO 与完成标准。

1. **当前工作**：下一步建议动作。

1. （若你的资料版本为 9 节，可在此扩展「环境/依赖/风险」等固定栏目）

1. **链式思考后剥离**：把中间推理移出持久上下文，只留结论。

三种 context engineering 的方法

1. compaction：当对话快接近 context window 上限时，把内容总结压缩，然后用这个摘要重新开一个新的 context window。优先高 Recall，然后 precision

1. note taking：

- Claude Code 维护 to-do list
  - 自定义 agent 维护 `NOTES.md`

1. sub agents

- 主 agent 先有一个高层计划
  - 把某个子问题分配给 sub-agent

  - sub-agent 在自己独立的 context 里深度探索、查资料、跑工具

  - 最后只把一个浓缩摘要交还给主 agent
