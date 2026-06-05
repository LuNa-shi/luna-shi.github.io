---
title: Concordia
date: '2026-05-21'
overview: >-
  TLDR: Concordia treats LLM agents as situated social actors with memory, roles, and norms, making simulations easier
  to observe and intervene in than plain chat swarms.
description: >-
  TLDR: Concordia treats LLM agents as situated social actors with memory, roles, and norms, making simulations easier
  to observe and intervene in than plain chat swarms.
tags:
  - leibo
categories:
  - agents
  - research
math: true
toc: true
relatedPosts: true
---

<!-- notion-sync: 3674e07a-a023-8048-9620-f5ec9ea6dfc0 parent=Leibo’s paper url=https://app.notion.com/p/3674e07aa02380489620f5ec9ea6dfc0 -->

**Concordia** 是一个用 LLM 来搭建社会模拟的平台。它想解决的问题，不是单纯让多个 agent 会聊天，而是让 agent 能带着身份、记忆、情境理解和社会规范，真正进入一个可运行、可干预、可观察的社会环境里。和传统 ABM 相比，它更强调语言、常识、角色和制度这些“社会意义”的部分。

这个平台最核心的结构是两层：一层是 **agent**，一层是 **Game Master**。agent 不是简单的规则机器，而是由多个 component 拼起来的，比如身份、计划、当前观察、长期记忆、目标状态等。它每次不是直接输出一个最优动作，而是根据“我是谁”“现在是什么情境”“像我这样的人会怎么做”来生成行动。Game Master 则负责维护世界状态，解释 agent 的动作，把自然语言行动翻译成具体后果，并更新钱、位置、票数、资源这类 grounded variables。换句话说，agent 负责生成社会行为，GM 负责保证这个社会是真的在运转。

这篇文章真正想强调的，是 Concordia 里的 agent 不是 RL agent，也不是效用最大化者。它更接近一种“适当性逻辑”而不是“收益逻辑”：它不是先算哪一步回报最大，而是先判断当前处境中什么做法是合适的、符合角色的、说得通的。这也是它和 00 anchor 那篇最接得上的地方，因为它把智能放进了社会结构、文化背景和互动过程里，而不是只放在个体脑内。

不过，这篇本身并没有给出特别强的社会学结论。它更像是一篇方法论文，重点是把这个平台搭出来，并说明为什么这种搭法有意义。作者比较谨慎，一直在提醒：LLM 模拟不等于真实人类，结果要看验证方式、算法保真度、模型比较和稳健性测试。它的主要结论不是“我们已经发现某个稳定的社会规律”，而是“我们现在有了一种可以研究社会规律的工具，而且它值得被系统地发展和验证”。

![Notion image](/assets/img/notion/leibo-concordia-01.webp)

在 Concordia 里，agent 并不是直接改变世界，而是先生成一个行动意图。这个行动通常是自然语言形式的，比如“Charlie 想在杂货店里摆摊，向路人宣传 Alice 的坏事”，或者“Alice 想用手机日历约 Bob 明天下午四点开会”。这些行动本身还只是 agent 的主观意图，真正判断它会不会发生、怎么发生、会造成什么后果的是 Game Master。

Game Master 可以理解成这个模拟世界的裁判和维护者。它接收到 agent 的行动之后，会根据当前世界状态判断这个行动是否合理，并把它转化成一个具体事件。比如 Charlie 想在杂货店传播 Alice 的负面信息，GM 可能会判断他确实开始这么做了，但因为打扰了顾客，所以被店员赶了出去。这个结果就会被写成一个 event statement，成为模拟世界中真实发生过的事件。

因此，GM 不是简单地转述 agent 的行为，而是在负责把“行动意图”变成“世界变化”。它会更新世界里的 grounded variables，比如时间、位置、金钱、投票数、物品、手机 app 状态、资源数量等。agent 只负责说“我想做什么”，GM 负责判断“这件事在这个世界里实际发生了什么”。

这个世界本身也有 state，而且这个 state 主要由 GM 维护。除了每个 agent 自己的身份、记忆、计划和当前观察之外，Concordia 还维护一个更外部的世界状态。这个世界状态包括谁在哪里、现在是什么时间、发生过哪些事件、哪些资源被消耗了、哪些信息被传播了、某个 app 里新增了什么记录等。所以 Concordia 不是只有 agent 内部状态，它也有一个由 GM 维护的社会环境状态。

当 GM 判断完事件并更新世界后，它会把相关结果作为 observation 传回给 agent。但这个传回不是把整个世界状态原封不动发给所有 agent，而是根据可见性和情境，只把 agent 能观察到的部分告诉它们。有些 agent 会看到完整事件，有些只会看到局部后果，有些则完全不知道这件事发生过。这样一来，agent 的后续行为就会建立在自己的局部观察和记忆之上，而不是建立在全知视角上。

所以整个过程可以概括为：agent 提出行动意图，GM 根据世界状态判断实际事件，GM 更新世界状态，再把可观察到的结果传回给相关 agent。这个设计让 Concordia 里的社会不是一个静态背景，而是一个会随着 agent 行动不断变化、并反过来影响 agent 认知和行为的动态环境。

一个最直观的 application：**synthetic user studies in digital action space**。Concordia 可以把 agent 放进一个带数字工具的世界里，比如手机、Calendar、Email、Search 这些 app。agent 先根据自己的身份、计划和当前观察，提出一句自然语言意图，比如“我要和 Bob 约明天下午四点开会”；然后 GM 或 PhoneGameMaster 会把这句话解析成具体的 app 行为，比如打开日历、调用 `add_meeting`、写入会议、触发通知，再把结果作为新的 observation 回传给 agent。这样一来，研究者就能不依赖真人用户，先在沙盒里模拟真实产品交互。

这个 application 的意义，主要是做**产品评估和数据生成**。你可以用它来测试一个新 app 流程会不会让用户卡住，某个界面会不会引发误操作，不同的用户画像会不会有不同的使用路径，或者一个服务在不同配置下会产生什么日志。论文里甚至直接说，这种方式可以支持某种“单用户级”的 A/B 测试思路。它的价值不在于替代真实用户，而在于提供一个可重复、可控、可修改的实验台。它展示的是：Concordia 不只是能“演社会”，也能把数字产品和用户行为放进同一个可操作框架里。
