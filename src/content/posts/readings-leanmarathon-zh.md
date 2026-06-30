---
title: LeanMarathon：把长期形式化当成智能体工程
date: '2026-06-07'
overview: LeanMarathon 把论文级 Lean 形式化变成一个可恢复的多智能体工程系统：蓝图、证明 DAG、受限 worker、reviewer issue 和 CI gate 共同防止长任务漂移。
description: 一篇关于 LeanMarathon 的阅读笔记：它把 AI 辅助 Lean 形式化做成耐用的工程 harness，也给长视野智能体系统提供了几个很实用的教训。
math: true
toc: true
relatedPosts: false
tags:
 - formal-methods
 - agent-systems
categories:
 - reading
 - agents
lang: zh
translationKey: readings-leanmarathon
canonicalSlug: readings-leanmarathon
---

<!-- notion-sync: 3784e07a-a023-807c-a90f-def705e178e6 parent=Readings url=链接 2 -->

> 论文：_LeanMarathon: Toward Reliable AI Co-Mathematicians through Long-Horizon Lean Autoformalization_
>
> arXiv: `2606.05400`
>
> 代码：`YuanheZ/LeanMarathon`

## 一句话

LeanMarathon 主要不是一个更强的定理证明器，而是一个把整篇研究论文转成 Lean 的耐用 harness。

系统形态为：
```text
research paper
 -> evolving Lean blueprint
 -> proof DAG
 -> contract-scoped agents
 -> local PRs
 -> CI-gated merges
 -> sorry-free formalization
```
核心判断是：长期形式化首先是工程问题，然后才是模型能力问题。

## 为什么论文级 Lean 很难

形式化一个引理与形式化一篇论文不同。

一篇论文包含定义、引理、定理陈述、证明草图、省略步骤、隐含依赖，有时还包含错误。如果形式化陈述偏离原证明，系统仍然可能证明出某个东西，只是不是作者原本想证明的定理。

LeanMarathon 将此类失败称为“形式化转变”或“目标漂移”。

这个问题尤其危险，因为局部的成功可能隐藏全局的失败：
```text
one node compiles
but the proof graph has drifted
so later work builds on the wrong substrate
```
## 作为记录系统的蓝图

LeanMarathon 的中心抽象是蓝图：一个同时保存形式化声明和自然语言证明意图的 Lean 文件。

一个节点大致包含：
```lean
@[blueprint "lem:weighted-tail-bound"
 (statement := /-- LaTeX statement text -/)
 (proof := /-- LaTeX proof prose with dependency references -/)
 (title := /-- one-line title -/)
 (latexEnv := "lemma")]
lemma weighted_tail_bound ... : ... := by
 sorry
```
这样一个文件具有三种作用：

|角色 |它保留了什么|
| --- | --- |
| 形式化骨架 | Lean 声明、类型、证明主体 |
| 人类证明图 | LaTeX 语句、证明文字、依赖引用 |
| 共享状态 | 每个智能体编辑、CI 检查的同一份产物 |

关键是防止自然语言证明图和 Lean 依赖图悄悄分叉。

## 四个智能体角色

LeanMarathon 使用角色分离来遏制失败。

|智能体|工作 |边界|
| --- | --- | --- |
| Blueprinter | 构建初始证明骨架 | 负责分解，不负责完成证明 |
| Target-Reviewer | 检查目标陈述是否忠实 | 只读；提交 issue |
| Worker | 证明一个动态叶节点 | 只编辑自己的作用域 |
| Refiner | 修复蓝图级缺陷 | 只处理受影响的子 DAG |

这是最容易迁移的设计课。系统不信任单个智能体去同时阅读、形式化、证明、审查和修复全部内容。

它给每个智能体一份合同。

## Worker 事务

Worker 会拿到一个动态叶节点：依赖已经准备好，但证明还没完成。

工作流程是有纪律的：

| 阶段 | 目的 |
| --- | --- |
| 错误形式化审计 | 先检查 Lean 陈述是否忠实 |
| 低成本反例检查 | 在证明前先试边界情况 |
| 陈述打磨 | 让证明文字和形式化陈述对齐 |
| 形式化 | 在冻结的陈述下补完 Lean 证明 |

Worker 可以添加局部辅助引理，但不能随意改整个文件。这样并行工作不至于变成一锅合并冲突。

## Refiner 和问题区域

Refiner 处理 reviewer 或 worker 提交的问题。它会找出受问题影响的最小连通子 DAG，论文把这个区域叫作 illness area。

必须区分两种情况：

| 问题 | 含义 |
| --- | --- |
| 蓝图漂移 | 形式化不再匹配原证明 |
| 原文缺口 | 原证明本身缺步骤或有错误 |

我喜欢的原则是：如果上游陈述变化并破坏了已完成的证明，系统不会随手修补证明主体。它会把受影响的证明降级回占位符，让后续工作重新证明。

这会牺牲一些计算来保护正确性。

## CI 作为合并权限

LeanMarathon 的 CI 不只是“跑 Lean”。它检查的是蓝图合约。

| 检查 | 为什么重要 |
| --- | --- |
| Lean 编译 | 文件必须能 elaborate |
| 节点格式 | 蓝图元数据必须完整 |
| `latexEnv` 一致性 | 证明文字环境应匹配 Lean 声明类型 |
| 标签/名称规范化 | 标签和 Lean 名称保持对齐 |
| 唯一标签 | 证明图需要稳定身份 |
| 依赖一致性 | 文字依赖和 Lean 依赖要一致 |
| 引理贴近度 | 辅助引理应该连接到后续目标 |

引理贴近度检查很微妙。漂移的智能体经常证明一堆无关的机械引理。图结构检查不需要理解全部数学，也能抓住其中一部分问题。

## 值得记住的结果

这篇论文报告已完成研究级数学目标的形式化，没有剩余的 `sorry`。

| 运行 | 目标数 | Lean 行数 | 证明节点 | 剩余 `sorry` |
| --- | ---: | ---: | ---: | ---: |
| Erdos-Graham | 4 | 8,513 | 111 | 0 |
| ESS #1196 | 1 | 3,988 | 44 | 0 |
| #164 and #1217 | 2 | 14,592 | 147 | 0 |

编排成本很高：

| 运行 | 轮数 | Worker | Refiner | 合并 PR |
| --- | ---: | ---: | ---: | ---: |
| Erdos-Graham | 19 | 58 | 7 | 53 |
| ESS #1196 | 17 | 33 | 6 | 32 |
| #164 and #1217 | 40 | 111 | 25 | 93 |

这个成本本身就是重点。系统用编排成本换可恢复性和正确性。

## 形式化为调试

这篇论文最好的一点，是 Lean 反馈会暴露隐藏的数学结构。

论文里反复出现的问题包括：

- 具体实例下的虚假陈述；
- 隐藏的有界性或可求和性假设；
- 缺少库里的现成事实；
- 压缩的证明短语需要展开成许多明确引理。

这说明 proof assistant 不只是检查器。它也是智能体系统里的真实信号源。

## 为什么基线比较很重要

它和商业单智能体 baseline 的比较有意思，不是因为“某个模型输了”，而是因为它暴露了单体智能体容易卡住的位置：
```text
long proof graph
moving dependencies
statement fidelity
repair after drift
merge discipline
global consistency
```
LeanMarathon 的答案不是“让智能体更聪明”，而是“把工作变成有作用域的事务，并让 CI 决定什么能进入共享状态”。

## 限制

harness 设计不能替代缺失的数学。

这篇论文报告了一个失败案例，其中先决条件库支持太薄弱。在这种情况下，系统可以揭露差距，但它不能免费神奇地建立一个巨大的缺失理论。

边界很有用：
```text
if the proof is near available library support:
 orchestration can help decompose, verify, and repair

if the proof needs a large missing library:
 orchestration reveals the missing substrate
```
## 我的结论

LeanMarathon 是智能体系统工程的一个强有力的例子：

| MAS 问题 | LeanMarathon 的答案 |
| --- | --- |
| 共享记忆被污染 | 用蓝图、issue、PR 和 CI 做持久状态 |
| 智能体自我评价不可靠 | 把接受权交给 CI 和 reviewer |
| 并行 worker 冲突 | 冻结基底，并限制可编辑区域 |
| 长任务漂移 | 检查目标保真度、依赖一致性和图贴近度 |
| 修复扩大损坏 | 把编辑限制在问题子 DAG 内 |

可重复使用的课程：

> 长视野智能体需要一个不能被它们随手污染的基底。

对于我自己的智能体工作，我会将 LeanMarathon 作为任何任务的模板，其中局部进度很容易伪造，而全局一致性很难恢复。
