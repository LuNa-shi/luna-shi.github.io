---
title: 'The End of Software Engineering'
date: '2026-06-08'
overview: '这篇文章不是在提出一个新的 coding agent，而是在给 agent 时代的软件工程换底层叙事。它的核心判断是：传统软件把 code 当成系统本体和决策逻辑的载体，而 agentic system 把 LLM 当成 runtime reasoning core，code 只是为完成当前任务临时生成、调用、丢弃的工具。换句话说，软件工程的中心从“写...'
description: '这篇文章不是在提出一个新的 coding agent，而是在给 agent 时代的软件工程换底层叙事。它的核心判断是：传统软件把 code 当成系统本体和决策逻辑的载体，而 agentic system 把 LLM 当成 runtime reasoning core，code 只是为完成当前任务临时生成、调用、丢弃的工具。换句话说，软件工程的中心从“写...'
tags:
  - 'readings'
categories:
  - 'reading'
math: true
toc: true
relatedPosts: true
---

<!-- notion-sync: 3794e07a-a023-80a0-bd41-cdbf8413c599 parent=Readings url=https://app.notion.com/p/3794e07aa02380a0bd41cdbf8413c599 -->

> 这篇文章不是在提出一个新的 coding agent，而是在给 agent 时代的软件工程换底层叙事。它的核心判断是：传统软件把 code 当成系统本体和决策逻辑的载体，而 agentic system 把 LLM 当成 runtime reasoning core，code 只是为完成当前任务临时生成、调用、丢弃的工具。换句话说，软件工程的中心从“写出并维护一个静态系统”，转向“表达意图、编排 agents、验证 outcome”。

![Notion image](/assets/img/notion/readings-the-end-of-software-engineering-01.webp)

- Code 从系统本体变成临时工具: 论文把传统软件形式化成 `S=(C,D,E)`，其中 `D` 是人类提前写好的静态决策规则；agentic system 则是 `A=(M,T,Memory,Pi)`，由 LLM、工具、记忆和规划机制组成，决策逻辑在运行时生成。这个转向的关键不是“AI 帮人写更多代码”，而是 code 不再必须作为最终产品长期存在，它可以只是 LLM reasoning loop 里的中间动作。

- AaaS 是 SaaS 之后的复杂度继续外包: 作者把软件交付史写成三代：本地软件让用户承担安装和维护，SaaS 把基础设施和更新交给 vendor，Agent-as-a-Service 则进一步把理解需求、构造流程、执行工具和交付结果交给 agent。对应的范式也从 `AI -> Software -> Result` 变成 `Agent -> Result`，用户不再购买一套软件对象，而是购买被持续完成的 outcome。

- Agentic Engineering 重定义人的工作: 文章引用 LangChain 的 Agentic Engineering 叙事，把未来工程师描述成 intent architect、agent coordinator 和 outcome auditor。人的价值不再主要体现在能不能手写正确代码，而是能不能把目标、约束、架构边界、共享记忆、观测与验收机制设计清楚，让多个 agent 在可追踪的控制面里工作。

- 证据支持方向，但还不足以支撑“终局已到”: SWE-bench Verified 里 Lingma SWE-GPT 72B 达到 30.20%，接近 GPT-4o 的 31.80%，说明面向开发过程训练的模型确实在真实 issue 修复上有进展；但 EvoClaw 更像冷水，agent 在 isolated tasks 上超过 80%，到 continuous software evolution 只剩最多 38%。这意味着当前 agent 能做局部任务增强，但长期维护、上下文压缩、错误累积和验证机制仍是硬瓶颈。

- Roadmap 的价值在于校准当前位置: 论文把演进拆成 Tool-Augmented、Single-Task Autonomous、Multi-Agent Teams、Self-Evolving Ecosystems 四阶段。现在更像处在第一阶段到第二阶段之间，并且刚开始碰到第三阶段的基础设施问题：role specialization、shared memory、observability、human-in-the-loop governance 都还没有成为成熟工程标准。

**为什么重要**: 这篇文章的标题很激进，但真正有用的地方不是宣称“软件工程结束了”，而是把一个正在发生的角色迁移说清楚：builder 的杠杆从写代码，转向定义目标、设计 agent 工作流、建立验证闭环和管理长期系统状态。它适合作为 agent builder 的概念地图：如果 code 只是临时工具，那么未来真正耐久的资产可能是 agent 的 memory、tools、skills、evaluation harness、observability 和 governance，而不是某一次生成出来的代码本身。

[Paper](https://arxiv.org/abs/2606.05608) | [HTML](https://arxiv.org/html/2606.05608) | [PDF](https://arxiv.org/pdf/2606.05608)
