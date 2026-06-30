---
title: AI 编码时代的阅读堆栈
date: '2026-06-10'
overview: TLDR：随着代码生成变得越来越便宜，稀缺 skill 转向判断：架构、策略、系统思维、安全、测量、客户真相、组织和合作。
description: 一份精心策划的阅读笔记，将几个原始推荐列表转变为人工智能编码时代的一张图书地图，重点关注当实施成本下降时变得更有价值的能力。
math: false
toc: true
relatedPosts: false
tags:
 - ai-coding
 - reading-list
categories:
 - reading
lang: zh
translationKey: readings-books-for-ai-coding-era
canonicalSlug: readings-books-for-ai-coding-era
---

<!-- notion-sync: 37a4e07a-a023-808e-889b-ca9be817fc40 parent=Readings url=链接 0 -->

原始列表有很多书，但直通线较小：

> 当 AI 降低实施成本时，稀缺 skill 就不再是敲代码了。它正在决定什么应该存在，应该如何约束它，应该如何验证它，以及是否有人应该采用它。

这改变了值得一读的内容。

我们的目标不是收集励志书籍。目标是围绕 AI 辅助软件工作建立一系列持久的能力：架构品味、策略、系统思维、安全、测量、市场真相、组织和合作。

## 1. 架构和设计判断

AI 生成实现的速度比它决定哪些约束应成为系统骨架的速度要快。这样设计判断更有价值。

|预订 |为什么它属于 |
| --- | --- |
| [设计的设计](https://www.oreilly.com/library/view/the-design-of/9780321702081/) 作者 Frederick P. Brooks Jr. | *神话人月*的最佳后续：设计目标、​​约束、概念完整性以及跨复杂系统的协作。 |
| [软件设计哲学](https://web.stanford.edu/~ouster/cgi-bin/aposd.php) 作者：John Ousterhout |简短、密集，对于思考复杂性、深层模块和接口边界很有用。 |
| Don Norman 的[日常事物的设计](https://mitpress.mit.edu/9780262525671/the-design-of-everyday-things/) |一种具体的方式来思考可供性、反馈、约束以及为什么好的设计可以减少用户的错误。 |
| Stewart Brand 的[建筑物如何学习](https://www.penguinrandomhouse.com/books/320919/how-buildings-learn-by-stewart-brand/) |与软件的一个强有力的类比：好的系统不是完成的照片；它们可以被修复、扩展和调整。 |

我从这里开始的原因是：智能体生成的代码可以使错误的抽象更快地到达。建筑品味是对快速不连贯的防御。

## 2. 策略和瓶颈

AI 非常擅长制定计划。这样人们更容易将一系列目标与战略混淆。|预订 |为什么它属于 |
| --- | --- |
| [好策略/坏策略](https://www.penguinrandomhouse.com/books/208668/good-strategy-bad-strategy-by-richard-rumelt/) 作者：Richard Rumelt |战略是诊断、指导政策和连贯的行动，而不是愿望清单。 |
| [目标](https://northriverpress.com/the-goal-a-process-of-ongoing-improvement/) 作者：Eliyahu M. Goldratt |局部效率不是系统吞吐量。在优化一切之前找到约束。 |
| [高输出管理](https://www.penguinrandomhouse.com/books/116341/high-output-management-by-andrew-s-grove/) 作者：Andrew Grove |管理输出就是组织输出。当 AI 改变执行杠杆但不改变协调现实时很有用。 |
| [妈妈测试](https://www.momtestbook.com/) 作者：Rob Fitzpatrick |当建筑变得越来越便宜时，昂贵的错误就是建造没人真正想要的东西。 |

这条巷子是关于抵制美丽的活动。团队可以生成更多代码、更多计划和更多实验，同时仍然避免硬诊断。

## 3. 系统思考和失败

智能体系统是反馈系统。它们有延迟、隐藏耦合、激励、局部优化和漂移。线性思维很快就会被打破。

|预订 |为什么它属于 |
| --- | --- |
| [系统思考](https://www.chelseagreen.com/product/thinking-in-systems/) 作者：Donella Meadows |以可读的形式显示库存、流量、反馈循环、延迟和杠杆点。 |
| [像一个国家一样观看](https://yalebooks.yale.edu/book/9780300078152/seeing-like-a-state/) 作者：James C. Scott |警告不要让混乱的现实变得清晰，然后将抽象误认为是世界。 |
| [陷入失败](https://www.routledge.com/Drift-into-Failure-From-Hunting-Broken-Components-to-Understanding-Complex-Systems/Dekker/p/book/9781409422218) 作者：Sidney Dekker |事故常常是由于当地在压力下做出的正常决定而产生的，而不是一个明显的不良行为者。 |
| [清单宣言](https://atulgawande.com/book/the-checklist-manifesto/) 作者：Atul Gawande |有用的读物​​不是“制定清单”；而是“制定清单”。这就是复杂的专业系统如何减少遗漏并协调责任。 |这是我将与智能体评估配对的车道。如果系统持续失败，不要仅仅责怪模型。看看激励、反馈、可观察性缺失以及进入不良状态的正常路径。

## 4. 安全性、测量和不确定性

AI 辅助开发扩大了决策的范围。它还使得合理的解释变得更便宜。这提高了对抗性思维和校准测量的价值。

|预订 |为什么它属于 |
| --- | --- |
| Adam Shostack | [威胁建模](https://shostack.org/books/threat-modeling-book)设计过程中应考虑安全性：资产、攻击者、入口点、缓解措施和最差路径。 |
| [如何测量任何东西](https://hubbardresearch.com/shop/measure-anything-3-ed-signed-author/) 作者：Douglas Hubbard |许多“不可估量”的问题可以重新定义为减少不确定性的问题。 |
| [超级预测](https://www.penguinrandomhouse.com/books/227815/superforecasting-by-philip-e-tetlock-and-dan-gardner/) 作者：Philip Tetlock 和 Dan Gardner | AI 给出答案；人类仍然需要概率、证据质量和更新条件。 |
| [统计的艺术](https://www.basicbooks.com/titles/david-spiegelhalter/the-art-of-statistics/9781541675704/) 作者：David Spiegelhalter |一个通往不确定性、风险、数据和证据的良好桥梁，而不会让读者陷入公式之中。 |

主题不是悲观主义。这是与现实的接触。优秀的智能体构建者需要询问什么会改变他们的想法，什么可能会受到攻击，以及什么证据实际上支持一个主张。

## 5.值得保留的技术基础

即使有了 AI，一些基金会仍然继续支付租金，因为它们塑造了你对真实系统的心理模型。|预订 |为什么它属于 |
| --- | --- |
| [高性能浏览器网络](https://hpbn.co/) 作者：Ilya Grigorik |一种了解延迟、TCP、TLS、HTTP、浏览器 API 和 Web 性能直觉的实用方法。 |
| [数据库内部结构](https://www.oreilly.com/library/view/database-internals/9781492040330/) 作者：Alex Petrov |存储引擎、B 树、LSM、WAL、事务，以及数据库为何如此构建。 |
| [理解分布式系统](https://understandingdistributed.systems/) 作者：Roberto Vitillo |复制、分区、共识、可观察性和可靠性的地图。 |
| [理解计算](https://computationbook.com/) 作者：Tom Stuart |通过可运行的示例而不是定理优先的演示来实现自动机、语义和可计算性。 |
| [街头格斗数学](https://mitpress.mit.edu/9780262514293/street-fighting-mathematics/) 作者：Sanjoy Mahajan |估算、尺寸分析、简单案例、近似和类比作为工程工具。 |

这些书并不是为了与 AI 生成的解释竞争。它们为您提供了一个帮助您判断解释的结构。

## 6. 市场、组织和合作

如果建筑变得更便宜，采用和协调就会成为问题的更大部分。|预订 |为什么它属于 |
| --- | --- |
| [跨越鸿沟](https://www.harperbusiness.com/book/9780062292988/crossing-the-chasm-geoffrey-a-moore/) 作者：杰弗里·摩尔 |高科技产品经常在早期采用者和主流市场之间发生冲突。 |
| [与运气竞争](https://www.harpercollins.com/products/competing-against-luck-clayton-m-christensentaddy-hallkaren-dillondavid-s-duncan) 作者：Clayton Christensen、Taddy Hall、Karen Dillon 和 David Duncan |待完成的工作是针对肤浅的用户角色的有效解毒剂。 |
| [创新者的困境](https://www.harperbusiness.com/book/9780062060242/the-innovators-dilemma-clayton-m-christensen/) 作者：Clayton Christensen |优秀的组织可以理性地错过新的曲线。 |
| Tom DeMarco 和 Tim Lister 的 [Peopleware](https://www.oreilly.com/library/view/peopleware-productive-projects/9780133440706/) |很多软件问题都是环境问题、注意力问题、团队问题、组织问题。 |
| [合作的演变](https://www.basicbooks.com/titles/robert-axelrod/the-evolution-of-cooperation/9781541606845/) 作者：Robert Axelrod |对于任何阅读多智能体系统、社交困境或重复博弈合作的人来说，这是一个自然的延伸。 |

这条路线很重要，因为 AI 也降低了错误事情的成本。如果市场转型、组织、激励或合作模式错误，那么技术上令人印象深刻的产品仍然可能会失败。

## 我的候选名单

如果我必须将其减少到十，我会从这里开始：

|订单|预订 |稀缺能力|
| --- | --- | --- |
| 1 | *设计的设计* |建筑判断|
| 2 | *好策略/坏策略* |规划前诊断 |
| 3 | *目标* |瓶颈和吞吐量思考|
| 4 | *系统思考* |反馈和杠杆点|
| 5 | *威胁建模* |对抗性设计|
| 6 | *如何测量任何东西* |将不确定性转化为测量 |
| 7 | *超级预测* |概率与校准|
| 8 | *妈妈测试* |客户真相 |
| 9 | *软件设计哲学* |复杂性和接口 |
| 10 | 10 *人件* |组织作为工程的一部分|连接的想法很简单：AI 改变了杠杆作用，但它并没有消除判断力。工具越好，了解不应该构建什么、限制什么、验证什么以及真正的瓶颈在哪里就越有价值。
