---
title: 'Sutton RL: Day 2 - Multi-Armed Bandits'
date: '2026-05-28'
overview: >-
  TLDR: Multi-armed bandits isolate the exploration/exploitation problem by removing state transitions and making
  action-value estimation the center.
description: >-
  TLDR: Multi-armed bandits isolate the exploration/exploitation problem by removing state transitions and making
  action-value estimation the center.
tags:
  - sutton-rl
categories:
  - learning
  - rl
math: true
toc: true
relatedPosts: true
---

<!-- notion-sync: 36e4e07a-a023-8083-8bea-d2d6d803a1d6 parent=Sutton-RL url=https://app.notion.com/p/36e4e07aa02380838bead2d6d803a1d6 -->

## 0. 本章定位

Chapter 2 讨论的是强化学习中最简化的场景：**只有动作选择和 reward，没有状态转移和长期 Bellman 递归**。

本章的核心问题是：

**在不知道每个动作真实收益的情况下，如何一边探索、一边利用当前最好的选择？**

Bandit 问题保留了强化学习最关键的困难：

- 环境只给出 evaluative feedback，也就是“刚才这个动作结果怎么样”。

- 环境不会给出 instructive feedback，也就是“正确动作应该是什么”。

- 因此 agent 必须通过 trial-and-error 主动探索。

---

## 1. n-Armed Bandit Problem

n-armed bandit 问题中，agent 面对 ⁍ 个可选动作。每次选择一个动作后，环境给出一个 numerical reward。

动作 ⁍ 的真实价值定义为它的期望 reward：

$$
q(a)=\mathbb{E}[Rt \mid At=a]
$$

agent 不知道真实的 ⁍，只能维护一个估计值：

$$
Qt(a)\approx q(a)
$$

如果 agent 已经知道所有动作的真实价值，那么问题很简单：永远选择 ⁍ 最大的动作。但在 bandit 问题中，agent 不知道真实 action value，所以必须通过重复尝试来估计。

本章的基本目标是：

**在一段时间内最大化 expected total reward。**

---

## 2. Exploration vs Exploitation

### Exploitation

Exploitation 指选择当前估计最好的动作。

也就是：

**根据目前的 \*\***⁍\***\*，选择看起来 reward 最大的动作。**

这样做的优点是短期 reward 较高。

---

### Exploration

Exploration 指尝试看起来不是当前最优的动作。

也就是：

**暂时牺牲一点短期收益，去获得更多信息。**

这样做的意义是：当前估计可能不准，某个目前看起来不好的动作，可能只是早期样本 unlucky，真实价值其实更高。

---

### 核心冲突

一个动作选择不可能同时是纯 exploitation 和纯 exploration。

- exploitation 有利于当前 reward。

- exploration 有利于长期发现更好的动作。

Bandit 问题的核心就是平衡二者：

**既不能永远贪心，也不能永远随机。**

---

## 3. Action-Value Methods

Action-value method 的基本思路是：

**先估计每个动作的 value，再根据估计值选择动作。**

### True action value

真实动作价值：

$$
q(a)=\mathbb{E}[Rt \mid At=a]
$$

它是动作 ⁍ 的真实平均收益，但 agent 不知道。

---

### Estimated action value

估计动作价值：

$$
Qt(a)\approx q(a)
$$

它是 agent 在时间 ⁍ 对动作 ⁍ 的当前估计。

---

### Sample-average estimate

如果动作 ⁍ 已经被选择了 ⁍ 次，那么可以用这些 reward 的平均值估计动作价值：

$$
Qt(a)=\frac{R1+R2+\cdots+R{Nt(a)}}{Nt(a)}
$$

其中 ⁍ 是过去选择动作 ⁍ 后得到的 reward。

直觉：

**一个动作试得越多，它的平均 reward 越接近真实期望 reward。**

在 stationary setting 中，当 ⁍ 时，sample average 会收敛到真实的 ⁍。

---

## 4. Greedy Action Selection

Greedy action selection 永远选择当前估计值最大的动作：

$$
At=\arg\maxa Qt(a)
$$

它的含义是：

**只利用当前知识，不主动探索。**

优点：

- 简单。

- 短期表现可能不错。

缺点：

- 容易被早期噪声误导。

- 一旦某个好动作早期 reward 偶然较低，agent 可能永远不再尝试它。

- 在随机 reward 环境中容易卡在 suboptimal action。

---

## 5. ε-Greedy Action Selection

ε-greedy 是 greedy 的简单改进。

规则：

- 以概率 ⁍ 选择当前 greedy action。

- 以概率 ⁍ 随机选择一个动作。

如果总共有 ⁍ 个动作，并且当前 greedy action 已经是 optimal action，那么选择 optimal action 的概率是：

$$
1-\varepsilon+\frac{\varepsilon}{n}
$$

例如：

$$
n=10,\quad \varepsilon=0.1
$$

则：

$$
1-0.1+\frac{0.1}{10}=0.91
$$

所以，即使 agent 已经学到最优动作，⁍ 的 ε-greedy 仍然最多约 91% 的时间选择最优动作。

ε-greedy 的特点：

- 比 greedy 更可靠，因为它持续探索。

- 但探索是随机的，不区分哪些动作更值得探索。

- ⁍ 太大时，长期会浪费 reward。

- ⁍ 太小时，可能探索不足。

---

## 6. Incremental Implementation

直接保存所有 reward 再计算平均值，会导致内存和计算成本随时间增长。

因此需要 incremental update。

假设 ⁍ 是前 ⁍ 次 reward 的平均估计，第 ⁍ 次 reward 是 ⁍，则：

$$
Q{k+1}=Qk+\frac{1}{k}(Rk-Qk)
$$

这个公式的含义是：

**新估计 = 旧估计 + 步长 × 误差**

其中误差是：

$$
Rk-Qk
$$

如果实际 reward 高于当前估计，就上调估计。

如果实际 reward 低于当前估计，就下调估计。

---

## 7. 通用更新模板

Chapter 2 中最重要的公式模板是：

$$
\text{New Estimate}
\leftarrow
\text{Old Estimate}
+
\text{Step Size}
[
\text{Target}-\text{Old Estimate}
]
$$

这个模板会贯穿后续章节。

在 bandit 中：

- estimate 是 ⁍。

- target 是新观察到的 reward ⁍。

- step size 是 ⁍ 或 ⁍。

后面的 Monte Carlo、TD、Sarsa、Q-learning 都可以看成这个模板的变形。

---

## 8. Nonstationary Problem

前面的 sample-average 方法默认环境是 stationary，也就是：

**每个动作的真实价值 \*\***⁍\***\* 不随时间变化。**

但在很多强化学习问题中，环境或有效学习问题可能是 nonstationary 的：

- reward distribution 可能变化。

- agent 的 policy 在学习中变化。

- 早期样本可能不再代表当前情况。

---

### Sample average 的问题

sample average 对所有历史 reward 一视同仁。

这在 nonstationary setting 中不理想，因为很久以前的 reward 可能已经过时。

---

### Constant step-size update

为适应 nonstationary problem，可以使用固定步长：

$$
Q{k+1}=Qk+\alpha(Rk-Qk)
$$

其中：

$$
0<\alpha\leq1
$$

展开后：

$$
Q{k+1}
=
(1-\alpha)^kQ1
+
\sum{i=1}^{k}\alpha(1-\alpha)^{k-i}Ri
$$

这说明 fixed-⁍ 更新是一个 recency-weighted average。

越新的 reward 权重越大；越旧的 reward 权重越小。

---

## 9. Step Size 的理解

### Sample-average step size

$$
\alphak=\frac{1}{k}
$$

特点：

- 适合 stationary problem。

- 能逐渐收敛。

- 后期更新越来越慢。

---

### Constant step size

$$
\alphak=\alpha
$$

特点：

- 适合 nonstationary problem。

- 能持续响应新数据。

- 不会完全收敛，而是围绕当前真实值波动。

---

### 收敛条件

随机近似理论中，step-size 序列要保证收敛，常见条件是：

$$
\sum{k=1}^{\infty}\alphak(a)=\infty
$$

$$
\sum{k=1}^{\infty}\alphak^2(a)<\infty
$$

直觉：

第一个条件保证步子总和足够大，可以克服初始误差。

第二个条件保证后期步子足够小，可以稳定收敛。

---

## 10. Optimistic Initial Values

Optimistic initial values 是一种鼓励探索的方法。

普通初始化可能是：

$$
Q1(a)=0
$$

乐观初始化可以设成：

$$
Q1(a)=5
$$

如果真实 reward 通常在 0 附近，那么 ⁍ 是明显偏高的估计。

这样 agent 一开始会认为每个动作都很好。选择某个动作后，如果实际 reward 低于初始估计，那么该动作估计下降，agent 就会转向其他仍然“看起来很好”的动作。

因此，即使使用 greedy action selection，也会产生探索。

---

### 特点

优点：

- 实现简单。

- 不需要显式随机探索。

- 在 stationary problem 中可能有效。

缺点：

- 探索动力主要来自初始阶段。

- 不适合 nonstationary problem。

- 如果环境后期变化，它不能重新激发探索。

- 初始值本身是需要调的超参数。

---

## 11. Upper-Confidence-Bound Action Selection

ε-greedy 的探索是随机的，UCB 的探索更有针对性。

UCB 的思想是：

**不仅看当前估计值，也看这个估计有多不确定。**

UCB action selection：

$$
At
=
\arg\maxa
\left[
Qt(a)
+
c\sqrt{\frac{\ln t}{Nt(a)}}
\right]
$$

第一项：

$$
Qt(a)
$$

表示 exploitation，也就是当前估计动作 ⁍ 有多好。

第二项：

$$
c\sqrt{\frac{\ln t}{Nt(a)}}
$$

表示 exploration bonus，也就是动作 ⁍ 的不确定性。

---

### UCB 直觉

如果动作 ⁍ 被试得少：

$$
Nt(a) \text{ 小}
$$

则 exploration bonus 大，动作更容易被选择。

如果动作 ⁍ 被试得多：

$$
Nt(a) \text{ 大}
$$

则 exploration bonus 小，选择主要取决于 ⁍。

参数 ⁍ 控制探索强度：

- ⁍ 大：更重视探索。

- ⁍ 小：更重视利用。

---

### UCB 的特点

优点：

- 比 ε-greedy 更聪明地探索。

- 会优先探索“估计值高但样本少”的动作。

缺点：

- 对一般 RL 问题扩展较难。

- 在 nonstationary problem 中需要额外处理。

- 在大状态空间和 function approximation 下不如 ε-greedy 简单通用。

---

## 12. Gradient Bandits

前面的方法都在估计 action value：

$$
Qt(a)
$$

Gradient bandit 不直接估计 action value，而是学习每个动作的 preference：

$$
Ht(a)
$$

preference 越高，动作被选择的概率越高。

注意：

**⁍\*\*** 不是 reward estimate，只是相对偏好。\*\*

---

### Softmax policy

用 softmax 将 preference 转成 action probability：

$$
\pit(a)
=
\frac{e^{Ht(a)}}{\sumb e^{Ht(b)}}
$$

如果所有 preference 初始相等，比如：

$$
H1(a)=0
$$

那么所有动作一开始被选择的概率相同。

---

### Preference update

选择动作 ⁍ 后，得到 reward ⁍。用平均 reward 作为 baseline：

$$
\bar Rt
$$

对被选中的动作：

$$
H{t+1}(At)
=
Ht(At)
+
\alpha(Rt-\bar Rt)(1-\pit(At))
$$

对未被选中的动作：

$$
H{t+1}(a)
=
Ht(a)
-
\alpha(Rt-\bar Rt)\pit(a),
\quad a\neq At
$$

---

### Baseline 的作用

如果：

$$
Rt-\bar Rt>0
$$

说明这次 reward 高于平均水平，应该增加所选动作的 preference。

如果：

$$
Rt-\bar Rt<0
$$

说明这次 reward 低于平均水平，应该降低所选动作的 preference。

baseline 不改变期望更新方向，但可以降低方差，使学习更稳定。

---

### Gradient bandit 的意义

Gradient bandit 是 policy-gradient 思想的简单形式。

它不是先估计每个动作的 value，再选择动作；而是直接调整 action probability，使 expected reward 上升。

它与后续 actor-critic、policy-gradient、PPO 的思想有联系：

- preference 类似 policy 参数产生的 action logit。

- ⁍ 类似简化版 advantage signal。

- softmax policy 类似随机策略。

---

## 13. Associative Search / Contextual Bandits

普通 bandit 是 nonassociative task：

**只有一个 situation，不需要区分不同 state。**

Contextual bandit / associative search 加入了 context 或 situation。

目标变成学习：

$$
\pi(a|s)
$$

也就是：

**在不同 context 下选择不同动作。**

---

### Contextual bandit 与 full RL 的区别

Contextual bandit：

- 有多个 situation / context。

- action 影响 immediate reward。

- action 不影响 next situation。

Full RL：

- 有多个 state。

- action 影响 immediate reward。

- action 也影响 next state。

- 因此需要考虑长期 return。

可以这样理解：

**Bandit 学 action selection。**

**Contextual bandit 学 state-dependent action selection。**

**MDP / full RL 学 sequential decision-making。**

---

## 14. 方法对比

### Greedy

核心：

选择当前估计价值最高的动作。

适合：

确定性、低噪声、已经充分探索的 setting。

主要问题：

容易卡在 suboptimal action。

---

### ε-Greedy

核心：

大多数时候 greedy，小概率随机探索。

适合：

简单、通用、tabular RL baseline。

主要问题：

探索是随机的，不够智能。

---

### Optimistic Initial Values

核心：

把初始 action value 设得很高，让 agent 主动尝试所有动作。

适合：

stationary bandit 中的简单探索。

主要问题：

探索动力只发生在早期，不适合后期环境变化。

---

### UCB

核心：

给不确定动作加 exploration bonus。

适合：

stationary bandit 中更有针对性的探索。

主要问题：

扩展到 general RL、large state space 和 function approximation 较困难。

---

### Gradient Bandit

核心：

直接学习 action preference，并用 softmax 得到随机 policy。

适合：

理解 policy-gradient 思想。

主要问题：

比 action-value method 更抽象，依赖 step size 和 baseline。

---

## 15. 本章公式总结

### True action value

$$
q(a)=\mathbb{E}[Rt|At=a]
$$

### Estimated action value

$$
Qt(a)\approx q(a)
$$

### Sample-average estimate

$$
Qt(a)
=
\frac{R1+R2+\cdots+R{Nt(a)}}{Nt(a)}
$$

### Greedy action

$$
At=\arg\maxa Qt(a)
$$

### Incremental sample average

$$
Q{k+1}=Qk+\frac{1}{k}(Rk-Qk)
$$

### General update template

$$
\text{New Estimate}
\leftarrow
\text{Old Estimate}
+
\alpha[
\text{Target}-\text{Old Estimate}
]
$$

### Constant step-size update

$$
Q{k+1}=Qk+\alpha(Rk-Qk)
$$

### Recency-weighted average

$$
Q{k+1}
=
(1-\alpha)^kQ1
+
\sum{i=1}^{k}\alpha(1-\alpha)^{k-i}Ri
$$

### UCB action selection

$$
At
=
\arg\maxa
\left[
Qt(a)
+
c\sqrt{\frac{\ln t}{Nt(a)}}
\right]
$$

### Gradient bandit softmax policy

$$
\pit(a)
=
\frac{e^{Ht(a)}}{\sumb e^{Ht(b)}}
$$

### Gradient bandit selected-action update

$$
H{t+1}(At)
=
Ht(At)
+
\alpha(Rt-\bar Rt)(1-\pit(At))
$$

### Gradient bandit unselected-action update

$$
H{t+1}(a)
=
Ht(a)
-
\alpha(Rt-\bar Rt)\pit(a),
\quad a\neq At
$$

---

## 16. 本章核心主线

Chapter 2 的主线是：

**不知道哪个动作好 → 估计 action value → 在 exploration 和 exploitation 之间权衡 → 提高长期 reward。**

最重要的抽象不是某一个具体算法，而是这个更新结构：

$$
\text{Estimate}
\leftarrow
\text{Estimate}
+
\alpha[
\text{Target}-\text{Estimate}
]
$$

之后的 Monte Carlo、TD、Sarsa、Q-learning 都会继续使用这一结构，只是 target 不同。
