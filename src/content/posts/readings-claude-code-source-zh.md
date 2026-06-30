---
title: Claude Code 源码：把智能体看成操作系统进程
date: '2026-05-13'
overview: 从操作系统视角读 Claude Code，可以把智能体运行时具体化：上下文准备、工具、权限、子进程、取消、压缩、plugin 和退出路径。
description: 一篇源码阅读笔记：把 Claude Code 看成具有文件系统、工具调用、权限和上下文管理边界的智能体进程。
math: true
toc: true
relatedPosts: false
tags:
 - claude-code
 - agent-runtime
categories:
 - reading
 - systems
lang: zh
translationKey: readings-claude-code-source
canonicalSlug: readings-claude-code-source
---

<!-- notion-sync: 3414e07a-a023-809f-8b9d-e5c4c2151d32 parent=Readings url=链接 0 -->

## 有用的镜头

“模型使用工具”这句话太软了。

如果我将 Claude Code 视为在本地操作环境中运行的智能体进程，则它会更容易推理：
```text
model reasoning
 -> runtime prepares context
 -> model requests tool calls
 -> runtime checks permissions
 -> tools touch files, commands, plugins, and subprocesses
 -> results return to context
 -> loop exits, compacts, or continues
```
该透镜使隐藏的基材可见。

## 智能体作为进程

智能体运行时必须管理普通的类似流程的问题。

|类似操作系统的关注 |智能体运行时版本 |
| --- | --- |
|流程生命周期|开始、等待、取消、恢复、停止|
|文件系统 |源文件、差异、临时文件、注释、日志 |
|权限 |允许哪些命令、文件、域和工具 |
|plugin |通过 plugin、MCP 或工具发现加载额外功能 |
|系统调用 |工具调用是对运行时的请求，以对世界进行操作 |
|信号|用户中断、预算限制、致命错误 |

模型并不直接改变世界。它要求运行时这样做。

## 智能体循环

一个简化的循环如下所示：
```text
prepare messages
 -> call model
 -> inspect result
 -> if tool call:
 check permission
 run tool
 append tool result
 continue
 else:
 produce final answer
 stop
```
该循环的退出路径比“答案完成”更多。

|退出 |触发|它出现在哪里 |
| --- | --- | --- |
|正常完成 |尚未准备好工具调用或最终响应 |结果处理 |
|预算边界|token、成本或 turn 预算 |模型调用/运行时核算|
|用户中断 | UI 取消或发出信号 |任意合作边界|
|致命错误 |工具失效、压实失效、无效状态 |准备或结果处理|

运行时从一开始就需要所有这些。如果只设计正常的完成，那么所有其他边界都会成为一个尴尬的例外。

## 提示和工具安全

系统提示符不是一团静态的东西。它具有稳定的政策和动态的环境背景。
```text
static layer:
 long-term behavior, authority, safety boundaries

dynamic layer:
 current tools, repo state, budget, task state, environment facts
```
工具也有语义。工具不仅仅是函数签名。它具有发现文本、权限要求、输入/输出整形和安全检查。

系统调用类比有助于：
```text
model: I want to run this action
runtime: Is it allowed? How should it execute? What result is safe to return?
```
## 上下文工程

上下文与会话历史记录不同。

运行时可能具有持久事件、文件、日志和注释，但模型只能看到成形的上下文窗口。这样上下文工程成为核心运行时工作。

三个操作很重要：

|运营|目的|
| --- | --- |
|结构化修剪|保留任务关键字段并删除不相关的细节 |
|压实|用高召回率延续摘要替换旧的原始上下文 |
|交接 |将旧阶段压缩为下一阶段更强的状态快照 |

对于 coding agent，良好的延续摘要应保留：
```text
intent
constraints
files read
files modified
errors
tests run
open questions
next action
```
重点不是要漂亮地总结。重点是使下一步行动成为可能。

## 注释和子智能体

有两种做法比压缩更重要。

第一，当注释必须在上下文改动中幸存下来时，将注释写入文件系统。 `NOTES.md`、计划文件或进度日志比要求模型记住更可靠。

第二，使用子智能体进行有界探索。主智能体可以保持目标并将狭窄的调查委托给另一个上下文，然后仅使用提炼的结果。

该模式保护主要上下文：
```text
main agent keeps objective and synthesis
subagent burns context on local exploration
summary returns
```
## 我的收获

类似Claude Code的系统不仅仅是提示包装器。它们是具有运行时职责的智能体进程：

- 准备背景；
- 路由工具调用；
- 强制执行权限；
- 处理取消；
- 紧凑的历史；
- 公开 plugin；
- 保持足够的状态以继续；
- 到达边界时诚实退出。

操作系统镜头很有用，因为它将模糊的“AI 智能体”转变为可检查的东西：进程、状态、工具、权限和系统调用。
