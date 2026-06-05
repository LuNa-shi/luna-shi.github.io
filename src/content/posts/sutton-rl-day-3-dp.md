---
title: Sutton RL Day 3：Dynamic Programming
date: '2026-05-28'
overview: >-
  TLDR: Dynamic programming turns known MDP dynamics into iterative policy evaluation and improvement through Bellman
  updates.
description: >-
  TLDR: Dynamic programming turns known MDP dynamics into iterative policy evaluation and improvement through Bellman
  updates.
tags:
  - sutton-rl
categories:
  - learning
  - rl
math: true
toc: true
relatedPosts: true
---

<!-- notion-sync: 36e4e07a-a023-8055-ae32-e78d60c3c5cb parent=Sutton-RL url=https://app.notion.com/p/36e4e07aa0238055ae32e78d60c3c5cb -->

> Source: Sutton & Barto, _Reinforcement Learning: An Introduction_, Chapter 4: Dynamic Programming
>
> 用法：适合直接导入 Notion，作为复习与面试速查笔记。

---

## 1. 本章一句话

**Dynamic Programming = 在已知完整 MDP 模型时，把 Bellman equations 变成 value update rules。**

DP 的目标是：

```
known model p(s', r | s, a)
        ↓
Bellman backup
        ↓
value function
        ↓
optimal policy
```

---

## 2. DP 的前提

DP 假设我们知道完整环境模型：

$$
p(s', r | s, a)
$$

含义：在状态 ⁍ 执行动作 ⁍ 后，转移到 ⁍ 并获得 reward ⁍ 的概率。

DP 的性质：

| 维度               | DP                           |
| ------------------ | ---------------------------- |
| 是否需要模型       | 需要完整模型                 |
| 是否从真实经验学习 | 否                           |
| 是否 bootstrap     | 是                           |
| backup 类型        | full backup                  |
| 典型场景           | planning / 已知 MDP          |
| 局限               | 模型要求强，状态空间大时昂贵 |

---

## 3. 核心概念

### Value Function

状态价值：

$$
v\pi(s)=\mathbb{E}\pi[Gt|St=s]
$$

动作价值：

$$
q\pi(s,a)=\mathbb{E}\pi[Gt|St=s,At=a]
$$

直觉：

```
reward = immediate good/bad
value = long-term good/bad
```

---

## 4. 核心公式

### Bellman Expectation Equation

固定 policy ⁍ 时：

$$
v\pi(s)=\suma \pi(a|s)\sum{s',r}p(s',r|s,a)[r+\gamma v\pi(s')]
$$

含义：

```
当前状态价值 = 当前 policy 下，immediate reward + discounted next value 的期望
```

---

### Bellman Optimality Equation

求最优价值时：

$$
v(s)=\maxa \sum{s',r}p(s',r|s,a)[r+\gamma v(s')]
$$

区别：

```
Bellman expectation: average over policy
Bellman optimality: max over actions
```

---

## 5. Algorithm 1: Policy Evaluation

### 目标

给定 policy ⁍，计算它的 value：

$$
V \approx v\pi
$$

### Update

$$
V(s) \leftarrow \suma \pi(a|s)\sum{s',r}p(s',r|s,a)[r+\gamma V(s')]
$$

### Pseudocode

```
Initialize V(s) arbitrarily
Repeat:
    Δ ← 0
    For each state s:
        oldv ← V(s)
        V(s) ← Σa π(a|s) Σ{s',r} p(s',r|s,a)[r + γV(s')]
        Δ ← max(Δ, |oldv - V(s)|)
Until Δ < θ
```

### Takeaway

```
Policy Evaluation = fixed policy, update value
```

它只评价当前 policy，不改变 policy。

---

## 6. Algorithm 2: Policy Improvement

### 目标

已经有 ⁍，现在改进 policy。

先做 one-step lookahead：

$$
q\pi(s,a)=\sum{s',r}p(s',r|s,a)[r+\gamma v\pi(s')]
$$

然后选择 greedy action：

$$
\pi'(s)=\arg\maxa q\pi(s,a)
$$

也就是：

$$
\pi'(s)=\arg\maxa \sum{s',r}p(s',r|s,a)[r+\gamma v\pi(s')]
$$

### Policy Improvement Theorem

如果：

$$
q\pi(s,\pi'(s)) \ge v\pi(s)
$$

那么：

$$
v{\pi'}(s) \ge v\pi(s)
$$

### Takeaway

```
Policy Improvement = fixed value, update policy greedily
```

---

## 7. Algorithm 3: Policy Iteration（PI）

### 核心思想

```
Policy Evaluation + Policy Improvement 循环
```

流程：

```
π0 → vπ0 → π1 → vπ1 → π2 → ... → π
```

### Pseudocode

```
Initialize V(s), π(s)

Loop:
    # Policy Evaluation
    Repeat:
        For each state s:
            V(s) ← Σ{s',r} p(s',r|s,π(s))[r + γV(s')]
    Until value change is small

    # Policy Improvement
    policystable ← true
    For each state s:
        oldaction ← π(s)
        π(s) ← argmaxa Σ{s',r} p(s',r|s,a)[r + γV(s')]
        If oldaction ≠ π(s):
            policystable ← false

    If policystable:
        return V, π
```

### Takeaway

```
PI = 先认真评价当前 policy，再 greedily 改进它
```

---

## 8. Algorithm 4: Value Iteration（VI）

### 核心思想

VI 不完整评价某个 policy，而是直接做 Bellman optimality backup。

### Update

$$
V(s) \leftarrow \maxa \sum{s',r}p(s',r|s,a)[r+\gamma V(s')]
$$

### Pseudocode

```
Initialize V(s) arbitrarily

Repeat:
    Δ ← 0
    For each state s:
        oldv ← V(s)
        V(s) ← maxa Σ{s',r} p(s',r|s,a)[r + γV(s')]
        Δ ← max(Δ, |oldv - V(s)|)
Until Δ < θ

Output:
    π(s) = argmaxa Σ{s',r} p(s',r|s,a)[r + γV(s')]
```

### Takeaway

```
VI = 直接逼近 optimal value，最后提取 greedy policy
```

---

## 9. PI vs VI 对比

| 维度                 | Policy Iteration                 | Value Iteration           |
| -------------------- | -------------------------------- | ------------------------- |
| 维护对象             | policy + value                   | mainly value              |
| 核心流程             | evaluate policy → improve policy | optimality backup         |
| 是否完整评价 policy  | 是，或近似完整                   | 否                        |
| update 中是否有 max  | evaluation 无，improvement 有    | 每次都有                  |
| policy 何时更新      | 每轮 evaluation 后               | 最后提取，或隐含在 max 中 |
| 直觉                 | 先评估，再改进                   | 边估值边取最优            |
| 和算法题 DP 的相似度 | 间接                             | 更直接                    |

---

## 10. 一个最小例子

设 ⁍，两个非终止状态 ⁍：

| State | Action | Reward | Next     |
| ----- | ------ | ------ | -------- |
| ⁍     | safe   | 0      | terminal |
| ⁍     | go     | 0      | ⁍        |
| ⁍     | exit   | 2      | terminal |
| ⁍     | back   | -1     | ⁍        |

最优策略：

```
s1: go
s2: exit
```

因为：

$$
0 + 0.9 \times 2 = 1.8 > 0
$$

### PI 路径

初始 policy：

```
π0(s1)=safe, π0(s2)=back
```

Evaluate:

```
Vπ0(s1)=0
Vπ0(s2)=-1
```

Improve:

```
π1(s1)=safe
π1(s2)=exit
```

再次 evaluate:

```
Vπ1(s1)=0
Vπ1(s2)=2
```

再次 improve:

```
π2(s1)=go
π2(s2)=exit
```

收敛到 optimal policy。

---

### VI 路径

初始化：

```
V0(s1)=0, V0(s2)=0
```

VI update：

$$
V(s1)=\max\{0,0.9V(s2)\}
$$

$$
V(s2)=\max\{2,-1+0.9V(s1)\}
$$

迭代：

| Iteration | ⁍   | ⁍   |
| --------- | --- | --- |
| 0         | 0   | 0   |
| 1         | 0   | 2   |
| 2         | 1.8 | 2   |

最后提取 greedy policy：

```
s1: go
s2: exit
```

---

## 11. 和算法题 DP 的关系

算法题中的走楼梯：

$$
f(i)=f(i+1)+f(i+2)
$$

最小代价路径：

$$
V(i)=\minj[c(i,j)+V(j)]
$$

RL 里的 DP：

$$
V(s)=\maxa \mathbb{E}[r+\gamma V(s')]
$$

共同点：

```
大问题 → 状态价值 → 递推关系 → 填表 / 更新
```

区别：

| 普通算法题 DP         | RL / MDP DP                |
| --------------------- | -------------------------- |
| 常见为 DAG            | 常有环                     |
| 通常可按顺序填表      | 通常需要迭代到收敛         |
| transition 多为确定   | transition 可随机          |
| 目标可能是计数/最短路 | 目标是最大 expected return |

---

## 12. Asynchronous DP

传统 DP 经常 sweep all states：

```
for each state s:
    update V(s)
```

Asynchronous DP 不要求每轮更新所有 states：

```
可以任意顺序更新
可以某些 states 更新多次
可以延迟更新其他 states
```

只要长期来看相关 states 都持续被更新，就可以收敛。

### Takeaway

```
Asynchronous DP 是后面 sample-based RL 的过渡思想
```

因为真实 agent 通常只访问部分 states。

---

## 13. Generalized Policy Iteration（GPI）

GPI 是本章最重要的抽象。

它包含两个互动过程：

```
Policy Evaluation:
    value moves toward vπ

Policy Improvement:
    policy moves toward greedy(V)
```

图示：

```
value tries to fit current policy
policy tries to become greedy w.r.t. current value
```

最终：

```
value function 和 policy 同时稳定
        ↓
Bellman optimality equation holds
        ↓
optimal value + optimal policy
```

---

## 14. DP vs MC vs TD

| 方法        | 需要模型 | 使用经验 | Bootstrap | Backup                 |
| ----------- | -------- | -------- | --------- | ---------------------- |
| DP          | 是       | 否       | 是        | full backup            |
| Monte Carlo | 否       | 是       | 否        | complete return        |
| TD          | 否       | 是       | 是        | sample one-step backup |

记忆：

```
DP = model + bootstrap
MC = experience + no bootstrap
TD = experience + bootstrap
```

---

## 15. 面试高频回答

### Q: Why are PI and VI called Dynamic Programming algorithms?

因为它们都在已知 MDP 模型时，利用 Bellman recursion / Bellman backup 更新 value function，并最终求出 optimal policy。它们和普通算法题 DP 一样，都是把大问题拆成状态价值，再用递推关系求解；区别是 MDP 通常有随机性和环，所以需要反复迭代直到收敛。

---

### Q: Difference between PI and VI?

Policy Iteration alternates between policy evaluation and policy improvement. It first evaluates the current policy, then improves it greedily. Value Iteration skips full policy evaluation and directly applies the Bellman optimality backup, combining evaluation and improvement in each update.

中文版：

```
PI = 先完整/近似完整评价 policy，再改 policy
VI = 每次直接做带 max 的 Bellman optimality backup
```

---

### Q: Why is DP important if it requires a full model?

DP 是后续 RL 方法的理论母版。Monte Carlo、TD、Sarsa、Q-learning 都可以看成是在没有完整模型、计算资源有限时，对 Bellman backup 和 GPI 的近似实现。

---

## 16. 本章最终 Takeaway

```
Value function gives long-term desirability.
Bellman equation gives self-consistency.
Bellman backup turns consistency into computation.
Policy evaluation estimates value for a fixed policy.
Policy improvement makes policy greedy with respect to value.
Policy iteration alternates the two.
Value iteration merges the two.
GPI generalizes the whole idea to many RL algorithms.
```

一句话压缩：

**DP 是 Sutton/Barto 强化学习体系里的算法母版：后面的 MC、TD、Sarsa、Q-learning、actor-critic 都是在不同信息条件下，对 Bellman backup + GPI 的近似实现。**
