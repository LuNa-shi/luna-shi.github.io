---
title: Pi Agent：容器化与上下文压缩
date: '2026-06-04'
overview: coding agent 同时需要两个边界：一个控制它们可以做什么的执行边界，以及一个控制它们在长时间工作中可以记住的内容的上下文边界。
description: 关于 Pi Agent 容器化、压缩、分支汇总以及为什么 coding agent 可靠性取决于沙箱和连续内存的系统说明。
math: true
toc: true
relatedPosts: false
tags:
 - pi-agent
 - agent-runtime
categories:
 - agents
 - research
lang: zh
translationKey: pi-agent-containerization-compaction
canonicalSlug: pi-agent-containerization-compaction
---

<!-- notion-sync: 3754e07a-a023-8012-aca8-e0ea5c13afb5 parent=Pi agents doc url=链接 0 -->

> 来源：关于容器化和压缩的 Pi 文档。

## 系统形态

coding agent 不是具有更好提示的聊天机器人。
```text
chatbot:
 text in -> text out

coding agent:
 read files
 write files
 run commands
 call tools
 preserve task state
```
这会产生两个独立的可靠性问题：

|问题 |边界|缺失则失败 |
| --- | --- | --- |
|智能体可以作用于机器|集装箱化|主机文件、凭据和进程被暴露 |
|智能体必须长期工作 |压实|当上下文填满时任务会丢失内存 |

简短版本：
```text
containerization controls what the agent can do
compaction controls what the agent can remember
```
## 容器化

执行边界答案：
```text
where does the agent run?
what filesystem can it see?
which commands can it execute?
which credentials are available?
what network access is allowed?
where do file edits land?
```
对于 coding agent 来说，这些不是部署细节。它们定义每个工具调用的爆炸半径。

## 三种模式

|图案|形状|最适合|留意|
| --- | --- | --- | --- |
|开放外壳|整个 Pi 进程在策略网关/沙箱后面运行 |强隔离、集中控制运行时 |更高的操作复杂性 |
|贡多林延伸 | Pi 保留在主机上，但内置工具和 shell 命令在微型虚拟机中运行 |保留本地身份验证/配置，同时隔离工具执行 |自定义扩展仍可在主机上运行 |
|普通 Docker | Pi 在已安装项目文件的本地容器内运行 |简单的本地隔离|绑定挂载仍写入宿主项目 |

Docker 模式是最容易被误解的：
```bash
docker run -v "$PWD:/workspace" ...
```
该安装意味着 `/workspace` 内的编辑是对宿主项目的真正编辑。如果还安装了 API 密钥或智能体配置，则容器边界包括这些凭据。

## 扩展边界

有一个细节非常重要：
```text
extensions run wherever the Pi process runs
```
因此，在类似 Gondolin 的设置中：
```text
built-in tools -> micro-VM
custom extensions -> maybe still host
```
工具隔离与完全扩展隔离不同。一个好的沙箱模型应该说明哪个代码路径拥有每个权限。

## 压实

内存边界回答了一个不同的问题：在对话变得太大后，智能体如何继续？

长时间的编码会话累积：
```text
messages
tool calls
tool results
file reads
file edits
test outputs
branch history
user corrections
```
压缩用结构化摘要替换旧的原始上下文，同时保持最新消息完整。
```text
before:
 [old messages][middle messages][recent messages]

after:
 [summary][recent messages]
```
我们的目标不是创造一个令人愉快的人类总结。目标是保留足够的任务状态以便智能体继续工作。

## 安全切入点

压缩不应该盲目地按令牌数进行切片。

工具调用和工具结果是一体的。如果剪切发生在它们之间，则模型可能会看到没有生成结果的命令的结果，或者看到没有结果的命令。

好的切入点往往是：

- 用户消息；
- 助理消息；
- 完成的命令执行；
- 分支摘要；
- 自定义状态快照。

不好的切入点包括工具-结果对的中间。

## 结构化摘要

延续摘要应该看起来更像任务状态而不是散文：
```text
Goal
Constraints and preferences
Progress
Key decisions
Current blockers
Next steps

Read files:
 ...

Modified files:
 ...

Commands run:
 ...
```
对于 coding agent 来说，文件和命令历史记录是内存的一部分。如果没有它们，智能体可能会重复工作或失去更改存在的原因。

## 分支总结

分支汇总解决了相关问题。当用户从一个工作分支导航到另一个工作分支时，智能体需要废弃分支的可移植摘要。

|机制|触发|目的|
| --- | --- | --- |
|压实|上下文太长或用户请求它 |压缩当前时间线|
|分支总结|跨分支机构导航 |从另一个分支携带有用的状态 |

一是垂直压缩。另一个是横向上下文迁移。

## 我的收获

容器化和压缩是成对的设计问题。

一个可以安全行动但不记得的智能体将会停滞不前。一个能够完美记忆但以广泛权限对主机进行操作的智能体是危险的。

可靠的 coding agent 需要：
```text
safe action + reliable continuation
```
这就是我想保留的有用的思维模式。
