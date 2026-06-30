---
title: Sutton 强化学习：第 3 天 动态规划
date: '2026-05-28'
overview: 动态规划是强化学习基于模型的起点：利用已知的 MDP 动力学，贝尔曼方程成为迭代值和策略更新规则。
description: 关于动态规划、策略评估、策略改进、策略迭代、值迭代和广义策略迭代的干净的 Sutton 和 Barto 阅读笔记。
math: true
toc: true
relatedPosts: false
tags:
 - sutton-rl
 - rl
categories:
 - learning
lang: zh
translationKey: sutton-rl-day-3-dp
canonicalSlug: sutton-rl-day-3-dp
---

<!-- notion-sync: 36e4e07a-a023-8055-ae32-e78d60c3c5cb parent=Sutton-RL url=链接 0 -->

> 资料来源：Sutton 和 Barto，_强化学习：简介_，第 4 章。
>
> 使用此注释作为复习表。目标不是记住每个方程，而是了解 Bellman 备份如何将已知的 MDP 模型转化为计算。

## 一句话模型

当完整的环境模型已知时，动态规划就是强化学习的样子：
```text
known p(s', r | s, a)
 -> Bellman backup
 -> value function
 -> improved policy
```
当模型缺失或模型成本太高而无法直接使用时，Sutton 和 Barto 中后来的无模型方法可以被视为该图的近似值。

## 假设

DP 假设可以访问过渡和奖励动态：

$$
p(s', r \mid s, a)
$$

这是在状态 $s$ 采取行动 $a$ 后到达状态 $s'$ 并获得奖励 $r$ 的概率。

|问题 | DP 答案|
| --- | --- |
|它需要模型吗？ |是的，完整的 MDP 动态 |
|它是否从样本经验中学习？ |不直接 |
|它会引导吗？ |是的 |
|什么样的备份？ |完整备份所有接下来的状态和奖励 |
|什么时候实用？ |规划、小型 MDP、已知模拟器 |
|主要限制 |大型状态/动作空间变得昂贵 |

## 值函数

政策$\pi$下的状态价值：

$$
v_\pi(s) = \mathbb{E}_\pi[G_t \mid S_t = s]
$$

政策$\pi$下的行动价值：

$$
q_\pi(s,a) = \mathbb{E}_\pi[G_t \mid S_t = s, A_t = a]
$$

有用的直觉：
```text
reward = immediate signal
value = long-term desirability
```
## 贝尔曼方程

对于固定策略 $\pi$，贝尔曼期望方程为：

$$
v_\pi(s) =
\sum_a \pi(a \mid s)
\sum_{s', r} p(s', r \mid s, a)
\left[r + \gamma v_\pi(s')\right]
$$

它说：价值是预期的即时奖励加上折扣的下一个价值。

对于最优值函数：

$$
v_*(s) =
\max_a
\sum_{s', r} p(s', r \mid s, a)
\left[r + \gamma v_*(s')\right]
$$

区别在于运算符：
```text
Bellman expectation: average over the policy
Bellman optimality: maximize over actions
```
## 算法 1：政策评估

给定一个策略$\pi$，估计它的价值函数。

更新规则：

$$
V(s) \左箭头
\sum_a \pi(a \mid s)
\sum_{s', r} p(s', r \mid s, a)
\left[r + \gamma V(s')\right]
$$

伪代码：
```text
initialize V(s) arbitrarily

repeat:
 delta <- 0
 for each state s:
 old <- V(s)
 V(s) <- sum_a pi(a|s) sum_{s',r} p(s',r|s,a) [r + gamma V(s')]
 delta <- max(delta, |old - V(s)|)
until delta < theta
```
政策评估的答案是：“这项政策有多好？”

## 算法 2：政策改进

一旦我们有了 $v_\pi$，就通过一步前瞻来改进策略：

$$
q_\pi(s,a) =
\sum_{s', r} p(s', r \mid s, a)
\left[r + \gamma v_\pi(s')\right]
$$

然后贪心选择：

$$
\pi'(s) =
\arg\max_a
\sum_{s', r} p(s', r \mid s, a)
\left[r + \gamma v_\pi(s')\right]
$$

政策改进定理指出，如果新行动在每个州至少与旧政策一样好，那么新政策至少在总体上一样好：

$$
q_\pi(s,\pi'(s)) \ge v_\pi(s)
\ 意味着
v_{\pi'}(s) \ge v_\pi(s)
$$

政策改进回答：“这个政策应该如何改变？”

## 算法 3：策略迭代

策略迭代交替执行两个步骤：
```text
evaluate pi_k -> get v_{pi_k}
improve greedily -> get pi_{k+1}
repeat until policy stable
```
伪代码：
```text
initialize V(s) and pi(s)

loop:
 # policy evaluation
 repeat:
 for each state s:
 V(s) <- sum_{s',r} p(s',r|s,pi(s)) [r + gamma V(s')]
 until value change is small

 # policy improvement
 stable <- true
 for each state s:
 old_action <- pi(s)
 pi(s) <- argmax_a sum_{s',r} p(s',r|s,a) [r + gamma V(s')]
 if old_action != pi(s):
 stable <- false

 if stable:
 return V, pi
```
策略迭代是保守的：认真评估，然后改进。

## 算法 4：值迭代

值迭代跳过完整的策略评估并直接应用贝尔曼最优性备份：

$$
V(s) \左箭头
\max_a
\sum_{s', r} p(s', r \mid s, a)
\left[r + \gamma V(s')\right]
$$

伪代码：
```text
initialize V(s) arbitrarily

repeat:
 delta <- 0
 for each state s:
 old <- V(s)
 V(s) <- max_a sum_{s',r} p(s',r|s,a) [r + gamma V(s')]
 delta <- max(delta, |old - V(s)|)
until delta < theta

return pi(s) = argmax_a sum_{s',r} p(s',r|s,a) [r + gamma V(s')]
```
值迭代更直接：将值推向最优，然后提取贪婪策略。

## 策略迭代与值迭代

|尺寸|政策迭代|价值迭代|
| --- | --- | --- |
|维护 |政策与价值观|主要看值|
|内循环|评估政策 |应用最优性备份 |
|使用全面评估？ |是，或大约 |没有 |
|每次值更新都有最大值吗？ |没有 |是的 |
|政策更新时间|评价后|最后，或者隐含在 max | 中
|直觉 |评估，然后改进 |在评估的同时改进|

## 最小示例

两个非终止状态 $s_1$ 和 $s_2$，其中 $\gamma = 0.9$：

|状态|行动|奖励 |下一页 |
| --- | --- | --- | --- |
| $s_1$ |安全| 0 |终端|
| $s_1$ |去 | 0 | $s_2$ |
| $s_2$ |退出 | 2 |终端|
| $s_2$ |返回 | -1 | $s_1$ |

最优策略是：
```text
s1: go
s2: exit
```
因为：

$$
0 + 0.9 \乘以 2 = 1.8 > 0
$$

价值迭代很快就能达到这个目的：

$$
V(s_1) = \max\{0, 0.9V(s_2)\}
$$

$$
V(s_2) = \max\{2, -1 + 0.9V(s_1)\}
$$

|迭代| $V(s_1)$ | $V(s_2)$ |
| --- | ---: | ---: |
| 0 | 0 | 0 |
| 1 | 0 | 2 |
| 2 | 1.8 | 1.8 2 |

## 与普通动态规划的关系

经典算法问题通常使用递归，例如：

$$
f(i) = f(i+1) + f(i+2)
$$

或：

$$
V(i) = \min_j \left[c(i,j) + V(j)\right]
$$

强化学习动态规划使用相同的递归思想，但具有随机转换和预期回报：

$$
V(s) = \max_a \mathbb{E}\left[r + \gamma V(s')\right]
$$

|普通 DP| MDP/RL DP |
| --- | --- |
|通常是非循环的 |经常循环 |
|经常能按顺序填满一张桌子 |通常迭代至收敛 |
|转换可能是确定性的 |转变是概率性的 |
|目标可能是计数或最短路径|目标是预期回报|

## 广义策略迭代

广义策略迭代是一个大抽象：
```text
policy evaluation:
 value moves toward v_pi

policy improvement:
 policy moves toward greedy(V)
```
这两个过程相互作用直到两者稳定。此时，价值函数和策略满足贝尔曼最优方程。

这是本书大部分内容的模板：
```text
DP = model + bootstrap
MC = experience + no bootstrap
TD = experience + bootstrap
Sarsa = on-policy TD control
Q-learning = off-policy TD control
```
## 面试答案

**为什么 PI 和 VI 被称为动态规划算法？**

他们通过重复将贝尔曼递归应用于值函数来解决已知的 MDP，就像普通 DP 通过较小的状态值解决较大的问题一样。

**PI 和 VI 有什么区别？**

策略迭代交替评估和改进。价值迭代直接应用贝尔曼最优性备份，在每次更新中结合价值估计和贪婪改进。

**如果需要完整模型，为什么要研究 DP？**

因为它是后来的 RL 算法的概念之父。 MC、TD、Sarsa、Q-learning 和 actor-critic 方法都可以被理解为在较弱信息下近似贝尔曼备份和广义策略迭代的方法。

## 最后的要点

动态规划是强化学习最简洁的版本：
```text
value function -> Bellman equation -> Bellman backup -> improved policy
```
一旦这个循环清晰了，萨顿和巴托的其余部分就变得更容易组织。
