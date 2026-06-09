---
title: 'Sutton RL: Day 1 - RL Problem and MDP Basics'
date: '2026-05-27'
overview: >-
  TLDR: RL is interaction for long-term reward: policy chooses actions, reward gives feedback, value estimates future
  return, and Bellman equations connect the pieces.
description: >-
  TLDR: RL is interaction for long-term reward: policy chooses actions, reward gives feedback, value estimates future
  return, and Bellman equations connect the pieces.
tags:
  - sutton-rl
categories:
  - learning
  - rl
math: true
toc: true
relatedPosts: true
---

<!-- notion-sync: 36d4e07a-a023-806d-a6b6-e65280e51648 parent=Sutton-RL url=https://app.notion.com/p/36d4e07aa023806da6b6e65280e51648 -->

> 目标：理解 Sutton & Barto 对强化学习的基本建模方式：Agent 通过和 Environment 交互，学习一个 Policy，使长期累计 Reward 最大化。

## 对应内容

- **Chapter 1**：RL 问题、四个核心元素、Tic-Tac-Toe 例子

- **Chapter 3.1–3.3**：Agent–Environment、Reward、Return

- **Chapter 3.6–3.8**：MDP、Value Function、Bellman Equation

书中对 RL 的核心描述是：学习如何把 situation 映射到 action，以最大化 numerical reward signal。Agent 不是被直接告诉正确动作，而是通过试错发现哪些动作带来更高 reward。

---

## 1. 一句话理解 RL

**Reinforcement Learning = learning from interaction to maximize long-term reward.**

也就是：Agent 观察 state，选择 action，environment 返回 reward 和 next state。Agent 的目标不是预测标签，而是通过不断交互学出一个好的 policy。

申请表 Q1 问：

> The primary goal of reinforcement learning can be seen as producing a what?

答案：

> A policy.

也就是一个从 state / situation 到 action 的行为规则。

---

## 2. Agent–Environment 交互

每个时间步发生四件事：

1. Agent 观察当前状态：⁍

1. Agent 选择动作：⁍

1. Environment 给出奖励：⁍

1. Environment 转移到下一个状态：⁍

核心理解：

> Agent 不能直接控制 reward，只能通过 action 间接影响 reward。

Sutton & Barto 特别强调：agent–environment boundary 是建模选择。Agent 不一定是整个机器人，environment 也不一定只是机器人外部世界。凡是 agent 不能任意改变的东西，都可以被看作 environment 的一部分。

---

## 3. RL 与监督学习的区别

### Supervised Learning

监督学习有明确标签。模型学的是：输入是什么，正确答案是什么。

例子：

- 图片 → 猫

- 句子 → 情感标签

- 特征 → 房价

### Reinforcement Learning

RL 没有“正确动作”标签。Agent 只知道：我刚才做了某个 action，环境给了我某个 reward。

所以 RL 的反馈是 **evaluative feedback**，不是 **instructive feedback**。

### 关键区别

监督学习告诉你：

> 应该怎么做。

RL 只告诉你：

> 刚才这样做结果怎么样。

因此 RL 必然面对一个问题：**exploration vs exploitation**。

既要利用当前看起来最好的动作，也要探索可能更好的动作。

---

## 4. RL 系统的四个核心元素

### 4.1 Policy

Policy 是 agent 的行为规则。它回答：

> 在 state ⁍ 下，我应该选择哪个 action？

确定性 policy：

$$
a = \pi(s)
$$

随机性 policy：

$$
\pi(a \mid s)
$$

PPO 中，policy 通常写成：

$$
\pi\theta(a \mid s)
$$

也就是用参数 ⁍ 表示的神经网络 policy。

### 4.2 Reward Signal

Reward 是环境给 agent 的即时反馈。它回答：

> 刚才这一步好不好？

例子：

- 迷宫中每走一步：⁍

- 到达终点：⁍

- 下棋胜利：⁍

- 机器人没电：⁍

重要原则：

> Reward 应该描述你真正想要的目标，而不是手写“怎么做”。

比如下棋 agent 应该奖励“赢棋”，而不是奖励“吃子”。否则 agent 可能学会拼命吃子，但最后输棋。

### 4.3 Value Function

Value 是长期价值判断。它回答：

> 从这个 state 出发，未来整体会有多好？

Reward 是眼前反馈。Value 是长期预期。

一个 state 的 immediate reward 可能很低，但 value 很高，因为它通向未来更好的状态。

书中强调，value function 是大多数 RL 算法最核心的组成部分，因为它帮助 agent 更高效地搜索好的 policy。

### 4.4 Model

Model 是 environment 的预测器。它回答：

> 如果我在 state ⁍ 做 action ⁍，接下来可能到哪里？会得到什么 reward？

有 model，可以 planning。没有 model，也可以 model-free learning。

例子：

- **Model-based**：Dynamic Programming, Dyna

- **Model-free**：Monte Carlo, TD, Sarsa, Q-learning, PPO

---

## 5. Reward、Return、Value

这三个概念必须分清。

### Reward

Reward 是单步反馈。

$$
R{t+1}
$$

它只评价刚刚发生的 transition。

### Return

Return 是从当前时刻开始，未来 reward 的累计。

$$
Gt = R{t+1} + \gamma R{t+2} + \gamma^2 R{t+3} + \cdots
$$

也可以写成：

$$
Gt = \sum{k=0}^{\infty} \gamma^k R{t+k+1}
$$

递归形式：

$$
Gt = R{t+1} + \gamma G{t+1}
$$

### Value

Value 是 expected return。

$$
v\pi(s) = \mathbb{E}\pi[Gt \mid St=s]
$$

$$
q\pi(s,a) = \mathbb{E}\pi[Gt \mid St=s,At=a]
$$

最重要的理解：

> Reward 是一次样本，return 是一条轨迹的累计结果，value 是很多可能轨迹的平均预期。

---

## 6. Discount Factor：⁍

⁍ 控制 agent 多重视未来 reward。

$$
0 \leq \gamma \leq 1
$$

当：

$$
\gamma = 0
$$

agent 只关心 immediate reward。

当：

$$
\gamma \approx 1
$$

agent 更关心长期结果。

申请表 Q3 的正确理解是：

> Larger ⁍ means less concern for immediate rewards relative to later rewards.

也就是说，⁍ 越大，agent 越 farsighted。

---

## 7. MDP：Markov Decision Process

MDP 是 RL 问题的标准数学形式。

一个 finite MDP 包含：

- state set

- action set

- reward

- transition dynamics

- discount factor

最核心的是 transition dynamics：

$$
p(s', r \mid s, a) = P(S{t+1}=s', R{t+1}=r \mid St=s, At=a)
$$

它的意思是：在当前状态 ⁍ 做动作 ⁍ 后，转移到 ⁍ 并得到 reward ⁍ 的概率。

---

## 8. Markov Property

Markov property 的直觉：

> 当前 state 已经包含足够的信息，不需要完整历史也能预测未来。

数学上是：

$$
P(S{t+1}, R{t+1} \mid St, At, \text{history}) = P(S{t+1}, R{t+1} \mid St, At)
$$

一句话：

> The future depends on the present state and action, not on the full past history.

例子：

- 棋盘游戏中，当前棋盘通常就是 Markov state。只要知道当前棋子位置，过去怎么走到这里通常不重要。

- 扑克不完全是这样。只看当前手牌不一定 Markov，因为对手过去的下注行为、风格、已经出现过的牌都可能影响决策。

---

## 9. Value Function

### State-value function

$$
v\pi(s) = \mathbb{E}\pi[Gt \mid St=s]
$$

意思是：在 state ⁍ 开始，然后按照 policy ⁍ 行动，平均能得到多少 return。

### Action-value function

$$
q\pi(s,a) = \mathbb{E}\pi[Gt \mid St=s,At=a]
$$

意思是：在 state ⁍ 先做 action ⁍，之后按照 policy ⁍ 行动，平均能得到多少 return。

### 二者区别

- ⁍：这个 state 有多好。

- ⁍：这个 state 下做这个 action 有多好。

后面 Q-learning 学的就是 action-value function 的最优版本：

$$
q(s,a)
$$

---

## 10. Bellman Equation

Bellman equation 是 Day 1 最重要的公式思想。

先记一句话：

> 一个 state 的 value = immediate reward + discounted next-state value。

### Bellman Expectation Equation

$$
v\pi(s) = \suma \pi(a \mid s) \sum{s',r} p(s',r \mid s,a) \left[r + \gamma v\pi(s')\right]
$$

它回答：

> 给定 policy ⁍，这个 policy 的 value 是多少？

所以它用于：**policy evaluation**。

### Bellman Optimality Equation

$$
v(s) = \maxa \sum{s',r} p(s',r \mid s,a) \left[r + \gamma v(s')\right]
$$

它回答：

> 在 state ⁍，最优情况下最多能得到多少 expected return？

所以它用于：**finding optimal policy**。

### Optimal Action-Value Equation

$$
q(s,a) = \sum{s',r} p(s',r \mid s,a) \left[r + \gamma \max{a'} q(s',a')\right]
$$

这个公式是 Q-learning 的思想来源。后面 Q-learning 的更新式其实就是它的 sample 版本。

---

## 11. Greedy Policy 的关键误区

如果你知道最优 action-value function：

$$
q(s,a)
$$

那么最优动作可以直接选：

$$
\pi(s) = \arg\maxa q(s,a)
$$

但是注意：

> Greedy with respect to any value function 不一定 optimal。

只有对 ⁍ 或 ⁍ greedy，才保证 optimal。

申请表 Q7：

> If a policy is greedy with respect to the value function for the equiprobable random policy, then it is an optimal policy.

答案：

> False in general.

理由：对 random-policy value function greedy，通常只能保证可能比 random policy 更好，不能保证已经达到 optimal policy。

---

## 12. Example｜Tic-Tac-Toe

Tic-Tac-Toe 是 Chapter 1 的核心例子。

- **State**：当前棋盘局面

- **Action**：下一步落子位置

- **Reward**：赢棋为正，输或平为低值

- **Value**：从当前棋盘局面出发，最终获胜的概率

- **Policy**：选择能通向最高 value 的下一步

这个例子最重要的地方是：

> Value function 可以评价中间状态，而不是只看最终输赢。

比如 agent 还没赢，但某个局面已经很有优势，那么这个局面的 value 应该高。

书中 Tic-Tac-Toe 的学习方式是：给每个棋盘状态存一个 value，每走一步后，把前一个状态的 value 往后一个状态的 value 靠近。这个想法是 TD learning 的早期直觉。

---

## 13. Example｜Recycling Robot

这是 Chapter 3 的经典 MDP 例子。

- **State**：high battery；low battery

- **Action**：search；wait；recharge

- **Reward**：

- 找到罐子：正 reward
  - 等待时有人送来罐子：较小正 reward

  - 电池耗尽：负 reward

  - 充电：通常 reward 为 0

关键理解：

> 同一个 action 在不同 state 下价值不同。

当电量高时，search 可能很好。当电量低时，search 可能很危险，因为可能导致电池耗尽。

所以 RL 不是学“哪个 action 永远好”，而是学：

> Which action is good in which state.

---

## 14. Example｜Gridworld

Gridworld 用来理解 value function。

- **State**：格子位置

- **Action**：上、下、左、右

- **Reward**：特殊格子给正 reward，撞墙给负 reward，普通移动 reward 为 0

关键理解：

> Value 高的 state 不一定 immediate reward 高。

一个格子当前可能没有 reward，但如果它未来容易到达高 reward 状态，它的 value 仍然可能很高。

这就是 value 和 reward 的区别。

---

## 15. Day 1 必背公式

### Return

$$
Gt = R{t+1}+\gamma R{t+2}+\gamma^2R{t+3}+\cdots
$$

### State Value

$$
v\pi(s)=\mathbb{E}\pi[Gt \mid St=s]
$$

### Action Value

$$
q\pi(s,a)=\mathbb{E}\pi[Gt \mid St=s,At=a]
$$

### MDP Dynamics

$$
p(s',r \mid s,a)=P(S{t+1}=s',R{t+1}=r \mid St=s,At=a)
$$

### Bellman Expectation Equation

$$
v\pi(s) = \suma \pi(a \mid s) \sum{s',r} p(s',r \mid s,a) \left[r+\gamma v\pi(s')\right]
$$

### Bellman Optimality Equation

$$
v(s) = \maxa \sum{s',r} p(s',r \mid s,a) \left[r+\gamma v(s')\right]
$$

---

## 16. 面试表达

### What is reinforcement learning?

Reinforcement learning is learning from interaction. An agent observes states, takes actions, receives rewards, and improves its policy to maximize expected cumulative reward.

### What is the primary goal of RL?

The primary goal is to produce a policy: a mapping from states or situations to actions that maximizes expected return.

### What is the difference between reward and value?

Reward is immediate feedback. Value is the expected long-term return from a state or state-action pair.

### What is an MDP?

An MDP is a model for sequential decision-making where the future depends on the current state and action, not the full past history.

### What does the Bellman equation mean?

The Bellman equation says that value equals expected immediate reward plus discounted future value.

---

## 17. 今日自测

1. RL 和 supervised learning 的最大区别是什么？

1. Policy 是什么？

1. Reward、return、value 分别是什么？

1. ⁍ 变大意味着什么？

1. 什么是 Markov property？

1. ⁍ 和 ⁍ 有什么区别？

1. Bellman equation 用一句话怎么解释？

1. 为什么 greedy with respect to random-policy value function 不一定 optimal？

---

## 18. Day 1 Takeaway

Day 1 只需要抓住这条主线：

> RL 是 goal-directed interaction。Agent 根据 state 选择 action，environment 返回 reward 和 next state。Policy 决定行为，value function 判断长期好坏，Bellman equation 把长期 return 拆成 immediate reward 加 future value。

后面几天的算法其实都围绕同一个问题展开：

> 怎样估计 value，怎样改进 policy。
