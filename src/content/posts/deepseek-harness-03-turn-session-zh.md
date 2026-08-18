---
title: '一句“修掉这个 Bug”之后：DeepSeek Harness 如何组织 Turn 与 Session？'
date: '2026-08-17'
overview: >-
  TLDR：在 DeepSeek Harness 里，Follow-up Input 可以唤醒 Agent Loop。Turn 是一段连续运行，里面可以有多个 Step；每个 Step 对应一次模型请求，以及这次模型输出要求执行的 Tool。Session Event Log 记录的不只是聊天，还包括运行边界、模型可见内容和动作结果。Agent Loop 作为 Plugin 负责按顺序协调这些 Service，而 Persistence、Resume、Crash Recovery 与 Fork 都建立在同一份历史之上。
lang: zh
translationKey: deepseek-harness-03-turn-session
canonicalSlug: deepseek-harness-03-turn-session
tags:
  - deepseek-harness
  - agent-runtime
  - session
  - plugin-system
  - harness-engineering
categories:
  - agents
  - systems
toc: true
---

**一句很短的 Follow-up Input，可能要经过多次模型请求，一个 Turn 才会结束。**

TLDR：在 DeepSeek Harness 里，Follow-up Input 可以唤醒 Agent Loop。Turn 是一段连续运行，里面可以有多个 Step；每个 Step 对应一次模型请求，以及这次模型输出要求执行的 Tool。Session Event Log 记录的不只是聊天，还包括运行边界和动作结果。Agent Loop 作为 Plugin 负责按顺序协调这些 Service，而 Persistence、Resume、Crash Recovery 与 Fork 都建立在同一份历史之上。

> 版本说明：本文依据 DeepSeek Harness commit [`47f94385`](https://github.com/deepseek-ai/deepseek-harness/commit/47f943859bef60e4160492346772ded9b24f765a) 核验，时间为 2026 年 8 月 17 日。该版本对应 `dsh@0.1.0-rc.5`。项目仍处于开发者预览阶段，后续版本可能改变本文介绍的设计。

## 1. 一个 Input 可以推动多个 Step

假设用户输入：

```text
sum([]) 应该返回 0，现在却返回 undefined。修掉这个 Bug。
```

我们熟悉的 Agent Loop 会把后续过程画成一个循环：模型选择动作，调用 Tool，读取结果，再次请求模型。这个模型没有错，但它省略了一个关键问题：上面这一句 Input 会对应多少次模型请求？运行时又在哪里给这些请求画上共同边界？

DeepSeek Harness 首先把进入 Agent 的消息或运行时信号看作 **Input**。Input 进入 Agent inbox，等待运行时认领，但它不是包住后续所有内容的持久化层级。Follow-up Input 可以唤醒空闲 Agent，让 driver 继续运行。

当一个 Follow-up Input 唤醒空闲 Agent 时，运行时打开一个 **Turn**。Turn 表示一段连续的 Agent 活动：从唤醒开始，到当前已经没有后续工作仍然欠着为止。一个 Turn 可以包含零个或多个 **Step**。

一个 Step 对应一次模型请求，以及这次模型输出所要求执行的全部 Tool。边界围绕的是一次模型调用，不是一条用户消息，也不是单独一次 Tool Call。如果模型调用 Tool 后还需要根据 Tool Result 继续判断，运行时会结束当前 Step，并在同一个 Turn 中打开下一个 Step。

最小路径可以写成：

```text
Input 1：“sum([]) 应该返回 0。修掉这个 Bug。”

Turn 1
├─ Step 1：模型请求修改；修改 Tool 返回成功
├─ Step 2：模型请求运行测试；测试 Tool 返回通过
└─ Step 3：模型不再请求 Tool，给出最终回答

Input 2：“为什么 empty input 应该返回 0？”

Turn 2
└─ Step 1：模型从同一个 Session 的历史中取得前文并直接解释
```

这条路径有两个 Turn，却只有一份持续增长的历史。第二条 Input 不会重新打开 Turn 1，而是在同一个 Agent 和 Session 上启动 Turn 2。

第一个例子故意把失败现象写得很明确，因此模型可以直接修改、验证并说明结果。真实的 Coding Agent 往往还要搜索文件、读取实现、比较调用点、运行多轮测试，于是同一个 Turn 会出现更多 Step。Step 数量变多不会改变这里的模型：每次模型请求形成一个新的 Step，多个 Step 仍然可以属于同一个 Turn。

接下来需要把这两个边界说得更精确。

## 2. Turn 与 Step 标记的是两种不同边界

Turn 不是“一条用户消息”，Step 也不是“一个动作”。

**Turn 是运行边界。** 它把一次连续运行包起来。只要运行时还欠下一次模型请求、还要处理已经返回的 Tool Result，或者已经接纳了应该进入下一轮模型请求的信息，当前 Turn 就可能继续。

**Step 是模型请求边界。** 每次准备一次请求、得到一次模型输出，并执行这次输出要求的 Tool，就构成一个 Step。Tool Result 会进入 Session，下一次模型请求再从更新后的历史中读取它。

Input 不是位于 Turn 之上的第三种存储结构。它描述进入 Agent inbox 的信息。不同 Input 可以有不同作用：Follow-up Input 会唤醒空闲 Agent并进入下一个 Turn；Steering Input 可以进入正在运行的 Turn 的下一个 Step；注入的运行时上下文可以先留在 inbox 中，等待其他消息真正唤醒 Agent。只有被接纳并进入模型可见历史的 Input，才会作为持久事件写入 Session。

一个 Step 也可能包含多个 Tool Call。只要它们来自同一次模型输出，就仍然属于同一个 Step。Tool Service 可以根据执行规则串行或并行处理这些调用，Agent Loop 需要保证结果以稳定方式回到 Session。

相反，一个 Step 也可以完全不调用 Tool。Turn 1 的 Step 3 就是如此：测试结果已经存在于 Session 中，模型再次被调用，读取结果后给出最终说明。虽然没有 Tool Call，这仍然是一次模型请求，因此仍然是一个 Step。

一个 Turn 甚至可以没有 Step。固定版本会在认领首个 Input 之前记录 `turn/start`。如果 pre-step 扩展拒绝了这条 Input，或者准备后的内容为空，运行时仍然会记录 Turn 的结束，却不会伪造不存在的 `step/start`、模型请求和 `step/end`。

Turn 结束只表示当前已经没有后续工作仍然欠着，不表示人脑中更大的目标从此彻底完成。用户稍后可以继续提供 Follow-up Input；如果 Agent 已经空闲，它会打开新的 Turn，而 Session 继续保存前面所有 Turn。

因此，正确的包含关系是：

```text
Session
├─ Turn 1
│  ├─ Step 1
│  ├─ Step 2
│  └─ Step 3
└─ Turn 2
   └─ Step 1
```

Input 是触发或补充运行的信息，不是和 Session、Turn、Step 并列的持久化层级。

现在边界已经明确，下一步就是回答：谁来决定这些边界何时打开、何时关闭？

## 3. Agent Loop 掌握顺序，Service 提供能力

上一篇已经解释过，Plugin 在 DeepSeek Harness 中不是完整应用之外的可选附件，而是由 Cordis 装入 Context、等待依赖并拥有明确生命周期的运行模块。Agent Loop 虽然位于执行主线上，仍然符合这套 Plugin 模型。

在固定 commit 中，默认 Agent Loop 是一个 Cordis `Service`，并声明五项必需依赖：

```text
agents       发布和查找当前 live Agent
sessions     创建并持有 Session
llm          准备并流式执行模型请求
tools        提供 Tool Registry 和 Tool Call 执行入口
systemPrompt 组装 prompt sections 与 Tool schemas
```

这五项依赖说明了一个重要边界：Agent Loop 不会在自己的实现里重新造一套 Session、模型客户端、Tool Registry 和 prompt 组装器。它拥有 live driver，其他 Service 提供各自能力。

Agent Loop 的职责可以拆成两条路径。

第一条是 Agent 生命周期路径：

```text
Agent Loop Plugin
  → 创建新的 Session，或从 Persistence 恢复已有 Session
  → 围绕这份 Session 创建一个 scoped live Agent
  → 把 Agent 发布到 Agent Registry
  → 管理它的运行、取消与 teardown
```

这里的 live Agent 是当前进程里的运行对象。Resume 并不会让旧进程中的 JavaScript 对象重新出现；它会先加载同一个 Session 的持久历史，再围绕这份历史建立新的 live Agent scope。Agent Loop Plugin 卸载时，它登记的 factory、创建的 Agent 以及相关 Effect 会按顺序退出。

第二条是 Turn 与 Step 的热路径。固定版本中的顺序比“打开 Step，调用模型”更精确：

1. Agent Loop 先追加 `turn/start`，再从 inbox 认领本轮候选 Input。
2. System Prompt Service 根据当前 Agent scope 组装 prompt sections、变量和 Tool schemas。
3. `agent/pre-step` 允许其他 Plugin 重写或拒绝这次候选输入。
4. 只有内容获得接纳后，Agent Loop 才追加 `step/start` 与模型可见的 `user/message`。
5. Session 根据已有事件派生模型历史。
6. Agent Loop 让 LLM Service 准备模型 route、request config，并开始流式请求。
7. 模型输出以原始 chunk 和组装后的 assistant message 进入 Session。
8. 如果输出包含 Tool Call，Agent Loop 把它交给 Tool Service。Tool Service 负责查找定义、验证参数、执行调用并返回 Tool Result。
9. Tool Call 与 Tool Result 进入 Session，Agent Loop 关闭当前 Step。
10. 如果 Tool Result 或新接纳的信息要求模型继续处理，Agent Loop 在同一个 Turn 中打开下一 Step；否则它追加带有明确原因的 `turn/end`。

这条顺序同时回答了“Agent Loop 负责什么”和“它使用其他 Service 的什么内容”。

| 运行职责       | Agent Loop 掌握                                 | 其他 Service 提供                                        |
| -------------- | ----------------------------------------------- | -------------------------------------------------------- |
| Agent 生命周期 | 创建、发布、恢复、取消和退出 live Agent         | Agent Registry 与 Session Store                          |
| 请求输入       | 决定何时需要下一次模型请求                      | System Prompt sections、Tool schemas 与 Session 派生历史 |
| 模型调用       | 决定模型何时继续，并把本轮上下文交给它          | LLM preparation、route 与 streaming                      |
| Tool 行为      | 交付 Tool Call、等待结果、决定是否继续下一 Step | Tool 查找、验证、执行与结果表示                          |
| 运行历史       | 决定哪些事实在什么顺序进入记录                  | Session Event Log 的事件模型与 append 操作               |

一句话概括：**Agent Loop 掌握顺序，不拥有顺序里经过的每一种能力。**

Persistence 也不应该被塞进每个 Step 的同步调用链。运行中的 Agent 直接读写内存 Session；Persistence Plugin 监听 Session 事件，以 write-behind 或 checkpoint 方式把连续事件写入后端。Resume 时，方向反过来：Persistence 加载历史，Session 恢复相同 identity，Agent Loop 再创建新的 live Agent。

即使底层能力都是异步的，这种协调仍然要保持严格顺序。LLM 可以持续返回 chunks，Tool Service 可以按执行规则处理多个 Tool Call，Persistence 也可以稍后再批量写入；但 Agent Loop 必须始终知道每个结果属于哪个 Step，才能判断下一次模型请求是否仍然欠着。它等待的是语义边界：本次模型输出已经组装完成、所请求的 Tool 已经得到结果、需要进入历史的事实已经 append，然后才进行 continuation decision。

这也是 Agent Loop 复杂度的主要来源。复杂的地方不只是“再调用一次模型”，而是在多个独立 Service 工作时仍然维护所有权、顺序和退出条件。把它实现成 Plugin，等于为这部分复杂度划出清楚的安装边界：Cordis 只会在依赖 Service 已经可用后激活它，通过当前 Context 暴露 Agent factory，并在 scope 退出时清理它创建的 Agent、注册项与 Effect。因此，“Plugin”描述的是协调器如何进入系统、如何取得能力、由哪个生命周期负责退出，并不意味着它只是外围附加物。

把 live coordination 和 durable history 放在一起，就能看清 Agent Loop 作为 Plugin 的真正角色：

![Agent Loop 协调 System Prompt、Session、LLM 与 Tools，并把两个 Turn 的事实追加到 Session Event Log](/assets/img/blog/deepseek-harness-03-turn-session/agent-loop-session-log-zh.webp)

_图 1。上层是当前进程中的协调：Agent Loop 依次使用各项 Service。下层是需要长期保留的 Session 历史。Persistence 从这份历史接收连续事件批次，而不是在每个 Step 中充当一个同步 Tool。_

如果只看上层，Agent Loop 像一个普通控制循环；如果只看下层，Session 又像一个被动数据库。两层合在一起才是完整模型：Agent Loop 推进运行，Session 让运行过程能够被重建。

## 4. Session 保存的是运行历史，不只是聊天

“Session”很容易让人想到聊天窗口。DeepSeek Harness 的 Session 比聊天记录更底层。

Session 是带稳定 identity 的 append-only typed event log，也是 Agent 交互历史的单一事实源。模型下一次收到的 message history 不是另一份独立维护的数据，而是从这条日志派生出来的投影。

日志中的内容可以简单分成四类。

**第一类是运行边界。** `turn/start`、`turn/end`、`step/start` 与 `step/end` 说明每段连续运行和每次模型请求在哪里开始、在哪里结束。`turn/end` 还会记录完成、取消、错误、达到 token 上限或 interrupted 等结束原因。

**第二类是模型可见内容。** 用户消息、运行时注入的上下文、组装完成的 assistant message 和 Tool Result 会进入能够派生模型历史的 surface。原始 assistant chunks 也可以保留，用于高保真 replay 和界面流式呈现，但不会逐个重新发送给模型。

**第三类是动作与结果。** Session 记录模型请求了哪个 Tool、原始 arguments、`callId`，以及对应的 Tool Result 或错误。这样，“模型提出修改”与“修改真正返回成功”不会被压成一条含糊的总结。

**第四类是请求重建和 Plugin 扩展状态。** 有效的模型 route、request header、system prompt 和 Tool schemas 可以进入日志；Todo、compaction 等 Plugin 也可以定义自己的 durable event。

这些分类不要求读者记住事件名。真正要建立的判断只有一个：Session 保存足以解释运行历史的事实，而不是只保存最终显示在聊天气泡里的文字。

以 Turn 1 为例，界面可能只显示三张卡片：修改完成、测试通过、最终回答。Session Event Log 则保留更多关系：这三张卡片属于哪个 Turn；修改发生在哪个 Step；测试请求使用了哪个 Tool Call；结果如何进入下一次模型请求；Turn 最终以什么原因闭合。

模型看到的历史是这份日志的一种投影。`deriveMessages()` 会从当前 model-visible surface 中派生 user message、assistant message 与 Tool Result。Turn/Step markers、request header 等结构事件不会伪装成聊天消息，却仍然对重建、恢复和调试有意义。

这种重建不是抽象口号。下一次模型请求开始前，运行时可以沿着事件顺序重新找到：哪条 Input 已经获得接纳，哪段 assistant output 发出了 Tool Call，哪个 Tool Result 与哪个 `callId` 对应，以及当前请求使用了什么 prompt、Tool schemas 和 model route。Turn 与 Step marker 则解释这些模型消息属于哪段连续运行。即使 marker 本身不会作为 message 发给模型，它仍然让运行结构保持清楚。

因此，下一次请求不是界面从几张聊天卡片中临时拼出的“第二份历史”，而是已有事件的一种确定投影。界面可以折叠长结果，模型可以只接收需要的 messages，Persistence 可以批量写入；三者仍然共享同一条事实链。

界面也是一种投影。它可以把长 Tool Result 折叠成卡片，可以根据原始 chunks 重播流式输出，也可以从 Todo 事件显示状态列表。表现形式变化，不需要另建一份与 Session 竞争的事实源。

不是每个临时 callback、middleware dispatch 或正在进行的协调都会成为 Session 历史。但只要某项内容真正进入模型请求，固定版本要求它能够从日志重建。这个不变量防止模型依赖一个恢复后消失的隐藏内存变量。

因此，Session 的价值不只是“让 Agent 记得之前说过什么”。它让运行时知道已经接纳了什么、请求了什么、执行了什么，以及每段运行在哪里结束。

## 5. Persistence、Resume、Crash Recovery 与 Fork 怎样使用同一份历史

append-only 描述的是 Session 的数据模型，并不自动意味着这份 Session 已经写进磁盘。DeepSeek Harness 把 durable storage 设计成独立的 Persistence seam。

运行中的 Session 首先存在于内存。Agent Loop 可以立即追加事件，其他 live Plugin 也能观察事件流。Persistence Plugin 则负责把 Session header 与连续事件保存到 JSONL、SQLite 或其他后端。它可以批量写入，也可以在 checkpoint 时显式等待 durability。

这个分离让 Agent Loop 不需要知道后端格式，也让同一 Session 模型可以在不同部署中选择不同 Persistence。更重要的是，它让四种能力拥有不同、明确的语义。

### Persistence：让历史跨过进程生命周期

Persistence 保存的基本单位仍然是 live Session 使用的 `SessionEvent`，而不是另造一份“精简聊天消息格式”。因此 Turn/Step 边界、Tool Call/Result 和 request reconstruction state 不会在持久化时被压扁成几段文本。

Session header 单独保存 identity、创建时间、工作目录以及 lineage 等非事件元数据。事件本身保持连续 sequence number。后端格式可以变化，但恢复出的逻辑历史必须仍然满足同一顺序与边界规则。

内存 append 与 durable write 也不是同一瞬间。write-behind 可以合并一批事件；显式 flush 或 checkpoint 才提供需要等待的 durability barrier。正文不需要展开后端策略，但必须保留这个区别：Session 是权威的 live history，Persistence 是它在进程之外的持久版本。

### Resume：继续同一个 Session identity

Resume 从 Persistence 加载已有 Session，恢复事件历史，并围绕它创建新的 live Agent。Session ID 不变，既有 sequence number 与 Turn 编号也构成后续运行的起点。

假设 Session A 已经包含 Turn 1 和 Turn 2。进程退出后再次 Resume A，运行时不会把这些内容复制成“新的对话”。它重新建立同一个 Session A；下一条 Follow-up Input 会在这份历史之后打开新的 Turn。

模型也不需要依赖一段手写总结来相信之前发生过什么。Session 可以重新派生 message history，request header 可以恢复当时的模型请求状态，Plugin 的 projection 也能从相同事件重新计算。

Resume 的对象是 Session history，不是旧进程的调用栈。旧的 Promise、局部变量和正在运行的 JavaScript 函数不会原地复活。这个区别会直接影响 Crash Recovery。

### Crash Recovery：诚实地闭合未完成尾部

进程可能在一个完整事件已经写入后、对应的 Step 或 Turn 结束标记写入前停止；底层文件还可能留下半条 torn record。Persistence loader 需要区分“有效但未闭合的逻辑尾部”和“根本没有完整写完的物理记录”。

固定版本会保留已经完整持久化的事件，丢弃 torn final record，并为孤立的 Tool Call、Step 或 Turn 补上符合日志规则的结束信息。未完成 Turn 会以 `interrupted` 结束，而不是被伪装成 `completed`。

恢复完成后，历史明确表达：上一次运行中断了。之后的 Follow-up Input 会打开新的 Turn。Resume 不会从半个模型 stream、半次 Tool 执行或某个 JavaScript 栈帧继续往下跑。

这种设计可能不如“完全无缝继续”听起来神奇，但语义更可靠。后续模型可以看到中断事实，界面可以准确展示结束原因，调试者也不会把一条不完整路径误判成正常成功。

### Fork：从合法边界建立新的 Session

Fork 不是 Resume。它从源 Session 选择一个合法的闭合边界，把该边界之前的历史前缀复制到一个新的 Session identity。新 Session 会记录 `parentSession` 与 `seedLength`，父 Session 保持不变。

例如，Session A 的 Turn 1 与 Turn 2 都已结束。系统可以在 Turn 2 结束位置创建 Session B。B 继承 A 的历史前缀，但它后续的 Turn 3′、Turn 4′ 属于新的 Session。A 仍然可以沿自己的路径继续。

边界必须合法。如果所选位置还处于 open Turn 内部，Fork 会拒绝，而不是让子 Session 从半次模型请求或缺失 Tool Result 的状态起步。不同 `turn/end` 原因可以成为合法边界，关键是 Turn 已经结构化闭合。

因此，Fork 也不是修改、回滚或重写父 Session。它建立 lineage：两份历史在某个边界之前相同，之后分别追加新的事件。

三种后续路径可以放在同一张图里比较：

![Resume、Crash Recovery 与 Fork 以不同方式使用同一份 Session 历史](/assets/img/blog/deepseek-harness-03-turn-session/session-continuations-zh.webp)

_图 2。Resume 延续 Session A；Crash Recovery 保留有效前缀，并把未完成尾部标记为 interrupted；Fork 从合法闭合边界创建 Session B，父 Session 不会被修改。_

把四项能力重新放回同一个模型，就能看到它们为什么成立：

- Persistence 能保存历史，因为事件有稳定顺序与连续编号。
- Resume 能恢复同一个 Session，因为模型历史和请求状态可以从事件重建。
- Crash Recovery 能识别未完成尾部，因为 Turn 与 Step 有明确开始和结束边界。
- Fork 能创建新 lineage，因为闭合的 Turn 边界给出了合法历史前缀。

Session history 的重建不等于复制 Agent 曾经接触过的每一个外部系统。

## 6. 这套模型带来了什么，又要求什么

Input、Turn、Step 与 Session 分开以后，每个问题都有清楚位置：

- Turn 回答：“这段连续运行从哪里开始、为什么结束？”
- Step 回答：“哪一次模型请求和哪些 Tool Result 推动了下一步？”
- Session 回答：“运行时能够从哪份有序历史重新建立上下文？”
- Persistence 回答：“哪些历史能跨过当前进程？”
- Resume 回答：“相同 identity 怎样继续追加新的 Turn？”
- Fork 回答：“新的 identity 怎样继承历史并在之后分开发展？”

这套模型让很多失败不再混成一句“Agent 没有做完”。模型从未请求 Tool、Tool 返回错误、进程在 Step 中间停止、Turn 正常结束，以及 child Session 从父历史分叉，都有不同记录。

它也让排查问题时能够提出更具体的问题。如果 Agent 重复执行同一动作，可以检查上一条 Tool Result 是否在下一 Step 之前进入 Session；如果 Resume 后行为变化，可以核对重建出的 system prompt、Tool schemas 与 model route，而不只是看聊天界面；如果 Fork 从意外位置开始，可以检查选中的闭合 Turn 边界与 lineage metadata。事件模型不会消灭失败，但它会把失败收窄到一条有证据的边界上。

代价是运行时必须维护更多明确规则。Agent Loop 要保持事件顺序；所有进入模型请求的内容都必须可重建；Plugin 添加 durable state 时要定义怎样 append 和 replay；Persistence 要守住连续前缀；Resume 要恢复同一个 Session identity；Fork 不能切进 open Turn。事件格式、结束原因和 projection 行为也会成为相邻模块依赖的兼容约束。

这正是整个系列一直在拆开的复杂度。简单 Agent Loop 把大量决定压进箭头；可组合 Harness 把箭头展开成 Service、事件、Context scope 与持久记录。组件更容易替换，运行过程也更容易检查，但模块之间必须共享更清楚的规则。

到这里，我们已经假设 Agent Registry、Session、LLM、Tools、System Prompt 与 Persistence 都可以被 Agent Loop 使用。下一篇要回答的是：这些 Service 的具体实现来自哪里，Capability、Provider、Consumer、Profile 与 Bundle 又怎样把它们组装成一个真正运行的 Agent？

### 延伸阅读

- [固定版本的 DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness/tree/47f943859bef60e4160492346772ded9b24f765a)
- [架构文档中的 Turn flow 与 Session log](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/docs/architecture.md)
- [Session 与模型历史派生](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/docs/subsystems/session.md)
- [Session Persistence 与 Crash Recovery](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/docs/subsystems/persistence.md)
- [Agent Loop Plugin 实现](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/core/agent-loop/src/index.ts)
- [Turn 与 Step driver](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/core/agent-loop/src/agent.ts)
- [Session Fork 行为测试](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/core/session/tests/fork.spec.ts)
