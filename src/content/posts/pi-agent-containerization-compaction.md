---
title: 'Pi Agent: Containerization and Compaction'
date: '2026-06-04'
overview: >-
  TLDR: Coding agents need sandboxed execution, context compaction, and continuation mechanics so long-running work can
  survive safely across many tool calls.
description: >-
  TLDR: Coding agents need sandboxed execution, context compaction, and continuation mechanics so long-running work can
  survive safely across many tool calls.
tags:
  - pi-agent
categories:
  - agents
  - research
math: true
toc: true
relatedPosts: true
---

<!-- notion-sync: 3754e07a-a023-8012-aca8-e0ea5c13afb5 parent=Pi agents doc url=https://app.notion.com/p/3754e07aa0238012aca8e0ea5c13afb5 -->

Source: Pi Docs: Containerization, Compaction

---

## 1. 本文一句话

Pi 的两个核心技术问题：

```
Containerization = 如何安全地让 agent 执行代码
Compaction = 如何让 agent 在长任务中不丢上下文
```

整体关系：

```
agent wants to act
        ↓
needs tools / commands / filesystem
        ↓
Containerization

agent wants to continue
        ↓
context window is limited
        ↓
Compaction
```

一句话压缩：

```
Containerization 管执行边界；
Compaction 管长期记忆。
```

---

## 2. 为什么重要

Coding agent 不是普通 chatbot。

普通 chatbot：

```
text in → text out
```

Coding agent：

```
read files
write files
run commands
call tools
maintain session state
```

因此它需要解决两个问题：

| 问题           | 风险                                   | Pi 的方案        |
| -------------- | -------------------------------------- | ---------------- |
| agent 权限太大 | 误改 host 文件、暴露凭证、执行危险命令 | Containerization |
| 上下文太长     | 超出 context window，忘记旧任务        | Compaction       |

Takeaway：

```
可靠 coding agent = model + tools + execution isolation + context memory
```

---

## 3. Containerization

### 核心问题

Pi 默认可以以完整权限运行。

这意味着它可能访问：

```
host filesystem
processes
commands
tools
credentials
extensions
```

Containerization 的目标：

```
限制 agent 在哪里运行
限制 agent 能读写什么
限制 command / tool 的执行边界
保护 host 和 credentials
```

---

## 4. 三种 Containerization Pattern

### Pattern 1: OpenShell

OpenShell 是最完整的 sandbox 方案。

```
OpenShell gateway
        ↓
sandbox
        ↓
pi process + tools + commands + extensions
```

它控制：

```
filesystem
process
network
credentials
inference routing
```

适合：

```
需要强隔离
需要 policy-controlled sandbox
需要远程或受控 agent runtime
```

Takeaway：

```
OpenShell = whole Pi process inside policy sandbox
```

---

### Pattern 2: Gondolin Extension

Gondolin 的思路是：

```
Pi runs on host
        ↓
built-in tools and ! commands run in micro-VM
```

也就是：

```
host:
    pi process
    auth / config / session

micro-VM:
    read / write / edit / bash / grep / find / ls
```

特点：

```
Pi 的认证留在 host
工具执行进入 VM
/workspace 文件修改会写回 host
```

适合：

```
想保留本机配置和认证
但希望命令和文件操作有隔离边界
```

Takeaway：

```
Gondolin = host Pi + VM tools
```

---

### Pattern 3: Plain Docker

Docker 是最简单的方式：

```
Docker container
        ↓
pi process
        ↓
tools / commands / extensions
```

常见方式：

```
mount project to /workspace
run pi inside container
```

注意：

```
-v "$PWD:/workspace"
```

意味着：

```
container 内修改 /workspace
        ↓
实际会修改 host project
```

如果把 API keys 或 `~/.pi/agent` mount 进去，凭证也会进入 container boundary。

Takeaway：

```
Docker = simple local container, but watch mounts and credentials
```

---

## 5. 三种模式对比

| 维度          | OpenShell                       | Gondolin                    | Docker                      |
| ------------- | ------------------------------- | --------------------------- | --------------------------- |
| 隔离对象      | 整个 Pi process                 | built-in tools + ! commands | 整个 Pi process             |
| 执行环境      | policy sandbox                  | local micro-VM              | local container             |
| auth 在哪     | 可由 gateway 管理               | host                        | container 或 mounted config |
| 文件写回 host | 取决于 sandbox / upload / mount | `/workspace` 写回           | bind mount 写回             |
| 隔离强度      | 强                              | 中                          | 基础                        |
| 复杂度        | 高                              | 中                          | 低                          |

记忆：

```
OpenShell = policy sandbox
Gondolin = tool routing
Docker = simple container
```

---

## 6. Extension 边界

一个重要细节：

```
Extensions run wherever the pi process runs.
```

所以：

```
如果 Pi 在 container 里：
    extension 也在 container 里

如果 Pi 在 host 上：
    extension 默认也在 host 上
```

因此在 Gondolin 这种模式下：

```
built-in tools may run in VM
but custom extensions may still run on host
```

Takeaway：

```
隔离 built-in tools 不等于隔离所有 extensions。
```

---

## 7. Compaction

### 核心问题

长任务中，context 会不断增长：

```
messages
tool calls
tool results
file reads
file edits
bash outputs
branch history
```

当 context 太长：

```
contextTokens ↑
        ↓
exceeds context window
        ↓
agent forgets or cannot continue
```

Compaction 的目标：

```
summarize old context
keep recent messages raw
free tokens
preserve task state
```

Takeaway：

```
Compaction = 用 summary 替换旧上下文，用 recent messages 保留精度。
```

---

## 8. Compaction 什么时候触发

自动触发：

```
contextTokens > contextWindow - reserveTokens
```

默认：

```
reserveTokens = 16384
```

也可以手动触发：

```
/compact
/compact [instructions]
```

例如：

```
/compact focus on modified files and unresolved bugs
```

Takeaway：

```
Compaction 不是等爆掉才做，而是提前给模型回复留空间。
```

---

## 9. Compaction 怎么工作

核心流程：

```
1. 找到 cut point
2. 把旧消息拿出来
3. 生成 structured summary
4. 保留 recent messages
5. 后续 context = summary + recent messages
```

压缩前：

```
[old messages][middle messages][recent messages]
```

压缩后：

```
[summary][recent messages]
```

关键字段：

```
firstKeptEntryId
```

含义：

```
summary 覆盖它之前的内容
它之后的消息继续保留原文
```

Takeaway：

```
firstKeptEntryId = summary 和 raw recent context 的分界线。
```

---

## 10. 为什么不能随便截断

Compaction 不能只按 token 硬切。

原因：

```
tool call 和 tool result 是一组
如果切在中间，模型可能只看到 call，看不到 result
或者只看到 result，不知道它来自哪里
```

所以 cut point 通常选择：

```
user message
assistant message
bash execution
custom message
branch summary
```

避免切在：

```
tool result
```

Takeaway：

```
上下文压缩必须尊重 message / tool 的语义结构。
```

---

## 11. Branch Summarization

除了普通 compaction，Pi 还有 branch summarization。

它发生在：

```
/tree navigation
```

问题：

```
你在 branch A 做了一堆工作
        ↓
切到 branch B
        ↓
如果不总结，A 的上下文就丢了
```

Branch Summarization 会：

```
find common ancestor
collect old branch entries
generate summary
attach summary to new branch context
```

和 Compaction 对比：

| 机制                 | 触发                      | 目的           |
| -------------------- | ------------------------- | -------------- |
| Compaction           | context 太长或 `/compact` | 压缩当前时间线 |
| Branch Summarization | `/tree` 切换分支          | 保留旧分支信息 |

一句话：

```
Compaction 是纵向压缩；
Branch Summarization 是横向带上下文。
```

---

## 12. Structured Summary

Pi 的 summary 不是普通聊天摘要，而是 task state snapshot。

常见结构：

```
Goal
Constraints & Preferences
Progress
Key Decisions
Next Steps
Critical Context

<read-files>
...
</read-files>

<modified-files>
...
</modified-files>
```

为什么要记录文件：

```
agent 不只需要知道“聊过什么”
还需要知道“读过哪些文件、改过哪些文件”
```

Takeaway：

```
Agent summary 的重点不是好读，而是能继续执行。
```

---

## 13. Containerization vs Compaction

| 维度     | Containerization                           | Compaction                               |
| -------- | ------------------------------------------ | ---------------------------------------- |
| 解决问题 | 执行安全                                   | 上下文连续性                             |
| 管理对象 | process / filesystem / tools / credentials | messages / summaries / tokens / branches |
| 风险     | 权限过大                                   | 记忆丢失                                 |
| 核心边界 | sandbox boundary                           | context boundary                         |
| 目标     | safe action                                | reliable continuation                    |

一句话：

```
Containerization controls what the agent can do.
Compaction controls what the agent can remember.
```

---
