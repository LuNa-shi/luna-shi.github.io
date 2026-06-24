---
title: 'Sutton RL: Day 3 - Dynamic Programming'
date: '2026-05-28'
overview: >-
  Dynamic programming is the model-based starting point of reinforcement learning: with known MDP dynamics, Bellman
  equations become iterative value and policy update rules.
description: >-
  A clean Sutton and Barto reading note on dynamic programming, policy evaluation, policy improvement, policy iteration,
  value iteration, and generalized policy iteration.
math: true
toc: true
relatedPosts: false
tags:
  - sutton-rl
  - rl
categories:
  - learning
---

<!-- notion-sync: 36e4e07a-a023-8055-ae32-e78d60c3c5cb parent=Sutton-RL url=https://app.notion.com/p/36e4e07aa0238055ae32e78d60c3c5cb -->

> Source: Sutton & Barto, _Reinforcement Learning: An Introduction_, Chapter 4.
>
> Use this note as a review sheet. The goal is not to memorize every equation, but to see how Bellman backups turn a known MDP model into computation.

## One-sentence model

Dynamic programming is what RL looks like when the full environment model is known:

```text
known p(s', r | s, a)
        -> Bellman backup
        -> value function
        -> improved policy
```

The later model-free methods in Sutton and Barto can be read as approximations of this picture when the model is missing or too expensive to use directly.

## Assumption

DP assumes access to the transition and reward dynamics:

$$
p(s', r \mid s, a)
$$

That is the probability of landing in state $s'$ and receiving reward $r$ after taking action $a$ in state $s$.

| Question | DP answer |
| --- | --- |
| Does it need a model? | Yes, the full MDP dynamics |
| Does it learn from sampled experience? | Not directly |
| Does it bootstrap? | Yes |
| What kind of backup? | Full backup over all next states and rewards |
| When is it practical? | Planning, small MDPs, known simulators |
| Main limitation | Large state/action spaces become expensive |

## Value functions

State value under policy $\pi$:

$$
v_\pi(s) = \mathbb{E}_\pi[G_t \mid S_t = s]
$$

Action value under policy $\pi$:

$$
q_\pi(s,a) = \mathbb{E}_\pi[G_t \mid S_t = s, A_t = a]
$$

The useful intuition:

```text
reward = immediate signal
value  = long-term desirability
```

## Bellman equations

For a fixed policy $\pi$, the Bellman expectation equation is:

$$
v_\pi(s) =
\sum_a \pi(a \mid s)
\sum_{s', r} p(s', r \mid s, a)
\left[r + \gamma v_\pi(s')\right]
$$

It says: value is the expected immediate reward plus discounted next value.

For the optimal value function:

$$
v_*(s) =
\max_a
\sum_{s', r} p(s', r \mid s, a)
\left[r + \gamma v_*(s')\right]
$$

The difference is the operator:

```text
Bellman expectation: average over the policy
Bellman optimality:  maximize over actions
```

## Algorithm 1: policy evaluation

Given a policy $\pi$, estimate its value function.

Update rule:

$$
V(s) \leftarrow
\sum_a \pi(a \mid s)
\sum_{s', r} p(s', r \mid s, a)
\left[r + \gamma V(s')\right]
$$

Pseudocode:

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

Policy evaluation answers: "How good is this policy?"

## Algorithm 2: policy improvement

Once we have $v_\pi$, improve the policy by one-step lookahead:

$$
q_\pi(s,a) =
\sum_{s', r} p(s', r \mid s, a)
\left[r + \gamma v_\pi(s')\right]
$$

Then choose greedily:

$$
\pi'(s) =
\arg\max_a
\sum_{s', r} p(s', r \mid s, a)
\left[r + \gamma v_\pi(s')\right]
$$

The policy improvement theorem says that if the new action is at least as good as the old policy in every state, then the new policy is at least as good overall:

$$
q_\pi(s,\pi'(s)) \ge v_\pi(s)
\implies
v_{\pi'}(s) \ge v_\pi(s)
$$

Policy improvement answers: "How should this policy change?"

## Algorithm 3: policy iteration

Policy iteration alternates the two steps:

```text
evaluate pi_k -> get v_{pi_k}
improve greedily -> get pi_{k+1}
repeat until policy stable
```

Pseudocode:

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

Policy iteration is conservative: evaluate seriously, then improve.

## Algorithm 4: value iteration

Value iteration skips full policy evaluation and directly applies the Bellman optimality backup:

$$
V(s) \leftarrow
\max_a
\sum_{s', r} p(s', r \mid s, a)
\left[r + \gamma V(s')\right]
$$

Pseudocode:

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

Value iteration is more direct: push values toward optimality, then extract a greedy policy.

## Policy iteration vs value iteration

| Dimension | Policy iteration | Value iteration |
| --- | --- | --- |
| Maintains | Policy and value | Mainly value |
| Inner loop | Evaluate a policy | Apply optimality backup |
| Uses full evaluation? | Yes, or approximately | No |
| Has max in every value update? | No | Yes |
| Policy update timing | After evaluation | At the end, or implicit in max |
| Intuition | Evaluate, then improve | Improve while evaluating |

## Minimal example

Two non-terminal states, $s_1$ and $s_2$, with $\gamma = 0.9$:

| State | Action | Reward | Next |
| --- | --- | --- | --- |
| $s_1$ | safe | 0 | terminal |
| $s_1$ | go | 0 | $s_2$ |
| $s_2$ | exit | 2 | terminal |
| $s_2$ | back | -1 | $s_1$ |

The optimal policy is:

```text
s1: go
s2: exit
```

because:

$$
0 + 0.9 \times 2 = 1.8 > 0
$$

Value iteration reaches this quickly:

$$
V(s_1) = \max\{0, 0.9V(s_2)\}
$$

$$
V(s_2) = \max\{2, -1 + 0.9V(s_1)\}
$$

| Iteration | $V(s_1)$ | $V(s_2)$ |
| --- | ---: | ---: |
| 0 | 0 | 0 |
| 1 | 0 | 2 |
| 2 | 1.8 | 2 |

## Relation to ordinary dynamic programming

Classic algorithm problems often use recurrences like:

$$
f(i) = f(i+1) + f(i+2)
$$

or:

$$
V(i) = \min_j \left[c(i,j) + V(j)\right]
$$

RL dynamic programming uses the same recurrence idea, but with stochastic transitions and expected returns:

$$
V(s) = \max_a \mathbb{E}\left[r + \gamma V(s')\right]
$$

| Ordinary DP | MDP/RL DP |
| --- | --- |
| Often acyclic | Often cyclic |
| Can often fill a table in order | Usually iterates to convergence |
| Transitions may be deterministic | Transitions are probabilistic |
| Objective may be count or shortest path | Objective is expected return |

## Generalized policy iteration

Generalized policy iteration is the big abstraction:

```text
policy evaluation:
    value moves toward v_pi

policy improvement:
    policy moves toward greedy(V)
```

The two processes interact until both stabilize. At that point, the value function and policy satisfy the Bellman optimality equation.

This is the template behind much of the book:

```text
DP       = model + bootstrap
MC       = experience + no bootstrap
TD       = experience + bootstrap
Sarsa    = on-policy TD control
Q-learning = off-policy TD control
```

## Interview answers

**Why are PI and VI called dynamic programming algorithms?**

They solve a known MDP by repeatedly applying Bellman recurrences to value functions, just as ordinary DP solves a larger problem through smaller state values.

**What is the difference between PI and VI?**

Policy iteration alternates evaluation and improvement. Value iteration applies the Bellman optimality backup directly, combining value estimation and greedy improvement in each update.

**Why study DP if it requires a full model?**

Because it is the conceptual parent of later RL algorithms. MC, TD, Sarsa, Q-learning, and actor-critic methods can all be read as ways to approximate Bellman backup and generalized policy iteration under weaker information.

## Final takeaway

Dynamic programming is the cleanest version of reinforcement learning:

```text
value function -> Bellman equation -> Bellman backup -> improved policy
```

Once that loop is clear, the rest of Sutton and Barto becomes easier to organize.
