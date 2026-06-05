---
title: Sutton RL Chapter 5：Monte Carlo Methods
date: '2026-05-29'
overview: >-
  TLDR: Monte Carlo methods learn value from complete sampled episodes, trading model-free simplicity for delayed
  updates and return variance.
description: >-
  TLDR: Monte Carlo methods learn value from complete sampled episodes, trading model-free simplicity for delayed
  updates and return variance.
tags:
  - sutton-rl
categories:
  - learning
  - rl
math: true
toc: true
relatedPosts: true
---

<!-- notion-sync: 36f4e07a-a023-8082-803b-dd60e0a687ce parent=Sutton-RL url=https://app.notion.com/p/36f4e07aa0238082803bdd60e0a687ce -->

---

## 1. 本章核心一句话

Monte Carlo Methods 用 **完整 episode 结束后的 return** 来估计 value function。

它和 DP 的关键区别：

- DP 需要完整环境模型。

- MC 不需要完整模型，只需要 sampled episodes。

- MC 不 bootstrap，也就是不用后继状态的 value estimate 来更新当前 value。

- MC 通常要等 episode 结束后才能更新。

---

## 2. Monte Carlo 的基本对象

### Return

$$
Gt = R{t+1} + \gamma R{t+2} + \gamma^2 R{t+3} + \cdots
$$

在 episodic task 中，episode 终止后，完整 return 才完全知道。

### State-value function

$$
v\pi(s) = \mathbb{E}\pi[Gt \mid St=s]
$$

含义：从状态 `s` 开始，之后按照 policy `π` 行动，未来 return 的期望。

### Action-value function

$$
q\pi(s,a) = \mathbb{E}\pi[Gt \mid St=s, At=a]
$$

含义：在状态 `s` 先做动作 `a`，之后按照 policy `π` 行动，未来 return 的期望。

---

## 3. MC Prediction：估计固定 policy 的 value

目标：给定 policy `π`，估计 `vπ` 或 `qπ`。

### State-value MC update

$$
V(St) \leftarrow V(St) + \alpha [Gt - V(St)]
$$

直觉：

- `G_t` 是这次 episode 中真实观察到的完整 return。

- `V(S_t)` 是当前估计。

- 更新方向是：让估计值靠近真实 return。

---

## 4. First-visit MC vs Every-visit MC

### First-visit MC

一个 episode 中，某个 state 第一次出现时才用于更新。

适合理论分析，书中主要采用。

### Every-visit MC

一个 episode 中，某个 state 每次出现都用于更新。

更自然地连接 function approximation 和 eligibility traces。

---

## 5. 为什么 MC Control 通常估计 Q 而不是 V？

如果没有模型，就不知道：

$$
p(s', r \mid s,a)
$$

因此只有 `V(s)` 不足以做 one-step lookahead。

所以 MC control 更常估计：

$$
Q(s,a)
$$

有了 action-value function，就可以直接选：

$$
\pi(s) = \arg\maxa Q(s,a)
$$

---

## 6. MC Action-value update

$$
Q(St,At) \leftarrow Q(St,At) + \alpha [Gt - Q(St,At)]
$$

含义：访问 state-action pair `(S_t, A_t)` 后，用完整 return `G_t` 更新它的价值估计。

---

## 7. Exploring Starts

### 问题

如果 policy 是 deterministic 的，某些 action 可能永远不会被尝试，因此对应的 `Q(s,a)` 永远无法被估计。

### Exploring Starts 假设

每个 episode 的初始 state-action pair 都有非零概率被选到。

这样可以保证所有 `(s,a)` 最终都会被访问。

### 缺点

这个假设通常不现实，尤其是真实环境交互中很难强行从任意 `(s,a)` 开始。

---

## 8. Monte Carlo ES 算法

MC ES = Monte Carlo with Exploring Starts。

核心思想：用 sampled episode 估计 `Q`，再让 policy 对 `Q` 贪心。

### Pseudocode

```
Initialize Q(s,a) arbitrarily
Initialize π(s) arbitrarily
Initialize Returns(s,a) as empty list

Repeat forever:
    Choose S0, A0 such that all pairs have probability > 0
    Generate an episode from S0, A0, following π

    For each first-visit pair (s,a) in the episode:
        G ← return following the first occurrence of (s,a)
        Append G to Returns(s,a)
        Q(s,a) ← average(Returns(s,a))

    For each state s in the episode:
        π(s) ← argmaxa Q(s,a)
```

### Takeaway

MC ES 是 MC 版的 Generalized Policy Iteration：

```
policy evaluation:  π → qπ
policy improvement: qπ → greedy policy
```

---

## 9. On-policy MC Control

On-policy 的意思：

> 用来产生行为的 policy，就是我们正在评价和改进的 policy。

为了保持探索，不能让 policy 完全 greedy，而是使用 ε-soft 或 ε-greedy policy。

### ε-greedy policy

设：

$$
a^ = \arg\maxa Q(s,a)
$$

对 greedy action：

$$
\pi(a^ \mid s) = 1 - \epsilon + \frac{\epsilon}{|\mathcal{A}(s)|}
$$

对非 greedy action：

$$
\pi(a \mid s) = \frac{\epsilon}{|\mathcal{A}(s)|}
$$

### Pseudocode

```
Initialize Q(s,a) arbitrarily
Initialize π as an ε-soft policy
Initialize Returns(s,a) as empty list

Repeat forever:
    Generate an episode using π

    For each first-visit pair (s,a) in the episode:
        G ← return following first occurrence of (s,a)
        Append G to Returns(s,a)
        Q(s,a) ← average(Returns(s,a))

    For each state s in the episode:
        a ← argmaxa Q(s,a)

        For each action a:
            if a == a:
                π(a|s) ← 1 - ε + ε / |A(s)|
            else:
                π(a|s) ← ε / |A(s)|
```

### Takeaway

On-policy MC control 学到的是 **ε-soft policy 中最好的 policy**，而不是完全 deterministic 的 greedy optimal policy。

---

## 10. Off-policy Learning

Off-policy 的意思：

> 用一个 behavior policy 产生数据，但学习另一个 target policy。

### 两个 policy

- Target policy `π`：真正想评价或优化的 policy。

- Behavior policy `μ`：实际用来和环境交互、生成 episodes 的 policy。

### Coverage assumption

如果 target policy 可能选择某个动作，那么 behavior policy 必须也有概率选择它：

$$
\pi(a \mid s) > 0 \Rightarrow \mu(a \mid s) > 0
$$

否则无法从 `μ` 的数据中估计 `π` 的表现。

---

## 11. Importance Sampling Ratio

Off-policy 的核心问题：

> 数据来自 `μ`，但我们想估计 `π`。

所以需要用概率比值修正 trajectory 的分布差异。

### Ratio

$$
\rhot^T =
\prod{k=t}^{T-1}
\frac{\pi(Ak \mid Sk)}{\mu(Ak \mid Sk)}
$$

直觉：

- 如果 trajectory 在 `π` 下更可能发生，ratio 大。

- 如果 trajectory 在 `π` 下不太可能发生，ratio 小。

- 如果 trajectory 包含 `π` 不会做的 action，ratio 为 0。

环境转移概率会在分子分母中抵消，所以 ratio 只依赖两个 policies。

---

## 12. Ordinary Importance Sampling

公式：

$$
V(s) =
\frac{
\sum{t \in \mathcal{T}(s)}
\rhot^{T(t)} Gt
}{
|\mathcal{T}(s)|
}
$$

含义：

> 每个 return 先乘上 importance ratio，再做普通平均。

简写：

$$
\text{Ordinary IS} = \frac{\sum \rho G}{n}
$$

### 优点

unbiased，也就是期望上正确。

### 缺点

variance 可能非常大，甚至可能 infinite。

---

## 13. Weighted Importance Sampling

公式：

$$
V(s) =
\frac{
\sum{t \in \mathcal{T}(s)}
\rhot^{T(t)} Gt
}{
\sum{t \in \mathcal{T}(s)}
\rhot^{T(t)}
}
$$

含义：

> 用 importance ratio 作为权重，对 returns 做加权平均。

简写：

$$
\text{Weighted IS} = \frac{\sum \rho G}{\sum \rho}
$$

### 优点

variance 通常低很多，实践中更稳定。

### 缺点

有限样本下有 bias，但数据增多后 bias 会下降。

---

## 14. Ordinary IS vs Weighted IS

### Ordinary IS

$$
\frac{\sum \rho G}{n}
$$

特点：

- 分母是样本数。

- 每个 scaled return 直接平均。

- 无偏。

- 方差可能很大。

### Weighted IS

$$
\frac{\sum \rho G}{\sum \rho}
$$

特点：

- 分母是权重总和。

- 本质是 normalized weighted average。

- 有偏但稳定。

- 实践中通常更常用。

---

## 15. Incremental Weighted Importance Sampling

为了不保存所有 returns，可以维护累计权重 `C`。

### Weighted average update

$$
Q \leftarrow Q + \frac{W}{C} [G - Q]
$$

其中：

$$
C \leftarrow C + W
$$

含义：

- `W` 是当前 episode 的 importance weight。

- `C` 是累计权重。

- 更新形式仍然是：

$$
\text{new estimate} \leftarrow \text{old estimate} + \text{step size} \times \text{error}
$$

---

## 16. Off-policy MC Control

核心结构：

- Behavior policy `μ`：soft，用于探索。

- Target policy `π`：greedy with respect to `Q`。

- 用 weighted importance sampling 更新 `Q`。

### Pseudocode

```
Initialize Q(s,a) arbitrarily
Initialize C(s,a) = 0
Initialize π(s) = argmaxa Q(s,a)

Repeat forever:
    Generate an episode using soft behavior policy μ

    G ← 0
    W ← 1

    For t = T-1, T-2, ..., 0:
        G ← γG + R{t+1}

        C(St,At) ← C(St,At) + W

        Q(St,At) ← Q(St,At)
                     + W / C(St,At)  [G - Q(St,At)]

        π(St) ← argmaxa Q(St,a)

        If At != π(St):
            break

        W ← W / μ(At|St)
```

### 为什么从后往前？

因为 return 可以递推：

$$
G \leftarrow \gamma G + R{t+1}
$$

### 为什么遇到非 greedy action 就 break？

target policy `π` 是 deterministic greedy policy。如果 behavior policy 做了 target policy 不会做的 action，那么该 trajectory 对 target policy 的 probability 为 0，继续往前的 importance weight 也没有贡献。

---

## 17. MC 与 DP、TD 的对比

### DP

- 需要完整模型。

- 使用 full backup。

- bootstrap。

- 不需要 sampled episodes。

### MC

- 不需要完整模型。

- 使用完整 sampled return。

- 不 bootstrap。

- 通常需要 episode 结束。

### TD

- 不需要完整模型。

- 使用 one-step sampled transition。

- bootstrap。

- 可以 step-by-step online update。

---

## 18. 本章关键 Takeaways

1. MC methods learn from complete returns.

1. MC methods require episodes to terminate.

1. MC methods do not need a complete model.

1. MC methods do not bootstrap.

1. MC prediction estimates value by averaging returns.

1. MC control usually estimates action values `Q(s,a)`.

1. Exploring starts solves exploration theoretically but is often unrealistic.

1. On-policy MC keeps exploration through ε-soft or ε-greedy policies.

1. Off-policy MC separates behavior policy and target policy.

1. Importance sampling corrects the distribution mismatch between `μ` and `π`.

1. Ordinary IS is unbiased but high variance.

1. Weighted IS is biased in finite samples but usually much more stable.

1. MC is conceptually simple, but off-policy MC can be statistically unstable.

---

## 19. 一页公式复习

### Return

$$
Gt = R{t+1} + \gamma R{t+2} + \gamma^2 R{t+3} + \cdots
$$

### MC state-value update

$$
V(St) \leftarrow V(St) + \alpha [Gt - V(St)]
$$

### MC action-value update

$$
Q(St,At) \leftarrow Q(St,At) + \alpha [Gt - Q(St,At)]
$$

### Greedy policy

$$
\pi(s) = \arg\maxa Q(s,a)
$$

### ε-greedy greedy-action probability

$$
\pi(a^ \mid s) = 1 - \epsilon + \frac{\epsilon}{|\mathcal{A}(s)|}
$$

### ε-greedy non-greedy-action probability

$$
\pi(a \mid s) = \frac{\epsilon}{|\mathcal{A}(s)|}
$$

### Importance sampling ratio

$$
\rhot^T =
\prod{k=t}^{T-1}
\frac{\pi(Ak \mid Sk)}{\mu(Ak \mid Sk)}
$$

### Ordinary importance sampling

$$
V(s) =
\frac{
\sum{t \in \mathcal{T}(s)}
\rhot^{T(t)} Gt
}{
|\mathcal{T}(s)|
}
$$

### Weighted importance sampling

$$
V(s) =
\frac{
\sum{t \in \mathcal{T}(s)}
\rhot^{T(t)} Gt
}{
\sum{t \in \mathcal{T}(s)}
\rhot^{T(t)}
}
$$

### Incremental weighted IS update

$$
Q \leftarrow Q + \frac{W}{C} [G - Q]
$$

---

## 20. 最终总结

Monte Carlo methods 是从 DP 走向 model-free learning 的第一步。

它保留了 GPI 的结构：

```
evaluate policy → improve policy
```

但把 DP 中基于模型的 Bellman backup，换成了基于 sampled episodes 的 complete return average。

一句话压缩：

> MC = model-free + complete return + no bootstrapping + episode-based GPI.
