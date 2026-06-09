---
title: 'Sutton RL: Chapter 6 - Temporal-Difference Learning'
date: '2026-05-30'
overview: >-
  TLDR: TD learning updates from partial experience by bootstrapping current value estimates, combining Monte Carlo
  sampling with dynamic-programming-style updates.
description: >-
  TLDR: TD learning updates from partial experience by bootstrapping current value estimates, combining Monte Carlo
  sampling with dynamic-programming-style updates.
tags:
  - sutton-rl
categories:
  - learning
  - rl
math: true
toc: true
relatedPosts: true
---

<!-- notion-sync: 3704e07a-a023-800d-89ea-e01649e15c67 parent=Sutton-RL url=https://app.notion.com/p/3704e07aa023800d89eae01649e15c67 -->

---

## 1. 本章核心一句话

Temporal-Difference Learning, TD，是把 Monte Carlo 和 Dynamic Programming 的优点合在一起：

- 像 MC：TD 可以直接从 experience 学，不需要完整环境模型。

- 像 DP：TD 使用已有 value estimate 更新当前 estimate，也就是 bootstrap。

- TD 可以 step-by-step online update，不需要等 episode 结束。

压缩成一句话：

> TD = learning from sampled experience + bootstrapping.

---

## 2. MC、DP、TD 的位置关系

### Monte Carlo

MC target 是完整 return：

$$
Gt
$$

MC update：

$$
V(St) \leftarrow V(St) + \alpha [Gt - V(St)]
$$

特点：

- 不需要 model。

- 不 bootstrap。

- 通常要等 episode 结束。

- target 更接近真实 sampled outcome，但 variance 较大。

---

### Dynamic Programming

DP target 是基于模型的 expected backup：

$$
\mathbb{E}\pi[R{t+1} + \gamma V(S{t+1}) \mid St=s]
$$

特点：

- 需要完整 model。

- bootstrap。

- 使用 all possible next states 的 expectation。

- 不直接从 sampled experience 学。

---

### Temporal-Difference

TD target 是 sampled one-step backup：

$$
R{t+1} + \gamma V(S{t+1})
$$

TD update：

$$
V(St) \leftarrow V(St) + \alpha [R{t+1} + \gamma V(S{t+1}) - V(St)]
$$

特点：

- 不需要 model。

- bootstrap。

- 一步之后即可更新。

- 可以用于 continuing tasks。

---

## 3. TD Prediction

TD prediction 的目标是：给定 policy `π`，估计它的 state-value function：

$$
v\pi(s)
$$

也就是：

$$
v\pi(s) = \mathbb{E}\pi[Gt \mid St=s]
$$

TD 不等完整 return，而是用一步 transition 来更新 value。

---

## 4. TD(0) Update

TD(0) 是最基本的一步 TD 方法。

$$
V(St) \leftarrow V(St) + \alpha [R{t+1} + \gamma V(S{t+1}) - V(St)]
$$

其中 TD target 是：

$$
R{t+1} + \gamma V(S{t+1})
$$

TD error 是：

$$
\deltat = R{t+1} + \gamma V(S{t+1}) - V(St)
$$

所以 TD(0) 也可以写成：

$$
V(St) \leftarrow V(St) + \alpha \deltat
$$

---

## 5. TD Error 的直觉

TD error：

$$
\deltat = R{t+1} + \gamma V(S{t+1}) - V(St)
$$

可以理解为：

```
新的 one-step guess - 旧的 value guess
```

也就是：

```
我原来以为 St 的价值是 V(St)

走了一步后，我看到：
    reward = R{t+1}
    next state value = V(S{t+1})

所以新的估计是：
    R{t+1} + γV(S{t+1})

两者差距就是 TD error
```

如果：

$$
\deltat > 0
$$

说明当前状态价值被低估，应该上调。

如果：

$$
\deltat < 0
$$

说明当前状态价值被高估，应该下调。

---

## 6. 为什么 TD 是 bootstrapping？

Bootstrapping 的意思：

> 用一个 estimate 更新另一个 estimate。

TD target 里面有：

$$
V(S{t+1})
$$

但这个值本身也是 estimate，不是真实 return。

因此 TD 是 bootstrapping。

MC target 是：

$$
Gt
$$

它是完整 sampled return，不依赖其他 value estimate。

因此 MC 不 bootstrap。

---

## 7. TD(0) Pseudocode

```
Input: policy π to be evaluated

Initialize V(s) arbitrarily for all states

Repeat for each episode:
    Initialize S

    Repeat for each step:
        Choose A using policy π
        Take action A
        Observe R and S'

        V(S) ← V(S) + α [R + γV(S') - V(S)]

        S ← S'

    Until S is terminal
```

---

## 8. TD 的优势

### 8.1 不需要环境模型

TD 不需要知道：

$$
p(s', r \mid s,a)
$$

只需要真实或模拟出来的一步 transition：

$$
St, At, R{t+1}, S{t+1}
$$

---

### 8.2 可以 online update

MC 要等 episode 结束，因为完整 return `G_t` 只有最后才知道。

TD 只等一步：

```
observe R and S'
update immediately
```

所以 TD 适合：

- episode 很长的任务；

- continuing tasks；

- 需要边交互边学习的任务。

---

### 8.3 通常更高效

TD 利用了 Markov structure。

它不仅仅拟合观察到的完整 returns，而是通过 transition structure 传播 value 信息。

---

## 9. Batch TD vs Batch MC 的直觉

如果固定一批 training data，反复训练直到收敛：

### Batch MC

MC 会拟合 training data 中实际发生过的 returns。

直觉：

```
我看到这次从 A 出发最后 return 是 0，
那我就把 A 往 0 靠。
```

### Batch TD

TD 会从数据中估计一个 Markov process，然后求这个估计模型下的 value。

直觉：

```
如果我观察到 A 总是转移到 B，
而 B 的平均 value 是 0.75，
那 A 的 value 也应该接近 0.75。
```

### Takeaway

MC 更像是拟合 observed returns。

TD 更像是利用 observed transitions 重建 Markov dynamics，再做 value prediction。

---

## 10. 从 TD Prediction 到 TD Control

Prediction 估计的是：

$$
v\pi(s)
$$

Control 需要选择 action，所以通常估计 action-value function：

$$
q\pi(s,a)
$$

也就是用 `Q(s,a)` 表示：

> 在状态 `s` 做动作 `a`，之后按照某个 policy 行动的 expected return。

TD control 的两个核心算法：

```
Sarsa
Q-learning
```

它们都更新：

$$
Q(St,At)
$$

但使用不同的 TD target。

---

## 11. Sarsa

## 11.1 Sarsa 是什么？

Sarsa 是 on-policy TD control algorithm。

它学习的是当前 behavior policy 的 action-value function。

也就是说：

> agent 实际怎么行动，Sarsa 就学习这个 policy 的价值。

---

## 11.2 Sarsa Update

$$
Q(St,At) \leftarrow Q(St,At) + \alpha [R{t+1} + \gamma Q(S{t+1},A{t+1}) - Q(St,At)]
$$

其中 Sarsa target 是：

$$
R{t+1} + \gamma Q(S{t+1},A{t+1})
$$

Sarsa TD error 是：

$$
\deltat = R{t+1} + \gamma Q(S{t+1},A{t+1}) - Q(St,At)
$$

---

## 11.3 为什么叫 Sarsa？

一次 update 用到五个量：

$$
St,\ At,\ R{t+1},\ S{t+1},\ A{t+1}
$$

也就是：

```
State
Action
Reward
State
Action
```

合起来就是 Sarsa。

---

## 11.4 Sarsa Pseudocode

```
Initialize Q(s,a) arbitrarily

Repeat for each episode:
    Initialize S
    Choose A from S using policy derived from Q
        for example: ε-greedy

    Repeat for each step:
        Take action A
        Observe R and S'

        Choose A' from S' using policy derived from Q
            for example: ε-greedy

        Q(S,A) ← Q(S,A) + α [R + γQ(S',A') - Q(S,A)]

        S ← S'
        A ← A'

    Until S is terminal
```

---

## 11.5 Sarsa 的关键点

Sarsa update 之前，必须先选出下一个 action：

$$
A{t+1}
$$

因为它的 target 用的是：

$$
Q(S{t+1}, A{t+1})
$$

这意味着：

> Sarsa 把下一步实际会做的 action 纳入学习。

如果当前 policy 是 ε-greedy，那么 Sarsa 学到的 value 会包含探索行为带来的影响。

---

## 11.6 Sarsa 的直觉

Sarsa 问的是：

```
如果我继续按照当前这个会探索的 policy 行动，
那么当前这个 state-action pair 值多少？
```

所以 Sarsa 更贴近实际执行时的表现。

如果探索可能带来风险，Sarsa 会把这个风险学进去。

---

## 12. Q-learning

## 12.1 Q-learning 是什么？

Q-learning 是 off-policy TD control algorithm。

它直接学习 optimal action-value function：

$$
q(s,a)
$$

即使 behavior policy 还在探索，Q-learning 的 update target 也假设下一步会选择 greedy action。

---

## 12.2 Q-learning Update

$$
Q(St,At) \leftarrow Q(St,At) + \alpha [R{t+1} + \gamma \maxa Q(S{t+1},a) - Q(St,At)]
$$

其中 Q-learning target 是：

$$
R{t+1} + \gamma \maxa Q(S{t+1},a)
$$

Q-learning TD error 是：

$$
\deltat = R{t+1} + \gamma \maxa Q(S{t+1},a) - Q(St,At)
$$

---

## 12.3 Q-learning Pseudocode

```
Initialize Q(s,a) arbitrarily

Repeat for each episode:
    Initialize S

    Repeat for each step:
        Choose A from S using policy derived from Q
            for example: ε-greedy

        Take action A
        Observe R and S'

        Q(S,A) ← Q(S,A) + α [R + γ maxa Q(S',a) - Q(S,A)]

        S ← S'

    Until S is terminal
```

---

## 12.4 Q-learning 的关键点

Q-learning 不需要先选择：

$$
A{t+1}
$$

再更新。

因为它的 target 直接使用：

$$
\maxa Q(S{t+1},a)
$$

也就是说：

> 不管 agent 下一步实际会不会探索，更新时都假设下一步会选当前看起来最好的 action。

---

## 12.5 Q-learning 的直觉

Q-learning 问的是：

```
如果我从下一步开始总是 greedy，
那么当前这个 state-action pair 值多少？
```

所以它学习的是 greedy target policy 的价值，而不是当前 behavior policy 的价值。

---

## 13. Sarsa vs Q-learning

## 13.1 核心公式对比

### Sarsa target

$$
R{t+1} + \gamma Q(S{t+1},A{t+1})
$$

### Q-learning target

$$
R{t+1} + \gamma \maxa Q(S{t+1},a)
$$

关键差别：

```
Sarsa uses the actual next action.
Q-learning uses the greedy next action.
```

---

## 13.2 Policy 角度

### Sarsa

```
on-policy
```

学习当前实际执行 policy 的价值。

如果使用 ε-greedy 探索，那么它学习的是 ε-greedy policy 的 value。

### Q-learning

```
off-policy
```

behavior policy 可以探索，但 target policy 是 greedy policy。

它学习的是 greedy / optimal policy 的 value。

---

## 13.3 风险角度

### Sarsa

会考虑实际探索带来的风险。

例如：如果某条路径旁边有悬崖，且 ε-greedy 可能随机走错，Sarsa 会觉得这条路径风险较高。

### Q-learning

更新时假设下一步 greedy，因此不直接把探索风险纳入 target。

它可能学到理论上最短但实际探索时更危险的路径。

---

## 13.4 学习对象

### Sarsa 学的是

$$
q\pi(s,a)
$$

其中 `π` 是当前 behavior policy。

### Q-learning 学的是

$$
q(s,a)
$$

也就是 optimal action-value function。

---

## 13.5 一句话区别

> Sarsa learns the value of the policy it actually follows.

> Q-learning learns the value of the greedy policy while behaving exploratorily.

---

## 14. Cliff Walking 直觉例子

Cliff Walking 中有一条靠近 cliff 的最短路径，也有一条远离 cliff 的安全路径。

如果 agent 使用 ε-greedy：

- 大多数时候选 greedy action；

- 少数时候随机探索。

### Q-learning 的行为

Q-learning 的 target 是 greedy max：

$$
\maxa Q(S{t+1},a)
$$

所以它学到的是：

```
如果每一步都 greedy，靠近 cliff 的最短路径最好。
```

但实际执行时仍然有 ε exploration，所以偶尔会掉下 cliff。

---

### Sarsa 的行为

Sarsa 的 target 是实际 next action：

$$
Q(S{t+1},A{t+1})
$$

如果 ε exploration 可能让 agent 掉下 cliff，Sarsa 会把这个风险反映进 value。

所以它更可能学到：

```
远一点但更安全的路径。
```

---

## 15. TD、Sarsa、Q-learning 的共同形式

三者都可以写成同一个 general update pattern：

$$
\text{new estimate}
\leftarrow
\text{old estimate}
+
\alpha[
\text{target}
-
\text{old estimate}
]
$$

---

### TD(0)

Old estimate:

$$
V(St)
$$

Target:

$$
R{t+1} + \gamma V(S{t+1})
$$

Update:

$$
V(St) \leftarrow V(St) + \alpha [\text{target} - V(St)]
$$

---

### Sarsa

Old estimate:

$$
Q(St,At)
$$

Target:

$$
R{t+1} + \gamma Q(S{t+1},A{t+1})
$$

Update:

$$
Q(St,At) \leftarrow Q(St,At) + \alpha [\text{target} - Q(St,At)]
$$

---

### Q-learning

Old estimate:

$$
Q(St,At)
$$

Target:

$$
R{t+1} + \gamma \maxa Q(S{t+1},a)
$$

Update:

$$
Q(St,At) \leftarrow Q(St,At) + \alpha [\text{target} - Q(St,At)]
$$

---

## 16. 参数理解

## Step size α

$$
\alpha
$$

控制每次更新幅度。

大 `α`：

- 学得快；

- 可能不稳定。

小 `α`：

- 学得慢；

- 更平滑。

---

## Discount factor γ

$$
\gamma
$$

控制未来 reward 的重要性。

如果：

$$
\gamma = 0
$$

agent 只关心 immediate reward。

如果：

$$
\gamma \to 1
$$

agent 更重视 long-term reward。

---

## Exploration rate ε

$$
\epsilon
$$

常用于 ε-greedy policy。

大 `ε`：

- 探索多；

- 学习初期可能更充分；

- 执行表现可能差。

小 `ε`：

- 更 exploit；

- 可能更快利用当前好策略；

- 也可能过早收敛到差策略。

---

## 17. 常见误区

## 误区 1：TD target 是真实 return

不是。

TD target 是：

$$
R{t+1} + \gamma V(S{t+1})
$$

其中 `V(S_{t+1})` 是 estimate。

所以 TD target 不是完整真实 return。

---

## 误区 2：Q-learning 的行为 policy 一定是 greedy

不是。

Q-learning 的 target policy 是 greedy，但 behavior policy 可以是 ε-greedy 或其他探索 policy。

这也是它 off-policy 的原因。

---

## 误区 3：Sarsa 和 Q-learning 只差一点点

公式上只差一个 max，但含义很不一样：

```
Sarsa: learn actual behavior policy
Q-learning: learn greedy target policy
```

---

## 误区 4：Q-learning 总是实际表现更好

不一定。

如果训练时持续探索，Q-learning 可能学到最优 greedy path，但实际执行时因为探索而承担风险。

Sarsa 在某些风险环境下在线表现可能更稳定。

---

## 18. 最小手算例子

假设：

$$
Q(S,A)=1.0
$$

$$
R=0
$$

$$
\gamma=0.9
$$

$$
\alpha=0.1
$$

next state 有两个 action：

$$
Q(S',a1)=2.0
$$

$$
Q(S',a2)=3.0
$$

---

## 18.1 Sarsa

假设实际 next action 是：

$$
A' = a1
$$

Sarsa target：

$$
0 + 0.9 \times 2.0 = 1.8
$$

TD error：

$$
1.8 - 1.0 = 0.8
$$

Update：

$$
Q(S,A) \leftarrow 1.0 + 0.1 \times 0.8 = 1.08
$$

---

## 18.2 Q-learning

Q-learning target：

$$
0 + 0.9 \times \max(2.0,3.0) = 2.7
$$

TD error：

$$
2.7 - 1.0 = 1.7
$$

Update：

$$
Q(S,A) \leftarrow 1.0 + 0.1 \times 1.7 = 1.17
$$

---

## 18.3 例子 takeaway

同一个 transition 下：

- Sarsa 用实际 next action `a1`；

- Q-learning 用 next state 中最好的 action `a2`。

所以两个算法的 update 方向和幅度可能不同。

---

## 19. 本章极简公式卡片

## MC

$$
V(St) \leftarrow V(St) + \alpha [Gt - V(St)]
$$

## TD(0)

$$
V(St) \leftarrow V(St) + \alpha [R{t+1} + \gamma V(S{t+1}) - V(St)]
$$

## TD Error

$$
\deltat = R{t+1} + \gamma V(S{t+1}) - V(St)
$$

## Sarsa

$$
Q(St,At) \leftarrow Q(St,At) + \alpha [R{t+1} + \gamma Q(S{t+1},A{t+1}) - Q(St,At)]
$$

## Q-learning

$$
Q(St,At) \leftarrow Q(St,At) + \alpha [R{t+1} + \gamma \maxa Q(S{t+1},a) - Q(St,At)]
$$

---

## 20. 最终 Takeaways

1. TD 是本章核心：sample-based learning + bootstrapping。

1. TD 不需要 model，也不需要等 episode 结束。

1. TD error 是新的 one-step estimate 和旧 estimate 的差。

1. Sarsa 是 on-policy TD control。

1. Sarsa 使用实际 next action 作为 target 的一部分。

1. Q-learning 是 off-policy TD control。

1. Q-learning 使用 next state 的 greedy action value 作为 target。

1. Sarsa 学当前 behavior policy 的 value。

1. Q-learning 学 greedy / optimal target policy 的 value。

1. Sarsa 更能反映探索带来的实际风险。

1. Q-learning 更直接逼近 optimal action-value function。

1. 三个核心公式都遵循同一个模板：

$$
\text{estimate} \leftarrow \text{estimate} + \alpha [\text{target} - \text{estimate}]
$$

---

## 21. 记忆压缩版

```
TD:
    target = R + γV(S')
    learn value from one-step experience

Sarsa:
    target = R + γQ(S',A')
    actual next action
    on-policy

Q-learning:
    target = R + γ maxa Q(S',a)
    greedy next action
    off-policy
```

一句话结束：

> TD 是用 sampled transition 做 Bellman-style update；Sarsa 用实际下一步动作，Q-learning 用贪心下一步动作。
