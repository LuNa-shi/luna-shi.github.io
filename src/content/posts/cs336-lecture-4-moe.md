---
title: 'CS336: Lecture 4 - Mixture of Experts'
date: '2026-05-22'
overview: >-
  TLDR: MoE scales parameter count through sparse expert routing, but the real work is balancing tokens, capacity,
  communication cost, and specialization.
description: >-
  TLDR: MoE scales parameter count through sparse expert routing, but the real work is balancing tokens, capacity,
  communication cost, and specialization.
tags:
  - cs336
categories:
  - learning
  - systems
math: true
toc: true
relatedPosts: true
---

<!-- notion-sync: 3684e07a-a023-80de-bacd-e1ae8e6bd89d parent=CS336 url=https://app.notion.com/p/3684e07aa02380debacde1ae8e6bd89d -->

> 来源：Stanford CS336 Spring 2025 Lecture 4 官方讲义与课程页公开材料。主题是 Mixture of Experts，也就是如何用稀疏激活把语言模型的参数量做大，同时尽量保持每个 token 的计算量可控。
>
> 课程页：http://cs336.stanford.edu/spring2025/
>
> 课程安排：Lecture 4, Thurs April 10, Mixture of experts (Tatsu)。
>
> 官方 PDF：https://github.com/stanford-cs336/spring2025-lectures/blob/98455ec198c9a88ec1ab2b1c4058662431b54ce3/nonexecutable/2025%20Lecture%204%20-%20MoEs.pdf
>
> 补充参考：Shazeer et al. 2017, GShard, Switch Transformer, ST-MoE, Mixtral, DeepSeekMoE / DeepSeek-V2 / DeepSeek-V3, Qwen MoE, OLMoE 等公开论文和报告。

## 0. 本讲主线

| 层级           | 内容                                                 | 复习时要抓住什么                                            |
| -------------- | ---------------------------------------------------- | ----------------------------------------------------------- |
| Motivation     | 为什么 MoE 重新流行                                  | 同样 active FLOPs 下，更多参数和更高容量通常有收益          |
| Architecture   | 用多个 FFN experts 替换 dense FFN                    | 大多数 MoE 是把 Transformer 的 MLP 层变成稀疏专家层         |
| Routing        | token choice top-k 是主流                            | router 为每个 token 选择少数专家，选择本身是离散的          |
| Load balancing | expert / device 负载必须均衡                         | 训练目标里常加 heuristic aux loss 或在线 bias               |
| Systems        | MoE 很适合 expert parallelism                        | 稀疏计算省 FLOPs，但会引入 all-to-all 和 sparse GEMM 复杂度 |
| Stability      | router 是稳定性高风险点                              | router 常用 fp32，并加 z-loss 或其它稳定技巧                |
| Fine-tuning    | Sparse MoE 容易在小数据上过拟合                      | SFT 数据量、router 学习率、冻结策略都很重要                 |
| Upcycling      | 从 dense LM 初始化 MoE                               | 复制已有 FFN 到 experts，再继续训练可以省大量成本           |
| DeepSeek       | shared experts、fine-grained experts、device routing | 现代 MoE 的很多工程技巧可以在 DeepSeek v1-v3 里看到         |
| Bonus          | MLA、MTP                                             | DeepSeek-V3 不只是 MoE，还用了注意力压缩和多 token 预测技巧 |

本讲核心观点：

- MoE 的核心不是“每层都变大”，而是“总参数变大，但每个 token 只激活一小部分参数”。

- 现代 MoE 通常把 Transformer block 中的 FFN / MLP 替换成 MoE layer，attention 大多仍是 dense attention。

- 路由最常见的方法是 token-choice top-k：每个 token 通过 router 选择 `k` 个 experts。

- top-k 路由是离散选择，严格来说不可微；实际训练主要靠 soft gate 的梯度、aux balancing loss、噪声扰动和大量工程调参。

- MoE 的系统收益不是免费的：expert parallelism 带来扩展性，也带来 token dispatch、all-to-all、capacity overflow、负载不均衡等问题。

- 最近很多强模型都是 MoE 或含有 MoE 变体，例如 Mixtral、DBRX、Grok、DeepSeek、Qwen MoE、OLMoE、Llama 4 Maverick 等。

---

## 1. MoE 是什么？

### 1.1 从 dense FFN 到 sparse FFN

标准 Transformer block 里通常有两个主要子层：

$$
\begin{aligned}
x &\leftarrow x + \operatorname{Attention}(\operatorname{Norm}(x)) \\
x &\leftarrow x + \operatorname{MLP}(\operatorname{Norm}(x))
\end{aligned}
$$

其中 `MLP` / `FFN` 是很大的参数块。以非 gated FFN 为例：

$$
\operatorname{FFN}(x) = W{\text{down}} \, \operatorname{activation}(W{\text{up}} x)
$$

如果是现代 LLM 常用的 SwiGLU：

$$
\operatorname{FFN}(x)
= W{\text{down}} \left(\operatorname{SiLU}(W{\text{gate}}x) \odot W{\text{up}}x\right)
$$

MoE 的基本想法是：不要只有一个大 FFN，而是放很多个 FFN experts，再让 router 为每个 token 选择其中少数几个。

$$
\begin{aligned}
x &\leftarrow x + \operatorname{Attention}(\operatorname{Norm}(x)) \\
x &\leftarrow x + \operatorname{MoE}(\operatorname{Norm}(x))
\end{aligned}
$$

对单个 token hidden state `x_t`：

$$
\begin{aligned}
\text{experts} &: E1, E2, \ldots, EN \\
\text{router} &: r(xt) \rightarrow St \\
\operatorname{MoE}(xt) &= \sum{i \in St} g{t,i} Ei(xt)
\end{aligned}
$$

这里：

- `N` 是总 experts 数。

- `S_t` 是 token `t` 被分配到的 experts 集合。

- `k = |S_t|` 是每个 token 激活的 routed experts 数。

- `g_{t,i}` 是 router 给 expert `i` 的 gate / combine weight。

最关键的稀疏性：

$$
\text{total parameters} \propto N,
\qquad
\text{active compute per token} \propto k,
\qquad
k \ll N
$$

### 1.2 一个最小 MoE layer 的数学形式

设一个 batch 里有 `T` 个 tokens，hidden dimension 是 `d_model`，experts 数是 `N`。

Router 先算每个 token 对每个 expert 的 score：

$$
zt = W{\text{router}} xt,
\qquad
zt \in \mathbb{R}^{N}
$$

最常见版本先 softmax：

$$
p{t,i}
= \operatorname{softmax}(zt)i
= \frac{\exp(z{t,i})}{\sum{j=1}^{N}\exp(z{t,j})}
$$

然后选择 top-k：

$$
St = \operatorname{TopK}(pt, k)
$$

最后只计算被选中的 experts：

$$
yt = \sum{i \in St} g{t,i} Ei(xt)
$$

gate `g_{t,i}` 有几种常见写法：

$$
\begin{aligned}
\text{A. 全局 softmax 权重:}\quad
g{t,i} &= p{t,i}, \qquad i \in St \\
\text{B. top-k 内重新归一化:}\quad
g{t,i} &= \frac{p{t,i}}{\sum{j \in St} p{t,j}} \\
\text{C. 先 TopK 再 softmax:}\quad
g{t,i} &= \operatorname{softmax}\left(\{z{t,j}: j \in St\}\right)i
\end{aligned}
$$

不同模型会在这些细节上变化。讲义中特别指出，Mixtral、DBRX、DeepSeek-V3 等会使用 top-k 之后再 softmax / normalize 的路由权重变体。

### 1.3 为什么 MoE 主要替换 FFN，而不是 attention？

大多数 MoE 都是替换 MLP / FFN 子层：

```
dense block:
  attention + dense FFN

MoE block:
  attention + sparse expert FFN
```

原因：

- FFN 参数占 Transformer 参数的大头，换成多专家能显著扩大容量。

- FFN 是 token-wise 的，每个 token 可以独立路由，系统上比较容易切分。

- Attention 需要 token-token 交互，稀疏化 attention heads 会改变上下文混合方式，设计更复杂。

也有少数工作对 attention heads 做 MoE，例如 ModuleFormer、JetMoE，但不是主流。

### 1.4 Dense model 和 MoE model 的参数视角

Dense 模型：

$$
\text{dense model:}\qquad
\text{total params} \approx \text{active params}
$$

也就是说，每个 token 基本都会经过所有模型参数。

MoE 模型：

$$
\text{MoE model:}\qquad
\text{total params} \gg \text{active params}
$$

也就是说，每个 token 只经过部分 experts。

这也是很多 MoE 模型报告时会写两个数字的原因：

| Model        | Total params | Active params per token |
| ------------ | ------------ | ----------------------- |
| DeepSeek-V3  | 671B         | about 37B               |
| Mixtral 8x7B | about 46.7B  | about 12.9B             |

注意：`8x7B` 不是简单等于 `56B active`。它表示有 8 组专家相关参数，但每个 token 只激活其中少数专家，且还有共享的 attention、embedding、norm 等非专家参数。

---

## 2. 为什么 MoE 越来越流行？

### 2.1 Same FLOPs, more parameters

讲义引用 Switch Transformer / Fedus et al. 的核心经验：在类似 FLOPs 下，MoE 通过增加 experts 提供更多参数容量，通常可以得到更好的 loss。

直觉：

```
dense model:
  每个 token 都用同一个 FFN

MoE model:
  不同 token 可以使用不同 FFN
  模型可以把不同模式、语言、领域、任务分散到不同 experts
```

这不等于 experts 一定会变成“英文 expert”“数学 expert”“代码 expert”。实际专家分工往往很混合，但容量扩展确实给了模型更多函数空间。

### 2.2 训练速度和性价比

MoE 的好处不是“训练更简单”，而是“如果系统做得好，达到同等质量可能需要更少 compute”。

可以把性价比理解成：

| 对比方式          | MoE 的潜在收益                                  |
| ----------------- | ----------------------------------------------- |
| 相同 active FLOPs | 更大 total params，可能得到更低 loss / 更强能力 |
| 相同目标 loss     | 可能使用更少训练 FLOPs 或更短 wall-clock time   |

OLMoE、DeepSeek、Mixtral 等结果都说明，MoE 在开源模型里已经不是边缘技巧，而是主流高性能路线之一。

### 2.3 MoE 很适合多设备并行

MoE 的专家天然可以分布到不同设备上：

```
GPU 0: experts 0, 1, 2, ...
GPU 1: experts 8, 9, 10, ...
GPU 2: experts 16, 17, 18, ...
...
```

每个 token 被 router 分配给某些 experts 后，系统把 token hidden states 发送到对应设备，算完 expert FFN 后再合并结果。

这叫 expert parallelism。它的好处是：

- 可以把很多 experts 分摊到很多 GPU。

- 单个 expert 可以像普通 FFN 一样高效计算。

- MoE 层可以和 data parallel、tensor parallel、pipeline parallel 组合。

但它也带来关键成本：

$$
\text{token dispatch}
\rightarrow
\text{all-to-all communication}
\rightarrow
\text{expert computation}
\rightarrow
\text{combine}
$$

因此 MoE 的优势在多节点大规模训练中更明显，小规模单机上未必总是划算。

### 2.4 为什么之前没有更流行？

讲义给了两个主要原因：

| 难点               | 解释                                                       |
| ------------------ | ---------------------------------------------------------- |
| 基础设施复杂       | 需要 dispatch/combine、all-to-all、负载均衡、稀疏矩阵乘    |
| 训练目标 heuristic | routing 是离散选择，不好直接微分，balancing loss 需要调    |
| 稳定性问题         | router softmax、expert collapse、token dropping 都会出问题 |
| fine-tuning 难     | sparse MoE 在小 SFT 数据上更容易过拟合                     |

Dense Transformer 的好处是简单、稳定、可预测。MoE 的收益需要系统工程和训练技巧来兑现。

---

## 3. MoE 的设计空间

讲义把 MoE 的变化主要分成三类：

| 设计轴              | 关键问题                             |
| ------------------- | ------------------------------------ |
| Routing function    | token 如何选择 experts               |
| Expert sizes        | expert 是大、是小，是否 fine-grained |
| Training objectives | 如何让稀疏路由可训练、均衡、稳定     |

### 3.1 Routing function：谁选谁？

路由方法可以粗略分为：

| 路由类型           | 机制                                | 优点                     | 缺点                                    |
| ------------------ | ----------------------------------- | ------------------------ | --------------------------------------- |
| Token-choice top-k | 每个 token 选择 top-k experts       | 简单，现代主流           | 容易负载不均，需要 balancing            |
| Expert-choice      | 每个 expert 选择自己处理哪些 tokens | 天然控制 expert capacity | token 可能没有固定 top-k 语义，实现复杂 |
| Global routing     | 解一个全局 assignment / matching    | 可以显式满足容量约束     | 算法复杂，训练系统难                    |
| Hash routing       | 用固定 hash 分配专家                | 极简单、稳定             | 不根据语义学习路由                      |
| RL routing         | 用强化学习学离散路由策略            | 理论上更直接             | 方差大，复杂，实际少用                  |

现代 LLM 里绝大多数是 token-choice top-k。

### 3.2 Expert sizes：专家有多大？

最简单做法：每个 expert 都是一个完整 FFN。

$$
Ei(x) = \operatorname{FFN}i(x)
$$

现代模型会有更多变化：

| 设计                 | 解释                                | 代表                             |
| -------------------- | ----------------------------------- | -------------------------------- |
| Full-size experts    | 每个 expert 接近 dense FFN 大小     | Switch, GShard, Mixtral 早期形式 |
| Fine-grained experts | 把一个大 expert 拆成多个小 expert   | DeepSeekMoE, Qwen MoE, OLMoE     |
| Shared experts       | 某些 experts 对所有 tokens 永远开启 | DeepSeek, Qwen, Llama 4 Maverick |
| Routed experts       | router 选择的稀疏 experts           | 几乎所有 sparse MoE              |

Fine-grained experts 的核心是：

```
把一个大 FFN 拆成更多小 FFN
每个 token 激活更多个小 expert
总 active compute 近似不变
组合方式更多，路由更灵活
```

例如一个 dense FFN 的中间维度是 `d_ff`。如果拆成 `r` 倍细粒度，那么单个 expert 可能只有：

$$
d{\text{ff, expert}}
= \frac{d{\text{ff}}}{r}
$$

选择 `k` 个小 experts 后：

$$
\operatorname{active\ FFN\ width}
\approx
k \cdot d{\text{ff, expert}}
$$

这样可以增加专家组合数，但不一定增加每 token FLOPs。

### 3.3 Shared experts：为什么要有永远开启的专家？

Shared expert 的形式大致是：

$$
\operatorname{MoE}(xt)
= \sum{i \in St} g{t,i}Ei(xt)
+ \sum{j \in \text{Shared}} Ej^{\text{shared}}(xt)
$$

直觉：

- 有些知识和模式是所有 token 都需要的，不一定适合通过稀疏路由竞争。

- shared experts 像一个公共 dense FFN 通道，帮助保留通用能力。

- routed experts 更负责 specialized capacity。

DeepSeek / Qwen 系列常用 shared experts。不过 OLMoE 的 ablation 里，fine-grained experts 有收益，shared experts 未必总有收益。这说明 shared experts 不是必然更好，而是和模型规模、数据、路由、训练配方有关。

### 3.4 Training objectives：为什么需要额外 loss？

MoE 不只是 language modeling loss：

$$
L{\text{total}}
= L{\text{lm}}
+ \lambda{\text{aux}} L{\text{balance}}
+ \beta Lz
+ \cdots
$$

其中：

- `L_lm` 是标准 next-token prediction cross entropy。

- `L_balance` 鼓励 experts 被均匀使用。

- `L_z` 稳定 router logits。

- 有些模型还会加 device-level balancing、sequence-level balancing、communication balancing 等。

这些 loss 不是来自语言建模目标本身，而是为了让稀疏计算在系统和优化上可用。

---

## 4. Top-k routing 详解

### 4.1 标准 token-choice top-k

对每个 token `x_t`：

$$
\begin{aligned}
zt &= W{\text{router}}xt \\
pt &= \operatorname{softmax}(zt) \\
St &= \operatorname{TopK}(pt, k) \\
yt &= \sum{i \in St} g{t,i}Ei(xt)
\end{aligned}
$$

伪代码：

```
for token xt:
    logits = router(xt)              # shape: [numexperts]
    scores = softmax(logits)
    selected = topk(scores, k)
    weights = normalize(scores[selected])

    output = 0
    for expertid in selected:
        output += weights[expertid]  expertexpertid
```

这里真正稀疏的是 expert FFN：

$$
i \notin St \quad \Longrightarrow \quad Ei(xt)\ \text{不会被计算}
$$

### 4.2 top-k 为什么不可微？

`TopK` 会返回离散 expert id：

$$
St = \operatorname{TopK}(pt, k)
$$

如果一个 expert 排名从第 `k+1` 变成第 `k`，计算图会突然改变。这类离散集合选择没有普通意义上的平滑导数。

实际训练中通常采取折中：

- 被选中的 expert 路径可以正常反向传播。

- gate weight `g_{t,i}` 对 router logits 有梯度。

- 未被选中的 experts 对这个 token 没有 expert-output 梯度。

- top-k 集合本身的选择用 heuristic、噪声、aux loss 来间接改进。

可以记成：

```
router 学到的是“让哪些 experts 进入 top-k”
但 top-k 边界本身不是平滑可微的
```

### 4.3 softmax-before-topk vs topk-then-softmax

两个常见变体：

$$
\begin{aligned}
\text{变体 1:}\quad
p &= \operatorname{softmax}(z), &
S &= \operatorname{TopK}(p, k), &
gi &= \frac{pi}{\sum{j \in S}pj}
\\
\text{变体 2:}\quad
S &= \operatorname{TopK}(z, k), &
gi &= \frac{\exp(zi)}{\sum{j \in S}\exp(zj)}, &
i &\in S
\end{aligned}
$$

差别：

| 变体                  | 特点                                                  |
| --------------------- | ----------------------------------------------------- |
| softmax-before-topk   | 所有 experts 参与归一化，未选中 expert 也影响概率尺度 |
| topk-then-softmax     | 只在选中 experts 内归一化，权重更像局部 mixture       |
| sigmoid score + top-k | 每个 expert 分数更独立，常见于 DeepSeek-V3 相关设计   |

DeepSeek-V3 类方法常见写法是：

$$
\begin{aligned}
s{t,i} &= \sigma(xt^\top ei) \\
St &= \operatorname{TopK}(st + b, k) \\
g{t,i} &= \operatorname{normalize}(s{t,i}), \qquad i \in St
\end{aligned}
$$

这里 `b` 是 per-expert bias，用来调节负载均衡。

注意：bias 常用于影响选择，但最终 combine weight 可以用未加 bias 的原始 score 来算。这能让 bias 更像调度器，而不是直接改变 expert 的语义权重。

### 4.4 top-1、top-2、top-k 的取舍

| k   | 代表                                 | 优点                        | 风险                                    |
| --- | ------------------------------------ | --------------------------- | --------------------------------------- |
| 1   | Switch Transformer, Llama 4 Maverick | 计算最省，系统最简单        | 单一路由更脆弱，expert 选择错误无法互补 |
| 2   | GShard, ST-MoE, Mixtral, Grok        | 常见折中，两个专家可以互补  | FLOPs 和通信翻倍于 top-1 expert         |
| 4   | Qwen MoE, DBRX                       | 更强组合能力                | balancing 和通信更复杂                  |
| 6-8 | DeepSeek, OLMoE                      | fine-grained experts 下常见 | 对系统实现要求高                        |

讲义中的现象是：现代模型越来越常见“小 expert + 更多 active experts”的 fine-grained 路线。

### 4.5 Hash routing 为什么只是 baseline？

Hash routing 可以写成：

$$
\operatorname{expert\id}
= \operatorname{hash}(\text{token id / position / hidden signature}) \bmod N
$$

它的优点是：

- 没有 router softmax。

- 负载可以比较稳定。

- 实现简单。

但缺点也明显：

- 不会根据上下文语义学习路由。

- token id 级别 hash 太粗糙，同一个 token 在不同语境下需求不同。

- 对语言模型来说通常只是 baseline，不是当前强模型主流。

---

## 5. Load balancing：MoE 最重要的训练公式之一

### 5.1 为什么必须做负载均衡？

如果没有约束，router 可能把大多数 tokens 都送给少数 experts：

| Expert   | Token fraction |
| -------- | -------------- |
| expert 0 | 80%            |
| expert 1 | 10%            |
| expert 2 | 2%             |
| others   | …              |

这会导致三类问题：

| 问题            | 结果                                                    |
| --------------- | ------------------------------------------------------- |
| 系统瓶颈        | 热门 expert 所在 GPU 变成 straggler                     |
| token dropping  | 热门 expert capacity 满了，多余 tokens 被丢弃或退化处理 |
| expert collapse | 少数 experts 训练很多，其它 experts 几乎没有梯度        |

所以 MoE 训练里，load balancing 不是小装饰，而是核心机制。

### 5.2 Switch Transformer 的 aux loss

设：

- `T` 是 batch 内 tokens 数。

- `N` 是 experts 数。

- `p_i(x)` 是 router 对 expert `i` 的概率。

- top-1 routing 下，`argmax p(x)` 是 token `x` 被送到的 expert。

定义 expert `i` 的实际 token fraction：

$$
fi
= \frac{1}{T}
\sum{x \in \text{batch}}
\mathbf{1}\{\arg\max p(x) = i\}
$$

定义 expert `i` 的平均 router probability：

$$
Pi
= \frac{1}{T}
\sum{x \in \text{batch}} pi(x)
$$

Switch Transformer 的 load balancing loss：

$$
L{\text{aux}}
= \alpha N \sum{i=1}^{N} fi Pi
$$

直觉：

- `f_i` 衡量 expert `i` 实际被用了多少。

- `P_i` 衡量 router 平均给 expert `i` 多大概率。

- 如果某个 expert 被过度使用，`f_i` 大，那么增加它的概率会受到更大惩罚。

因为 `f_i` 由 `argmax` 得到，不可微，实际反向传播时常把它当常数。对某个 token 的 `p_i(x)`，梯度大致是：

$$
\frac{\partial L{\text{aux}}}{\partial pi(x)}
= \frac{\alpha N fi}{T}
= \frac{\alpha N}{T^2}
\sum{x' \in \text{batch}}
\mathbf{1}\{\arg\max p(x') = i\}
$$

这正对应讲义里强调的直觉：

$$
\text{expert 当前使用越频繁}
\quad\Longrightarrow\quad
\text{继续提高它概率的梯度惩罚越强}
$$

### 5.3 top-k 情况下的 balancing

top-k 时，`f_i` 可以改成：

$$
fi
= \frac{1}{Tk}
\sum{x \in \text{batch}}
\mathbf{1}\{i \in \operatorname{TopK}(p(x), k)\}
$$

也可以按 token 数而不是 assignment 数归一化。不同论文细节不同，但目标一致：

$$
\text{目标：让所有 experts 的 token load 接近均匀}
$$

常见形式仍然是：

$$
L{\text{aux}}
= \alpha N \sumi fi Pi
$$

其中 `P_i` 可以是原始 router probability 的平均，也可以是选中 experts 内 normalized gate 的平均。

### 5.4 Capacity factor 与 token dropping

为了系统效率，每个 expert 通常会有最大容量：

$$
C
= \left\lceil
\operatorname{capacity\factor}
\cdot
\operatorname{expected\tokens\per\expert}
\right\rceil
$$

top-k routing 下：

$$
\operatorname{expected\ assignments\ per\ expert}
= \frac{Tk}{N}
$$

$$
C
= \left\lceil
\operatorname{capacity\factor}
\cdot \frac{Tk}{N}
\right\rceil
$$

如果某个 expert 被分到超过 `C` 个 token：

$$
\text{overflow tokens}
\rightarrow
\text{dropped / rerouted / residual fallback / padded out}
$$

早期 Switch Transformer 会讨论 token dropping。token dropping 的问题是：一个 token 是否被 drop 取决于同 batch 里其它 tokens 的路由。这会带来额外非确定性。

### 5.5 Per-device balancing

在分布式训练中，均衡 expert 不一定等于均衡 device。

假设每个 device 放多个 experts：

```
device 0: experts 0-7
device 1: experts 8-15
...
```

可能每个 expert 使用都不算太偏，但某些 device 上的 experts 总体更热，导致通信和计算不均衡。

DeepSeek v1-v2 里除了 per-expert balancing，还使用 per-device balancing：

$$
L{\text{device\balance}}
= \alpha{\text{device}} D
\sum{d=1}^{D} fd Pd
$$

其中：

$$
\begin{aligned}
fd &= \text{device } d \text{ 实际收到的 token fraction} \\
Pd &= \text{router 给 device } d \text{ 上所有 experts 的平均概率}
\end{aligned}
$$

这类目标不是为了语言建模本身，而是为了让硬件利用率更稳定。

### 5.6 DeepSeek-V3 的 auxiliary-loss-free balancing

DeepSeek-V3 使用 per-expert bias 做在线负载调节。概念上：

$$
\begin{aligned}
s{t,i} &= \sigma(xt^\top ei) \\
\operatorname{selection\score}{t,i} &= s{t,i} + bi \\
St &= \operatorname{TopK}(\operatorname{selection\score}t, k)
\end{aligned}
$$

`b_i` 是每个 expert 的 routing bias。训练过程中根据 expert 负载在线更新：

```
if expert i underloaded:
    bi += updaterate
if expert i overloaded:
    bi -= updaterate
```

直觉：

- 用 bias 影响 token 选择，让冷门 experts 更容易被选。

- 不把 balancing pressure 直接加到 language modeling 梯度里。

- 因此叫 auxiliary-loss-free balancing。

但讲义也提醒：这个说法不是完全“无 auxiliary loss”。DeepSeek-V3 仍然有 sequence-wise auxiliary loss 等稳定负载的辅助机制，只是主要 expert-level balancing 不再依赖传统 aux loss。

---

## 6. 稀疏路由怎么训练？

### 6.1 三类解决方案

讲义把训练离散路由的方案分成三类：

| 方案                       | 核心想法                         |
| -------------------------- | -------------------------------- |
| Reinforcement learning     | 把 expert 选择当作离散 action    |
| Stochastic perturbations   | 给 router score 加噪声，鼓励探索 |
| Heuristic balancing losses | 用辅助目标让 expert 使用更均匀   |

现实答案是：大多数强模型主要用第 3 类，再搭配第 2 类的一些技巧。

### 6.2 RL routing：理论上自然，实践中少用

如果把 expert 选择看成一个离散 action：

$$
at = \text{selected expert id},
\qquad
R = \text{language modeling improvement}
$$

那么可以用 REINFORCE：

$$
\nabla \mathbb{E}[R]
= \mathbb{E}\left[(R - b)\nabla \log \pi(a \mid x)\right]
$$

优点：

- 离散选择天然适配 RL。

- 可以直接优化 routing policy。

缺点：

- 梯度方差大。

- 训练复杂度高。

- 和大规模 LM 训练系统耦合困难。

- 实证收益没有大到足以压过复杂度。

所以讲义说：RL 是“正确”的方向之一，但不是现代 LLM MoE 的主流做法。

### 6.3 Stochastic perturbations：给 router 加噪声

Shazeer et al. 2017 的 noisy top-k gating 会给 logits 加噪声：

$$
\begin{aligned}
zi(x) &= x^\top Wg[:, i] + \epsiloni \\
\epsiloni &\sim \mathcal{N}(0, \sigmai(x)^2)
\end{aligned}
$$

然后再 top-k：

$$
S = \operatorname{TopK}(z, k)
$$

作用：

- 让路由探索更多 experts。

- 避免早期训练时某些 experts 过早垄断。

- 让 experts 对路由边界更鲁棒。

Switch Transformer / Fedus et al. 还讨论了 multiplicative jitter：

$$
x' = x \odot u,
\qquad
u \sim \operatorname{Uniform}(1-\epsilon, 1+\epsilon)
$$

或者对 router 输入/score 做类似扰动。Zoph et al. 后续工作中又移除了一些 jitter，说明这些技巧有用但不是铁律。

### 6.4 Heuristic balancing losses：实践主力

最终大多数模型使用：

$$
L{\text{total}}
= L{\text{lm}} + \lambda L{\text{balance}}
$$

再加上：

```
router fp32
router z-loss
capacity factor
careful initialization
expert/device balancing
```

这不是数学上最优雅的方案，但它可扩展、可实现、可调参，所以成为主流。

---

## 7. MoE 的系统侧：稀疏计算不等于自动更快

### 7.1 MoE forward 的系统流程

一个 MoE layer 在分布式训练中的步骤：

```
1. router 为每个 token 选择 experts
2. 根据 expert id 对 tokens 分组
3. dispatch: 把 token hidden states 发送到 expert 所在 device
4. 每个 device 对本地 experts 做 FFN
5. combine: 把 expert outputs 发回原 token 所在位置
6. 按 gate weights 加权求和
```

其中第 3 和第 5 步通常需要 all-to-all 通信。

```
MoE layer = sparse computation + nontrivial communication
```

### 7.2 Expert parallelism

Expert parallelism 的核心是把 experts 分布到不同 devices：

```
numexperts = 64
numdevices = 8
expertsperdevice = 8
```

每个 token 只发给它选中的 experts：

```
token t -> expert 3 on GPU 0
token t -> expert 41 on GPU 5
```

优点：

- 总专家参数可以随 device 数增长。

- 每个 expert 是普通 FFN，局部计算仍可以用高效 GEMM。

- 和 tensor parallel 不同，MoE 的参数切分更像“按专家切模块”。

缺点：

- all-to-all 通信开销大。

- batch 太小时每个 expert 收到的 tokens 少，GEMM 不够饱满。

- 负载不均会让某些 device 等待最慢 expert。

### 7.3 Sparse matrix multiplication 和 MegaBlocks

朴素实现可能是：

```
for expert in experts:
    tokens = tokensassignedtoexpert[expert]
    output = expert(tokens)
```

问题：

- Python loop 多。

- 每个 expert 的 token 数不同。

- 小矩阵乘太多，GPU 利用率差。

现代 MoE 库会把 tokens 按 expert 分块，使用 grouped GEMM / block-sparse GEMM。讲义提到 MegaBlocks 这类库，它们用更聪明的 sparse matrix multiplication 来减少 padding 和提升吞吐。

直觉：

```
MoE 的理论 FLOPs 可以很低
但真实速度取决于 sparse kernel、分组、通信、负载均衡
```

### 7.4 为什么 capacity 和 batch size 很重要？

如果 batch 太小：

$$
\frac{Tk}{N}\ \text{很小}
$$

每个 expert 只有很少 tokens，矩阵乘变小，硬件效率下降。

如果 capacity factor 太大：

```
padding 多，浪费计算和内存
```

如果 capacity factor 太小：

```
overflow 多，token dropping 多，模型质量受损
```

因此 MoE 的训练 batch、sequence length、num experts、top-k、capacity factor 是一组互相耦合的系统超参数。

### 7.5 通信成本的粗略形式

MoE layer 的通信量和 token hidden states 有关：

$$
\begin{aligned}
\text{dispatch bytes}
&\approx T k d{\text{model}} \cdot \text{bytes\per\element} \\
\text{combine bytes}
&\approx T k d{\text{model}} \cdot \text{bytes\per\element}
\end{aligned}
$$

如果是跨节点 all-to-all，通信可能成为主要瓶颈。DeepSeek-V2/V3 的 device-limited routing、communication balancing 等技巧，就是为了控制 token 被发往太多设备。

---

## 8. Router 稳定性：MoE 训练最容易炸的地方

### 8.1 Router 为什么脆弱？

Router 通常只是一个小线性层：

$$
zt = W{\text{router}}xt,
\qquad
pt = \operatorname{softmax}(zt)
$$

但它控制整个 MoE 层的计算路径。如果 router 出问题，会导致：

- 某些 experts 几乎没有数据。

- 某些 experts overloaded。

- softmax logits 过大，训练不稳定。

- top-k 决策抖动，导致 token assignment 变化剧烈。

### 8.2 Router 使用 fp32

Zoph et al. 2022 / ST-MoE 的一个实用结论：router 相关计算可以单独用 float32。

```
hidden states: bf16 / fp16
router logits and softmax: fp32
expert FFN: bf16 / fp16
```

原因：

- router softmax 对 logit 尺度很敏感。

- fp16 动态范围和精度更容易导致 overflow / underflow。

- router 参数量很小，单独 fp32 的成本不大。

### 8.3 Router z-loss

ST-MoE 中常见的 router z-loss：

$$
Lz
= \beta \frac{1}{T}
\sum{t=1}^{T}
\left(
\log \sum{i=1}^{N}\exp(z{t,i})
\right)^2
$$

其中 `z_{t,i}` 是 token `t` 对 expert `i` 的 router logit。

它惩罚 `logsumexp(z_t)` 过大：

$$
\operatorname{logsumexp}(zt)
= \log \sumi \exp(z{t,i})
$$

直觉：

- softmax 对整体平移不敏感：`softmax(z) = softmax(z + c)`。

- 因此 logits 可以整体漂移到很大，不影响概率，但影响数值稳定性。

- z-loss 把 logit 尺度拉住，避免 router logits 无限制增大。

总 loss：

$$
L{\text{total}}
= L{\text{lm}}
+ \lambda L{\text{balance}}
+ \beta Lz
$$

### 8.4 如果去掉 balancing / z-loss 会怎样？

讲义展示了移除 balancing loss、z-loss 后的 ablation 图。要点不是记住具体曲线，而是记住风险：

| 去掉什么       | 可能结果                                            |
| -------------- | --------------------------------------------------- |
| balancing loss | expert load 不均，训练吞吐下降，部分 experts 学不到 |
| z-loss         | router logits 变大，softmax 不稳定，loss spike      |
| router fp32    | 混合精度下更容易数值异常                            |
| capacity 控制  | overload / dropping / padding 失控                  |

MoE 的稳定训练依赖多个小技巧一起工作。

### 8.5 MoE 的额外随机性

讲义提到一个有趣问题：曾有人猜测 GPT-4 的随机性可能来自 MoE。

MoE 的确可能引入 batch-level 非确定性：

```
某 token 是否 overflow / dropped
取决于同 batch 里其它 tokens 也选择了哪些 experts
```

这意味着：

```
同一个 query，在不同 batch composition 下，可能走到略不同的计算路径
```

不过实际生产系统可以通过固定 batch、避免 dropping、提高 capacity、确定性 kernel 等方式减弱这种影响。不能简单说“MoE 一定导致输出随机”。

---

## 9. Fine-tuning MoE：为什么比 dense 更难？

### 9.1 Sparse MoE 在小数据上更容易过拟合

讲义指出，sparse MoE 在小 fine-tuning 数据上容易过拟合。原因可以从几个角度理解：

| 原因                       | 解释                                                |
| -------------------------- | --------------------------------------------------- |
| 专家路径稀疏               | 每个 expert 只看到部分 tokens，fine-tuning 数据更少 |
| router 会漂移              | 小数据可能让 router 学到偏置分配                    |
| expert specialization 脆弱 | 预训练形成的分工可能被 SFT 破坏                     |
| 参数总量大                 | total params 很大，小数据更容易记忆                 |

Dense 模型 fine-tuning 时，每个 token 更新同一套 MLP；MoE fine-tuning 时，每个 expert 收到的数据更稀疏。

### 9.2 常见缓解办法

| 方法                       | 直觉                                                      |
| -------------------------- | --------------------------------------------------------- |
| 使用更多 SFT 数据          | DeepSeek 方案之一是用大量 SFT 数据，例如讲义提到 1.4M SFT |
| 降低 router 学习率         | 避免路由分布在小数据上剧烈改变                            |
| 冻结 router 或部分 experts | 保留预训练路由结构                                        |
| 只调 dense/shared 部分     | 减少 sparse experts 过拟合                                |
| 保留 balancing loss        | 防止 SFT 时 expert collapse                               |
| 用 LoRA / adapters         | 限制可训练参数，提高稳定性                                |

Zoph et al. 的路线中有“fine-tune non-MoE MLPs”这类处理；DeepSeek 路线更依赖大规模高质量 SFT 数据和训练配方。

### 9.3 SFT / RLHF 阶段要额外监控什么？

MoE fine-tuning 不能只看 validation loss，还要看：

```
expert load histogram
router entropy
token dropping rate
per-expert gradient norm
per-expert token count
device-level load
```

如果 SFT 后某些 experts 几乎不再被用，或者 router entropy 急剧下降，模型可能正在退化为“少数 expert 模型”。

---

## 10. Upcycling：从 dense LM 初始化 MoE

### 10.1 Upcycling 的问题

问题：

```
能不能先训练一个 dense LM，再把它改造成 MoE？
```

这很诱人，因为从零训练 MoE 成本高，而且 dense baseline 通常已经很稳定。

### 10.2 常见 upcycling 做法

假设已有 dense Transformer：

```
Attention layers: Al
Dense FFN layers: Fl
Norm / embeddings: ...
```

把每层 FFN 替换成多个 experts：

$$
Fl
\rightarrow
\{E{l,1}, E{l,2}, \ldots, E{l,N}\}
$$

初始化方式：

$$
E{l,i}
= \operatorname{copy}(Fl) + \epsiloni
$$

或者把 FFN 的 intermediate dimension 拆分成多个小 experts。

其它参数：

```
attention / norm / embeddings 直接继承 dense model
router 新初始化，通常要偏向均衡
```

然后继续预训练：

```
dense checkpoint -> MoE initialization -> continued pretraining
```

### 10.3 Upcycling 的好处和风险

| 方面 | 说明                                        |
| ---- | ------------------------------------------- |
| 好处 | 复用 dense 模型能力，减少从零训练成本       |
| 好处 | MoE 初期不会完全随机，训练更稳定            |
| 风险 | 如果所有 experts 初始完全相同，可能缺少分化 |
| 风险 | router 如果训练不好，会破坏原有 dense 能力  |
| 风险 | upcycled MoE 的最优结构未必等于从零 MoE     |

MiniCPM 和 Qwen MoE 是讲义里提到的 upcycling 成功例子。Qwen MoE 从 Qwen 1.8B 初始化，使用 top-k=4、60 routed experts、4 shared experts，结构上接近 DeepSeekMoE 风格。

---

## 11. 近期 MoE 架构对比

讲义里给了一张 recent MoE setup 表。核心字段：

- `Routed`: 可路由 experts 数。

- `Active`: 每个 token 激活多少 routed experts。

- `Shared`: 永远激活的 shared experts 数。

- `Fine-grained ratio`: 单个 expert 相对于普通 FFN 的大小比例。

| Model              | Routed experts | Active routed | Shared experts | Fine-grained ratio |
| ------------------ | -------------- | ------------- | -------------- | ------------------ |
| GShard             | 2048           | 2             | 0              | -                  |
| Switch Transformer | 64             | 1             | 0              | -                  |
| ST-MoE             | 64             | 2             | 0              | -                  |
| Mixtral            | 8              | 2             | 0              | -                  |
| DBRX               | 16             | 4             | 0              | -                  |
| Grok               | 8              | 2             | 0              | -                  |
| DeepSeek v1        | 64             | 6             | 2              | 1/4                |
| Qwen 1.5 MoE       | 60             | 4             | 4              | 1/8                |
| DeepSeek v3        | 256            | 8             | 1              | 1/14               |
| OLMoE              | 64             | 8             | 0              | 1/8                |
| MiniMax            | 32             | 2             | 0              | about 1/4          |
| Llama 4 Maverick   | 128            | 1             | 1              | 1/2                |

趋势：

```
早期：少量较大 experts，top-1 / top-2
近期：更多细粒度 experts，top-k 更大，常加 shared experts
```

但这不是单调定律。不同团队在数据、硬件、训练代码、推理目标上权衡不同。

---

## 12. DeepSeek MoE v1-v2-v3 线索

讲义最后用 DeepSeek 系列串起现代 MoE 的演化。

### 12.1 DeepSeekMoE v1

讲义给出的 v1 概要：

```
Total params: 16B
Active params: 2.8B
Shared experts: 2
Fine-grained routed experts: 64, ratio 1/4
Active routed experts: 6
Routing: standard top-k
Balancing: expert-level + device-level aux loss
```

关键思想：

- shared experts 捕捉通用知识。

- fine-grained routed experts 提供更细的组合空间。

- per-expert 和 per-device balancing 同时考虑模型质量和系统效率。

### 12.2 DeepSeek-V2

讲义给出的 v2 概要：

```
Total params: 236B
Active params: 21B
Shared experts: 2
Fine-grained routed experts: 160, ratio 1/10
Active routed experts: 6
```

新增重点：

| 技巧                         | 作用                                             |
| ---------------------------- | ------------------------------------------------ |
| Top-M device routing         | 限制每个 token 访问的 expert-parallel devices 数 |
| Communication balancing loss | 平衡不同 device 的通信输入和输出                 |
| MLA                          | 降低 KV cache 成本，为长上下文和推理效率服务     |

Top-M device routing 的直觉：

```
不要让一个 token 的 top-k experts 分散到太多设备
减少 all-to-all fanout
```

这会牺牲一点路由自由度，换取更可控的通信。

### 12.3 DeepSeek-V3

讲义给出的 v3 概要：

```
Total params: 671B
Active params: 37B
Shared experts: 1
Routed experts: 256
Active routed experts: 8
```

新增重点：

| 技巧                    | 作用                            |
| ----------------------- | ------------------------------- |
| Sigmoid + TopK routing  | expert score 更独立，便于选择   |
| Aux-loss-free balancing | 用 per-expert bias 在线调整负载 |
| Sequence-wise aux loss  | 仍保留局部负载稳定机制          |
| MLA                     | 压缩 KV cache                   |
| MTP                     | 多 token 预测训练信号           |

DeepSeek-V3 的经验说明：现代顶级 MoE 不是单个技巧，而是一整套系统：

| 组成                   | 作用                                            |
| ---------------------- | ----------------------------------------------- |
| MoE architecture       | 扩展 total parameters，保持 active compute 可控 |
| routing / balancing    | 决定 token 使用哪些 experts，并维持负载         |
| expert parallelism     | 把 experts 分布到多设备                         |
| MLA                    | 降低推理 KV cache 压力                          |
| stability tricks       | 稳定 router、softmax 和长训过程                 |
| data + SFT/RL pipeline | 把预训练能力转成可用模型能力                    |

---

## 13. Bonus：MLA 与 MTP

这部分不是 MoE 的核心定义，但讲义把它作为 DeepSeek-V3 的补充。

### 13.1 MLA：Multi-head Latent Attention

标准 attention 需要缓存每层每个 token 的 K/V：

$$
\text{KV cache size}
\approx
n{\text{layers}}
\cdot L
\cdot n{\text{kv heads}}
\cdot d{\text{head}}
\cdot 2
$$

长上下文推理时，KV cache 会成为显存和带宽瓶颈。

MLA 的基本想法：

| 步骤 | 含义                                               |
| ---- | -------------------------------------------------- |
| 压缩 | 不直接缓存完整 K/V，而是先得到低维 latent ⁍        |
| 缓存 | 推理时主要缓存 ⁍                                   |
| 重构 | 需要 attention 计算时，从 latent 生成 K/V 相关表示 |

形式上：

$$
\begin{aligned}
ct^{KV} &= ht W^{DKV} \\
kt^C &= ct^{KV} W^{UK} \\
vt^C &= ct^{KV} W^{UV}
\end{aligned}
$$

缓存的是：

$$
ct^{KV}
$$

而不是完整：

$$
kt,\ vt
$$

如果没有 RoPE，attention score 可以重写：

$$
\begin{aligned}
qi^\top kt
&= (hi W^Q)^\top (ct^{KV} W^{UK}) \\
&= (hi W^Q W^{UK})^\top ct^{KV}
\end{aligned}
$$

也就是说，`W^{UK}` 可以吸收到 query projection 里，推理时只需要缓存 latent。

### 13.2 RoPE 和 MLA 的冲突

RoPE 会对 Q/K 做位置相关旋转：

$$
\operatorname{score}(i,t)
= (Ri qi)^\top (Rt kt)
$$

旋转矩阵依赖位置 `i` 和 `t`，因此不能简单把 `W^{UK}` 合并进 query projection：

$$
Ri W^Q W^{UK} Rt
$$

这里的 `R_t` 和 key token 位置有关，破坏了“只缓存 latent 就够”的简单合并。

DeepSeek 的解决思路是解耦一部分 RoPE key dimensions：

| 部分                       | 作用                          |
| -------------------------- | ----------------------------- |
| compressed latent part     | 存大部分 K/V 信息，减少 cache |
| small non-latent RoPE part | 保留可旋转的位置相关 key 信息 |

这样既保留 RoPE 的相对位置能力，又能压缩大部分 KV cache。

### 13.3 MTP：Multi-token Prediction

标准 LM 训练是预测下一个 token：

$$
p(x{t+1} \mid x{\le t})
$$

MTP 想增加多个未来 token 的训练信号：

$$
p(x{t+1} \mid x{\le t}),\quad
p(x{t+2} \mid x{\le t}),\quad
p(x{t+3} \mid x{\le t}),\quad
\ldots
$$

讲义说 DeepSeek-V3 只做 one-token-ahead 的 MTP module，也就是有轻量模块辅助预测未来 token。相关思路也和 EAGLE 等 speculative decoding / draft model 方法有联系。

直觉：

- 给隐藏状态更多未来预测压力。

- 可能帮助模型学习更强的中间表征。

- 也可能服务于推理加速或 speculative decoding 生态。

但 MTP 不是 MoE 的必要组成部分，它是 DeepSeek-V3 整体系统中的额外训练技巧。

---

## 14. 从零实现 MoE 时的最小清单

### 14.1 最小 PyTorch 结构

一个教学版 MoE layer 至少需要：

```
router: Linear(dmodel, numexperts)
experts: ModuleList([FFN(dmodel, dffexpert) for  in range(numexperts)])
topk: int
```

forward 逻辑：

```
input: x, shape [batch, seq, dmodel]
tokens = flatten(x)  # [T, dmodel]

logits = router(tokens)       # [T, N]
scores = softmax(logits)      # [T, N]
topscores, topids = topk(scores, k)
topweights = normalize(topscores)

for expertid in range(N):
    tokenindices = where(topids contains expertid)
    expertinput = tokens[tokenindices]
    expertoutput = expertsexpertid
    scatteradd weighted expertoutput back to output[tokenindices]

output = unflatten(output)
```

教学实现可以先不做 capacity 和分布式，把所有 experts 放在同一张 GPU 上。真实大规模训练必须做 dispatch/combine 和 expert parallelism。

### 14.2 必须记录的 metrics

MoE 训练时建议每步或每隔几步记录：

```
lmloss
auxbalanceloss
routerzloss
tokensperexpert
expertcapacityusage
overflow / dropped token rate
router entropy
mean / max router logits
per-device token load
```

如果只看 LM loss，很难定位 MoE 的问题。很多 MoE bug 表现为“loss 还在降，但系统效率很差”或“短期正常，长训后 expert collapse”。

### 14.3 初始化建议

保守做法：

| 模块                          | 建议                                  |
| ----------------------------- | ------------------------------------- |
| experts                       | 和 dense FFN 相同初始化               |
| router weights                | 小尺度初始化，避免早期过度自信        |
| router bias                   | 初始接近 0，或者按 balancing 策略设置 |
| shared experts                | 如果使用，保持和普通 FFN 同尺度       |
| z-loss / aux loss coefficient | 从论文常用小值开始调                  |

MoE 初期最怕 router 过早把 token 集中到少数 experts。早期训练的探索和均衡很重要。

### 14.4 实现中容易踩的坑

| 坑                             | 现象                                |
| ------------------------------ | ----------------------------------- |
| top-k 后没有正确 scatter_add   | 多 expert 输出覆盖而不是相加        |
| gate weights 没归一化          | 输出尺度随 k 改变                   |
| expert token 顺序没还原        | loss 爆炸或模型学不到               |
| capacity overflow 静默丢 token | 质量下降但不容易发现                |
| router 用 fp16                 | logits 不稳定                       |
| balancing loss 系数太大        | router 被均衡目标主导，语义路由变差 |
| balancing loss 系数太小        | expert collapse                     |
| batch 太小                     | 每个 expert token 太少，吞吐很差    |

---

## 15. Dense FFN 与 MoE FFN 的 FLOPs / 参数直觉

### 15.1 Dense FFN 参数量

以普通 FFN 为例：

$$
\operatorname{FFN}(x)
= W{\text{down}}\operatorname{activation}(W{\text{up}}x)
$$

$$
W{\text{up}} \in \mathbb{R}^{d{\text{model}} \times d{\text{ff}}},
\qquad
W{\text{down}} \in \mathbb{R}^{d{\text{ff}} \times d{\text{model}}}
$$

参数量约：

$$
\operatorname{params}{\text{dense FFN}}
\approx 2 d{\text{model}} d{\text{ff}}
$$

SwiGLU 有三组矩阵：

$$
\begin{aligned}
W{\text{gate}} &\in \mathbb{R}^{d{\text{model}} \times d{\text{ff}}} \\
W{\text{up}} &\in \mathbb{R}^{d{\text{model}} \times d{\text{ff}}} \\
W{\text{down}} &\in \mathbb{R}^{d{\text{ff}} \times d{\text{model}}}
\end{aligned}
$$

参数量约：

$$
\operatorname{params}{\text{SwiGLU FFN}}
\approx 3 d{\text{model}} d{\text{ff}}
$$

### 15.2 MoE FFN 参数量

如果有 `N` 个同尺寸 experts：

$$
\operatorname{params}{\text{MoE experts}}
\approx
N \cdot \operatorname{params}{\text{single expert}}
$$

但每个 token 只激活 `k` 个：

$$
\operatorname{active\params}{\text{per token}}
\approx
k \cdot \operatorname{params}{\text{single expert}}
+ \operatorname{shared\params}
$$

如果 expert 是 fine-grained，单个 expert 宽度缩小为 `d_ff / r`：

$$
\operatorname{params}{\text{single expert}}
\approx
\frac{\operatorname{params}{\text{dense FFN}}}{r}
$$

$$
\operatorname{active\expert\params}
\approx
\frac{k}{r}
\operatorname{params}{\text{dense FFN}}
$$

例如：

$$
r = 8,\quad k = 8
\quad\Longrightarrow\quad
\operatorname{active\expert\params}
\approx
1 \cdot \operatorname{params}{\text{dense FFN}}
$$

$$
\operatorname{total\expert\params}
\approx
\frac{N}{8}
\operatorname{params}{\text{dense FFN}}
$$

这解释了为什么 OLMoE / DeepSeek 这类模型可以激活多个 fine-grained experts，同时保持 active compute 接近 dense FFN。

### 15.3 FLOPs 不是全部

理论上：

$$
\operatorname{MoE\ active\ FLOPs}
\approx
\frac{k}{r}
\operatorname{dense\ FFN\ FLOPs}
$$

但真实 runtime 还取决于：

| 因素                           | 为什么重要                           |
| ------------------------------ | ------------------------------------ |
| all-to-all communication       | 跨设备 dispatch/combine 可能成为瓶颈 |
| expert load balance            | 不均衡会导致 straggler               |
| grouped GEMM efficiency        | expert token 数太少会降低 GPU 利用率 |
| padding / capacity waste       | capacity 过大时会浪费计算            |
| kernel fusion                  | 决定实际 wall-clock 效率             |
| batch size and sequence length | 决定每个 expert 的 token 粒度        |

所以 MoE 的性能判断要同时看：

| 维度                 | 要看什么                  |
| -------------------- | ------------------------- |
| model quality        | loss、benchmark、下游能力 |
| training FLOPs       | 理论训练计算量            |
| wall-clock time      | 实际训练时间              |
| hardware utilization | GPU/网络利用率            |
| inference latency    | serving 时延              |
| serving memory       | 权重和 KV cache 常驻成本  |

---

## 16. 常见误区

### 16.1 “MoE 参数多，所以一定更慢”

不一定。MoE 的 total params 多，但每个 token 的 active params 小。

$$
\text{serving memory: 加载很多 experts}
\qquad
\text{per-token compute: 只算少数 experts}
$$

因此 MoE 可能在显存/参数存储上更贵，但在达到相同质量所需 compute 上更便宜。

### 16.2 “专家会自动学成可解释模块”

不一定。experts 可能出现某种 specialization，但不保证人类可解释。

常见误解：

| 过度简化的说法  | 问题                                     |
| --------------- | ---------------------------------------- |
| expert 0 = 数学 | expert 分工不一定按人类标签切分          |
| expert 1 = 中文 | 语言、领域、频率、位置等因素可能混在一起 |
| expert 2 = 代码 | 专家 specialization 不保证稳定可解释     |

现实里专家分工可能和 token frequency、position、syntax、domain、训练动态、硬件 balancing 混在一起。

### 16.3 “Load balancing loss 越强越好”

不是。过强的 balancing 会强迫 router 均匀使用 experts，削弱语义选择。

理想状态：

$$
\text{足够均衡}
\quad\text{但不要均衡到 router 不能表达 token-expert preference}
$$

### 16.4 “MoE 只影响训练，不影响推理”

MoE 对推理也有很大影响：

- 需要加载 total experts 参数。

- batch 内 token routing 影响 expert batching。

- all-to-all / expert dispatch 影响 latency。

- top-k 越大，推理通信越复杂。

- KV cache 问题仍然存在，所以 DeepSeek-V3 还需要 MLA。

### 16.5 “Sparse 等于省内存”

MoE 省的是每 token active compute，不一定省模型权重内存。

$$
\text{权重内存} \approx \text{total params},
\qquad
\text{计算量} \approx \text{active params}
$$

如果 serving 时所有 experts 都要常驻显存，MoE 的显存压力可能比同 active 参数量的 dense 模型更大。

---

## 17. 复习问题

1. MoE 为什么可以在不显著增加 per-token FLOPs 的情况下增加 total params？

1. 为什么大多数 MoE 替换 FFN，而不是替换 attention？

1. token-choice top-k routing 的公式是什么？

1. `TopK` 为什么不可微？实际训练如何绕过这个问题？

1. Switch Transformer 的 load balancing loss 怎么定义？`f_i` 和 `P_i` 分别代表什么？

1. capacity factor 太大和太小分别有什么问题？

1. router z-loss 的公式是什么？它为什么能提升稳定性？

1. expert-level balancing 和 device-level balancing 有什么区别？

1. 为什么 MoE 在 fine-tuning 小数据上容易过拟合？

1. upcycling dense LM 到 MoE 的基本步骤是什么？

1. shared experts 和 routed experts 的区别是什么？

1. fine-grained experts 为什么能增加组合能力？

1. expert parallelism 的 all-to-all 通信发生在哪两个阶段？

1. DeepSeek-V3 的 auxiliary-loss-free balancing 大概怎么工作？

1. MLA 为什么能减少 KV cache？RoPE 为什么会让 MLA 更复杂？

---

## 18. 一句话总复习

MoE 的核心是用 router 为每个 token 选择少数 FFN experts，从而把 total parameters 做大、active FLOPs 保持可控；真正困难的地方不在“放很多 experts”，而在路由、负载均衡、数值稳定、all-to-all 系统效率，以及 fine-tuning 时如何不破坏稀疏专家分工。
