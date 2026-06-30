---
title: 人月神话：第 1-6 章
date: '2026-06-09'
overview: 前六章在智能体编码时代仍然很重要，因为布鲁克斯主要不是对打字速度提出警告。他对协调、概念完整性、集成以及将程序转变为系统的成本提出了警告。
description: 关于为什么一旦 coding agent 使本地实现更便宜，神话人月变得更加相关而不是更少的阅读笔记。
math: true
toc: true
relatedPosts: false
tags:
 - mythical-man-month
 - software-engineering
categories:
 - reading
 - systems
lang: zh
translationKey: readings-mythical-man-month-ch1-6
canonicalSlug: readings-mythical-man-month-ch1-6
---

<!-- notion-sync: 37a4e07a-a023-800c-8af1-ee64e89eafa1 parent=Readings url=链接 0 -->

> 问：一旦智能体可以写代码，《人月神话》还值得一读吗？
>
> 我的回答：是的，可能比以前更多。布鲁克斯谈论的不仅仅是编写代码的成本。他谈论的是随着时间的推移，使软件变得连贯、可测试、记录、集成并由一群人拥有的成本。

## 简短版本

智能体编码降低了生成本地补丁的成本。它不会降低，而且常常会增加决定该补丁是否属于系统的成本。

这就是为什么前六章仍然充满活力。布鲁克斯不断回归现代工具可能模糊的区别：
```text
program -> something that runs
programming product -> something other people can use
programming system -> something that composes with other parts
systems product -> all of the above, maintained over time
```
经纪人非常擅长帮助第一个盒子。其余的仍然需要接口、测试、审查、约定、发布纪律以及可以说不的人。

## 1. 焦油坑

焦油坑并不是“编程很难”。就是有用的软件积累了义务。

可以快速生成读取 CSV、调用 API、绘制图表的脚本。团队数据管道必须验证输入、处理重试、记录故障、尊重权限、记录假设、承受模式漂移，并避免默默地毒害下游消费者。

也就是说，智能体编码的部分不会消失。它消除了“我可以生成代码吗？”的瓶颈。到“我能判断这段代码是否应该进入持久系统吗？”

因此，有用的智能体工作流程并不是“更快地编写更多代码”。这是：
```text
draft -> test -> document -> integrate -> observe -> revise
```
焦油在箭头中。

## 2. 神话般的人月

布鲁克斯著名的警告是，努力和日程安排是不可互换的。一个迟到的项目并不会因为更多的人到达而变得早。

智能体时代的版本是**智能体呼叫神话**：
```text
more agents != shorter delivery time
more branches != more coherent system
more generated code != more integrated value
```
当边界稳定时，并行性会有所帮助。当作品在概念上纠缠在一起时会很痛苦。

五个智能体编辑同一服务可以轻松产生五种命名方案、五种部分抽象和一个严重的合并瓶颈。真正的问题不是“我可以生成多少个智能体？”问题是“这个问题的哪些部分是足够分离的，可以交给独立工作者？”

## 3. 手术团队

外科手术团队一章很容易被误读为对等级制度的怀旧。我将其视为责任的设计模式。

大型系统需要很多人参与，但概念完整性需要少量的最终设计声音。在智能体工作流程中，建议采用如下结构：

|角色 |工作 |
| --- | --- |
|业主|掌握设计意图和最终差异|
|研究员|查找源上下文和约束 |
|实施者|生成候选补丁 |
|测试仪|添加回归覆盖并运行检查 |
|审稿人|寻找边界错误|
|编辑|更新文档、变更日志和示例 |

重点不是让每个智能体都平等。关键是要让每个角色发挥作用，而不是让所有角色都争夺架构权威。

## 4.概念完整性

布鲁克斯的短语“概念完整性”对我来说仍然是这本书的中心。

CLI 可以由许多贡献者实现，但仍然感觉像是一种工具。或者感觉像是一堆不相关的命令：
```text
--file
--path
inputPath
source
target_file
```
每个局部选择都可能是有道理的，但仍然会损害整体。智能体生成的代码使得大规模实现这一点变得更容易，因为每个补丁在本地都是合理的。

所以智能体编码需要更强的分离：
```text
architecture contract -> few voices, explicit rules
implementation search -> many workers, broad exploration
```
名称、API 语义、错误处理、配置形状、向后兼容性和用户可见行为不应在每个分支中重新发明。

## 5. 第二系统效应

第二个系统是危险的，因为设计师终于有了信心和积压的想法。在智能体项目中，情况会变得更糟，因为每个功能都感觉很便宜：
```text
add memory
add planner
add browser
add self-evolution
add marketplace
add policy engine
add visual debugger
```
每个特征都可以生成。这并不意味着系统可以吸收它。

对策是根据运营角度对每个功能进行定价：

|功能成本|问题 |
| --- | --- |
|延迟|循环仍然感觉很快吗？ |
|状态|什么样的新状态会变得陈旧？ |
|失效模式|这将如何打破？ |
|可观察性|坏了之后可以调试吗？ |
|评价|什么证明它有帮助？ |
|保养|演示后谁拥有它？ |

AI 降低了代码生成的边际成本。它不会降低复杂性的边际成本。

## 6. 传递信息

架构决策不会仅仅因为有人写下来就传播开来。

布鲁克斯谈论手册、会议、电话日志、正式定义和测试。在智能体工作中，我会将其压缩为一条规则：

> 在智能体可以检索规则之前，规则尚未进入系统，CI 可以检查其中的一部分，并且审查可以指向它。

这就是可执行规范很重要的原因。同一个决定应该以多种形式出现：

- 散文，让人们知道其意图；
- 类型或模式，因此工具可以强制形状；
- 测试，以便发现回归；
- 示例，让智能体有可以模仿的模式；
- 跟踪或更改日志，以便将来的调试有记忆。

与执行无关的文档就成了气氛。智能体需要操作上下文。

## 我从前六章中得到的内容

布鲁克斯的组织细节已过时。结构性警告则不然。
```text
programmer coordination -> agent orchestration
manual review -> tests, evals, traces
architecture handbook -> executable specification
late manpower -> late agent swarm
second-system effect -> prompt-away feature creep
```
教训不是“智能体很糟糕”。我想要工作流程中的智能体。我们的教训是，速度让架构学科变得更有价值，而不是更少。

如果本地实现变得便宜，稀缺的工作就会向边界转移：什么应该存在，什么应该组成，什么必须测试，什么可以删除，以及谁可以改变系统的形状。
