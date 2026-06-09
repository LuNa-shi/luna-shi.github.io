---
title: 'CS336: Lecture 3 - LM Architecture and Hyperparameters'
date: '2026-05-22'
overview: >-
  TLDR: LM architecture is a stack of trade-offs across normalization, activations, attention, positional encoding,
  hyperparameters, stability, and inference cost.
description: >-
  TLDR: LM architecture is a stack of trade-offs across normalization, activations, attention, positional encoding,
  hyperparameters, stability, and inference cost.
tags:
  - cs336
categories:
  - learning
  - systems
math: true
toc: true
relatedPosts: true
---

<!-- notion-sync: 3644e07a-a023-80ef-b7a9-c6ee7bad8040 parent=CS336 url=https://app.notion.com/p/3644e07aa02380efb7a9c6ee7bad8040 -->

> 来源：Stanford CS336 Spring 2025 Lecture 3 官方讲义。主题是现代语言模型架构选择、超参数经验、训练稳定性技巧，以及推理时注意力结构的效率权衡。
>
> 课程页：http://cs336.stanford.edu/spring2025/
>
> 官方 PDF：https://github.com/stanford-cs336/spring2025-lectures/blob/e9cb2488fdb53ea37f0e38924ec3a1701925cef3/nonexecutable/2025%20Lecture%203%20-%20architecture.pdf

## 0. 本讲主线

| 层级               | 内容                                               | 复习时要抓住什么                             |
| ------------------ | -------------------------------------------------- | -------------------------------------------- |
| Motivation         | 从“标准 Transformer”出发看现代 LLM                 | 架构选择不是唯一真理，而是经验累积           |
| Core block         | pre-norm、RMSNorm、去 bias、SwiGLU、parallel block | 现代模型越来越接近 LLaMA-like 配方           |
| Position           | sine、absolute、relative、RoPE                     | RoPE 把位置信息放进 Q/K 的旋转里             |
| Hyperparameters    | `d_ff / d_model`、head dim、深宽比、vocab size     | 很多大模型的默认值惊人一致                   |
| Regularization     | dropout、weight decay                              | 预训练里的正则更多影响优化动态               |
| Stability          | z-loss、QK norm、logit soft-capping                | softmax 是稳定性风险高发区                   |
| Attention variants | MQA、GQA、sliding window、full/local interleaving  | 训练看 FLOPs，推理常被 KV cache 内存带宽限制 |

本讲核心观点：

- 最好的学习方式是亲手训练模型；第二好的方式是系统学习别人踩过的坑。

- 现代 LLM 的架构细节很多，但共识并不总是很强；pre-norm 是少数高度一致的选择。

- 不要把论文里的小改动都当成“必然更好”。很多选择来自工程、硬件、稳定性、推理成本，而不只是 validation loss。

- 如果从零实现一个强 baseline，保守选择通常是：pre-norm + RMSNorm + RoPE + SwiGLU + no bias + 标准 head/dim 比例。

---

## 1. 起点：原始 Transformer vs 现代简单变体

### 1.1 原始 Transformer 的典型选择

原始 Transformer 可以粗略记成：

| 模块               | 原始选择                                  |
| ------------------ | ----------------------------------------- |
| Position embedding | sine / cosine fixed positional embeddings |
| FFN activation     | ReLU                                      |
| Normalization      | post-norm LayerNorm                       |
| Linear layers      | 通常带 bias                               |

post-norm block 的形式大致是：

```
x = LayerNorm(x + Attention(x))
x = LayerNorm(x + MLP(x))
```

这里 LayerNorm 在 residual addition 之后，因此 norm 会直接作用在主 residual stream 上。

### 1.2 CS336 Assignment 1 的现代变体

讲义指出，课程实现的版本更接近现代 LLM：

| 模块               | 现代简单变体                          |
| ------------------ | ------------------------------------- |
| Normalization      | pre-norm                              |
| Position embedding | RoPE                                  |
| FFN activation     | SwiGLU                                |
| Bias terms         | linear layers 和 norm 中通常去掉 bias |

pre-norm block 的形式大致是：

```
x = x + Attention(Norm(x))
x = x + MLP(Norm(x))
```

关键差别：主 residual stream 可以比较直接地跨层传递，LayerNorm 不会每次都“截断”残差路径。

### 1.3 怎么理解架构选择？

讲义的态度非常实用：

- 不要只问“哪个架构理论上最好”，还要问“哪些模型真实用过，效果怎样”。

- 大模型论文里的差异很多，其中一些只是小工程改动。

- 观察主流 dense model release 可以看出趋势：大多数模型越来越接近 LLaMA-like 架构，但仍有不少例外。

---

## 2. Normalization：pre-norm、RMSNorm、double norm

![Notion image](/assets/img/notion/cs336-lecture-3-lm-architecture-01.webp)

右图是pre norm

### 2.1 Pre-norm vs post-norm

几乎所有现代 LLM 都使用 pre-norm。BERT 是 post-norm，OPT 350M 是一个讲义里提到的例外。

| 形式      | 简化公式             | 直觉                                       |
| --------- | -------------------- | ------------------------------------------ |
| post-norm | `x = Norm(x + F(x))` | norm 直接作用在 residual stream 上         |
| pre-norm  | `x = x + F(Norm(x))` | residual stream 更像一条不被破坏的高速通道 |

pre-norm 的优势：

- 梯度传播更稳定。

- 更少出现 gradient spike。

- 对大网络更友好，可以支持更大的 learning rate。

- 早期说法是能减少 warmup 需求；现代语境下更重要的是稳定性。

记忆方式：

```
pre-norm = 先 norm，再进子层，最后加回 residual
post-norm = 先加 residual，再 norm
```

### 2.2 为什么 residual stream 很重要？

Transformer 很深时，residual stream 是跨层传递信息和梯度的主干。如果每层都在 residual addition 后立刻做 norm，主干信号会被反复重标定。

pre-norm 的设计相当于：

```
主路径：x 直接往后走
分支：Norm(x) -> Attention/MLP -> 加回 x
```

这保留了 residual connection 的好处，也让优化更容易。

### 2.3 Double norm

讲义提到一些新模型使用 “double norm” 思路，例如 Grok、Gemma 2；OLMo 2 使用 non-residual post norm。

不要把它和传统 post-norm 混为一谈。传统 post-norm 是把 norm 放在 residual addition 后并影响主残差流；double norm 更像是在 pre-norm 的基础上额外加一个块外规范化，用来改善稳定性，但尽量不破坏 residual stream 的主路径。

可以把它理解成：

```
x = x + F(Norm(x))
x = ExtraNorm(x)   # 某些模型会在块外再做一次 norm
```

实际实现取决于具体模型。

---

## 3. LayerNorm vs RMSNorm

![Notion image](/assets/img/notion/cs336-lecture-3-lm-architecture-02.webp)

### 3.1 LayerNorm

LayerNorm 在 `d_model` 维度上做均值和方差归一化：

```
LayerNorm(x) = (x - mean(x)) / sqrt(var(x) + eps)  gamma + beta
```

特点：

- 会减去均值。

- 会除以标准差。

- 通常有可学习参数 `gamma` 和 `beta`。

- 原始 Transformer、GPT-1/2/3、OPT、GPT-J、BLOOM 等模型使用过 LayerNorm。

### 3.2 RMSNorm

RMSNorm 不减均值，只按 root mean square 缩放：

```
RMSNorm(x) = x / sqrt(mean(x^2) + eps)  gamma
```

特点：

- 不计算 mean。

- 通常没有 bias 项。

- 参数更少，数据移动更少。

- LLaMA family、PaLM、Chinchilla、T5 等模型使用 RMSNorm。

### 3.3 为什么 RMSNorm 会更快？

表面解释：

- 少一次 mean 计算。

- 少一个 bias 参数。

- 操作更简单。

更重要的解释：

- FLOPs 不等于 runtime。

- Norm 层相比大矩阵乘法 FLOPs 很小，但它们会读写大量 activation。

- 这类操作常常受 memory bandwidth / data movement 限制。

- RMSNorm 减少数据移动和中间计算，因此 wall-clock time 可能有明显收益。

讲义强调的观念：

```
不要只数 FLOPs。很多真实速度瓶颈来自内存访问、kernel launch、数据搬运和融合程度。
```

### 3.4 小结

| 选择        | 现代经验                     |
| ----------- | ---------------------------- |
| pre-norm    | 几乎所有现代 LLM 的默认      |
| RMSNorm     | 常见，速度更好，效果通常不差 |
| no bias     | 常见，参数和内存移动更少     |
| double norm | 一些新模型使用，用于稳定性   |

---

## 4. 去掉 bias terms

现代 Transformer 往往会去掉 linear layer 和 norm 中的 bias。

非 gated FFN 常见写法：

```
FFN(x) = activation(x W1) W2
```

而不是：

```
FFN(x) = activation(x W1 + b1) W2 + b2
```

原因：

- bias 的参数量相对小，但每层都要读写，仍有 memory movement 成本。

- 对最终效果通常不是关键。

- 去掉 bias 可以简化实现，也可能改善优化稳定性。

注意：这里不是说 bias 的 FLOPs 很大，而是说现代大模型里许多“看似小”的参数和操作都可能在真实系统里带来额外的数据移动成本。

---

## 5. FFN 与 activation：ReLU、GELU、SwiGLU

### 5.1 标准 FFN

Transformer block 里的 MLP/FFN 通常是：

```
x -> Linear(dmodel, dff) -> activation -> Linear(dff, dmodel)
```

在语言模型中，FFN 往往占大量参数和计算，因此 activation 选择会影响模型质量和效率。

### 5.2 常见 activation

| Activation | 公式                               | 代表模型                                          |
| ---------- | ---------------------------------- | ------------------------------------------------- |
| ReLU       | `max(0, x)`                        | Original Transformer、T5、Gopher、Chinchilla、OPT |
| GELU       | `x * Phi(x)`                       | GPT-1/2/3、GPT-J、GPT-NeoX、BLOOM                 |
| Swish      | `x * sigmoid(x)`                   | 常作为 SwiGLU 的组成部分                          |
| GLU family | activation branch 乘以 gate branch | LLaMA、PaLM、Mistral、OLMo、很多 2023 后模型      |

GELU 中的 `Phi(x)` 是标准正态分布的 CDF。直觉上，GELU 是比 ReLU 更平滑的门控。

### 5.3 GLU family 的核心思想

普通 ReLU FFN：

```
FFNReLU(x) = ReLU(x W1) W2
```

GLU 会额外引入一个 gate branch：

```
FFNReGLU(x) = (ReLU(x W1)  (x V)) W2
```

其中 `*` 是 elementwise multiplication，`V` 是额外的投影矩阵。

类似地：

```
FFNGeGLU(x) = (GELU(x W1)  (x V)) W2
FFNSwiGLU(x) = (Swish(x W1)  (x V)) W2
```

直觉：

- 一条分支产生候选特征。

- 另一条分支决定每个维度应该开多大。

- 这种动态门控通常比单纯 activation 更表达性强。

### 5.4 为什么 GLU 的 `d_ff` 常缩小到 2/3？

GLU 多了一个上投影矩阵，所以如果 `d_ff` 不变，参数量会增加。

非 gated FFN，若 `d_ff = 4 d_model`：

```
W1: dmodel x 4dmodel
W2: 4dmodel x dmodel
total ≈ 8 dmodel^2
```

GLU FFN 有两个上投影和一个下投影：

```
W1: dmodel x dff
V : dmodel x dff
W2: dff x dmodel
total ≈ 3 dmodel dff
```

令总参数量接近 `8 d_model^2`：

```
3 dmodel dff ≈ 8 dmodel^2
dff ≈ 8/3 dmodel
```

所以现代 SwiGLU/GeGLU 模型常见：

```
dff ≈ 2.66 dmodel
```

### 5.5 GLU 是否真的有效？

讲义结论：

- GLU 不是训练好模型的必要条件，例如 GPT-3 没有用 GLU。

- 但实验和后续模型经验显示，SwiGLU / GeGLU 往往有稳定的小收益。

- 2023 年后的模型大多偏向 SwiGLU。

例外：

- Nemotron 340B 使用 Squared ReLU。

- Falcon 2 11B 使用 ReLU。

---

## 6. Serial vs Parallel Transformer blocks

### 6.1 Serial block

常规 Transformer block 是串行的：

```
x1 = x + Attention(Norm(x))
y  = x1 + MLP(Norm(x1))
```

即 attention 先执行，MLP 再基于 attention 后的结果执行。

### 6.2 Parallel block

parallel block 会并行计算 attention 和 MLP：

```
y = x + Attention(Norm(x)) + MLP(Norm(x))
```

潜在好处：

- Attention 和 MLP 可以共享 LayerNorm/RMSNorm。

- 某些矩阵乘法可以融合。

- 计算图更适合并行和优化。

使用过 parallel layers 的模型包括 GPT-J、PaLM、GPT-NeoX，近期还有 Cohere Command A、Falcon 2 11B、Command R+。

讲义态度：

- 没有非常彻底的 ablation 证明它一定更好。

- 但它有明确的 compute / implementation 方面收益。

---

## 7. 架构部分总结

| 问题                       | 现代默认答案       | 备注                        |
| -------------------------- | ------------------ | --------------------------- |
| pre-norm 还是 post-norm    | pre-norm           | 几乎所有现代 LLM 选择       |
| LayerNorm 还是 RMSNorm     | RMSNorm 越来越常见 | 更少数据移动，效果通常不差  |
| FFN activation             | SwiGLU / GeGLU     | ReLU/GELU 仍可工作          |
| bias terms                 | 通常去掉           | 简化参数和数据移动          |
| serial 还是 parallel block | 两者都存在         | parallel 有潜在 compute win |

一个保守强 baseline：

```
pre-norm + RMSNorm + RoPE + SwiGLU + no bias
```

---

## 8. Position embeddings

### 8.1 为什么需要位置编码？

Self-attention 本身对 token 顺序没有天然感知。如果只看 token embeddings，模型不知道某个词出现在第 1 个位置还是第 100 个位置。

位置编码要解决：

```
同样的 token 在不同位置应该有不同的表示。
attention 应该能知道 token 之间的相对距离。
```

### 8.2 几类位置编码

| 类型                        | 形式                                | 代表模型                            |
| --------------------------- | ----------------------------------- | ----------------------------------- |
| Sine embeddings             | `Embed(x, i) = v_x + PE_i`          | Original Transformer                |
| Learned absolute embeddings | `Embed(x, i) = v_x + u_i`           | GPT-1/2/3、OPT                      |
| Relative embeddings         | 在 attention 计算里加入相对位置信息 | T5、Gopher、Chinchilla              |
| RoPE                        | 对 query/key 做按位置变化的旋转     | GPT-J、PaLM、LLaMA、很多 2024+ 模型 |

### 8.3 RoPE 的目标

RoPE 希望 attention 的位置依赖只与相对位置有关。

理想目标：

```
<f(x, i), f(y, j)> = g(x, y, i - j)
```

意思是：

- `x` 在位置 `i` 的表示和 `y` 在位置 `j` 的表示做内积。

- 这个内积应该只依赖 token 内容和相对位置 `i - j`。

- 不应该依赖绝对位置 `i` 和 `j` 本身。

### 8.4 为什么普通 additive position embedding 不完全满足？

sine 或 absolute embedding 通常是：

```
Embed(x, i) = vx + pi
```

那么两个 token 的内积会展开成：

```
<vx + pi, vy + pj>
= <vx, vy> + <vx, pj> + <pi, vy> + <pi, pj>
```

问题：

- 出现了 token 内容和绝对位置的 cross terms。

- 这些项不一定只依赖 `i - j`。

- absolute learned embeddings 更明显依赖绝对位置。

### 8.5 RoPE 的核心技巧：旋转

内积对共同旋转不变：

```
<R a, R b> = <a, b>
```

RoPE 利用这个性质，让每个位置对应一个旋转矩阵。对 query 和 key 分别按各自位置旋转：

```
qi = Ri q
kj = Rj k
attention score = <Ri q, Rj k>
```

由于旋转矩阵有组合性质：

```
Ri^T Rj = R{j - i}
```

所以：

```
<Ri q, Rj k> = q^T R{j - i} k
```

这就让 attention score 自然依赖相对位置。

### 8.6 RoPE 怎么实现？

RoPE 通常把 head dimension 中的坐标两两配对，每一对做 2D 旋转。可以把每一对维度看成一个复数的实部和虚部。

对一对坐标：

```
[x1, x2] -> [x1 cos(theta) - x2 sin(theta),
             x1 sin(theta) + x2 cos(theta)]
```

不同维度对使用不同频率，不同位置使用不同角度。

实现流程：

1. 输入经过线性层得到 `q`、`k`、`v`。

1. 根据 position index 和 head dimension 生成 `cos` / `sin`。

1. 对 `q` 和 `k` 应用 RoPE 旋转。

1. 用旋转后的 `q`、`k` 做标准 attention：

```
Attention(Q, K, V) = softmax(Q K^T / sqrt(dhead)) V
```

重要区别：

- sine embedding 是加到 token embedding 上。

- RoPE 是乘法式旋转，作用在每一层 attention 的 query/key 上。

- RoPE 不直接旋转 value。

---

## 9. Hyperparameter 1：`d_ff / d_model`

### 9.1 默认规则

非 gated FFN 的经典经验：

```
dff = 4 dmodel
```

这个规则在很多模型中都成立。

GLU 变体的常见经验：

```
dff = 8/3 dmodel ≈ 2.66 dmodel
```

原因是 GLU 多一个 gate projection，把 `d_ff` 缩到 2/3 后，整体参数量接近非 gated 的 `4 d_model` FFN。

### 9.2 GLU 模型中的实际比例

| Model        | `d_ff / d_model` |
| ------------ | ---------------- |
| PaLM         | 4                |
| Mistral 7B   | 3.5              |
| LLaMA-2 70B  | 3.5              |
| LLaMA 70B    | 2.68             |
| Qwen 14B     | 2.67             |
| DeepSeek 67B | 2.68             |
| Yi 34B       | 2.85             |
| T5 v1.1      | 2.5              |

讲义结论：

- 大多数模型大致落在 `2.5` 到 `4` 之间。

- `8/3` 是很常见的保守默认值。

### 9.3 T5 的极端例外

T5 11B 使用了非常激进的设置：

```
dff = 65,536
dmodel = 1,024
dff / dmodel = 64
```

这说明：

- `d_ff = 4 d_model` 不是数学定律。

- 极端设置也可能训练出可用模型。

- 但 T5 v1.1 后来改成更标准的 GeGLU + 2.5 倍，因此 64 倍大概率不是最优选择。

### 9.4 经验解释

Kaplan 等工作显示，`d_ff / d_model` 在 `1` 到 `10` 之间存在比较宽的 near-optimal basin。

实践建议：

```
如果没有强理由：
非 gated FFN 选 4d
SwiGLU / GeGLU 选 8/3 d
```

---

## 10. Hyperparameter 2：head dim、num heads、model dim

### 10.1 常见关系

最常见的设置是：

```
numheads  headdim = dmodel
```

但这不是必须的。可以让所有 head 的维度总和大于 `d_model`，例如某些 Google 系模型。

### 10.2 例子

| Model   | Num heads | Head dim | Model dim | Ratio |
| ------- | --------- | -------- | --------- | ----- |
| GPT-3   | 96        | 128      | 12288     | 1     |
| T5      | 128       | 128      | 1024      | 16    |
| T5 v1.1 | 64        | 64       | 4096      | 1     |
| LaMDA   | 128       | 128      | 8192      | 2     |
| PaLM    | 48        | 258      | 18432     | 1.48  |
| LLaMA-2 | 64        | 128      | 8192      | 1     |

这里的 ratio 是：

```
ratio = numheads  headdim / dmodel
```

### 10.3 该怎么选？

经验：

- 多数现代模型 ratio 接近 `1`。

- T5、LaMDA、PaLM 是明显例外。

- 论文中有人担心 `ratio = 1` 会造成 low-rank bottleneck，但实践中没有看到特别严重的问题。

实践建议：

```
从 ratio = 1 开始。
常见 headdim 是 64 或 128。
除非有明确实验或系统需求，不要先把 attention projection 做得很特殊。
```

---

## 11. Hyperparameter 3：深度 vs 宽度，也就是 aspect ratio

### 11.1 问题

给定参数预算时，模型应该：

- 更深：更多 layers。

- 更宽：更大的 `d_model`。

讲义用一个粗略指标看主流模型：

```
aspect ratio = dmodel / nlayers
```

### 11.2 主流模型范围

| Model                        | `d_model / n_layers` |
| ---------------------------- | -------------------- |
| BLOOM                        | 205                  |
| T5 v1.1                      | 171                  |
| PaLM 540B                    | 156                  |
| GPT-3 / OPT / Mistral / Qwen | 128                  |
| LLaMA / LLaMA-2 / Chinchilla | 102                  |
| T5 11B                       | 43                   |
| GPT-2                        | 33                   |

讲义观察：

- 很多现代模型集中在 `100` 到 `200` 左右。

- 不是所有模型都在这个范围内，但这个范围很常见。

### 11.3 系统因素很重要

极深模型的问题：

- 更难并行化。

- 延迟更高，因为层必须按顺序执行。

- pipeline parallelism、activation checkpointing、通信调度都会更复杂。

极宽模型的问题：

- 单层矩阵更大。

- 激活和参数内存更高。

- tensor parallelism 压力更大。

实践建议：

```
模型深宽比不是纯算法问题。
在质量相近时，系统吞吐、延迟、并行策略会决定最终选择。
```

---

## 12. Hyperparameter 4：vocabulary size

### 12.1 单语模型

单语模型常见 vocab size：

```
30k - 50k
```

例子：

| Model                | Vocab size |
| -------------------- | ---------- |
| Original Transformer | 37000      |
| GPT                  | 40257      |
| GPT-2 / GPT-3        | 50257      |
| T5 / T5 v1.1         | 32128      |
| LLaMA                | 32000      |

### 12.2 多语和生产系统

多语模型、生产模型常见 vocab size：

```
100k - 250k
```

例子：

| Model     | Vocab size |
| --------- | ---------- |
| mT5       | 250000     |
| PaLM      | 256000     |
| GPT-4     | 100276     |
| Command A | 255000     |
| DeepSeek  | 100000     |
| Qwen 15B  | 152064     |
| Yi        | 64000      |

### 12.3 怎么理解 vocab size？

vocab size 的影响：

- 太小：文本被切得更碎，sequence length 变长，训练和推理更贵。

- 太大：embedding / LM head 参数增加，稀有 token 学习更困难。

- 多语模型需要覆盖更多文字、词形和符号，因此通常需要更大 vocab。

实践建议：

```
英语/单语模型：30k-50k 是常见范围。
多语/生产模型：100k-250k 很常见。
```

---

## 13. Regularization：dropout 与 weight decay

### 13.1 预训练还需要 dropout 吗？

反对使用 dropout 的理由：

- 预训练数据非常大，可能有 trillions of tokens。

- 通常只对语料做一遍或少数几遍训练，不像小数据集那样容易记忆训练集。

- dropout 会降低有效容量，也可能影响吞吐。

但历史上很多模型仍使用 dropout。

### 13.2 实际模型中的选择

| Model                | Dropout | Weight decay |
| -------------------- | ------- | ------------ |
| Original Transformer | 0.1     | 0            |
| GPT-2                | 0.1     | 0.1          |
| T5                   | 0.1     | 0            |
| GPT-3                | 0.1     | 0.1          |
| T5 v1.1              | 0       | 0            |
| PaLM                 | 0       | variable     |
| OPT                  | 0.1     | 0.1          |
| LLaMA                | 0       | 0.1          |
| Qwen 14B             | 0.1     | 0.1          |

趋势：

- 老模型更常使用 dropout。

- 新模型更常把 dropout 设为 0。

- weight decay 仍然常见。

### 13.3 Weight decay 不只是防过拟合

讲义提到 Andriushchenko et al. 2023 的观察：LLM 中 weight decay 的作用不只是控制 overfitting。

它还会影响：

- learning rate schedule。

- 参数范数。

- 优化轨迹。

- 训练稳定性。

特别是在 cosine learning rate schedule 下，weight decay 和学习率动态会发生交互。

实践建议：

```
大规模预训练：dropout 可以从 0 开始。
weight decay 常作为优化动态的一部分保留，例如 0.1。
```

---

## 14. Hyperparameters 总结

| 问题                             | 常见默认值                       | 讲义态度                   |
| -------------------------------- | -------------------------------- | -------------------------- |
| `d_ff / d_model`                 | 非 gated: `4`; GLU: `8/3`        | 有证据支持，但不是铁律     |
| `num_heads * head_dim / d_model` | `1`                              | 主流默认，验证证据不算强   |
| 深宽比 `d_model / n_layers`      | `100-200` 常见                   | 系统因素很关键             |
| vocab size                       | 单语 `30k-50k`，多语 `100k-250k` | 取决于语言覆盖和 tokenizer |
| dropout                          | 新模型常为 `0`                   | 数据足够大时不一定需要     |
| weight decay                     | 常见 `0.1`                       | 更多影响优化动态           |

---

## 15. Stability tricks：稳定训练的几个小技巧

### 15.1 稳定性问题常出现在哪里？

讲义特别提醒：

```
Beware of softmaxes.
```

softmax 涉及：

- exponentials。

- normalization by sum。

- logits 过大时可能导致数值不稳定。

- attention 和 output distribution 都依赖 softmax。

所以稳定性技巧经常围绕两个地方：

- output softmax。

- attention softmax。

### 15.2 Output softmax 的 z-loss

语言模型输出 softmax：

```
p(y | x) = exp(logity) / sumj exp(logitj)
```

cross entropy 中的 log normalizer：

```
log Z = log sumj exp(logitj)
```

z-loss 会惩罚这个 normalizer：

```
zloss = lambda  (log Z)^2
```

作用：

- 防止 logits 整体尺度无限变大。

- 提高 softmax 数值稳定性。

- PaLM 推广了这个技巧。

讲义列出的相关模型包括 PaLM、Baichuan 2、DCLM、OLMo 2。

### 15.3 Attention softmax 的 QK norm

Attention score：

```
score = q k^T / sqrt(dhead)
```

如果 `q` 或 `k` 范数变得很大，进入 softmax 的 score 会变得极端，导致训练不稳定。

QK norm 的做法：

```
q = Norm(q)
k = Norm(k)
score = q k^T / sqrt(dhead)
```

可以使用 LayerNorm 或 RMSNorm。

作用：

- 控制 attention logits 的尺度。

- 减少 softmax 过尖或数值爆炸。

- 在 DCLM、OLMo 2、Gemma 2 等模型中出现。

### 15.4 Logit soft-capping

logit soft-capping 用 `tanh` 把 logits 限制在某个范围内：

```
logits = cap  tanh(logits / cap)
```

作用：

- 防止 logits 爆炸。

- 改善数值稳定性。

风险：

- 如果 cap 太小，可能限制模型表达能力。

- 可能带来性能损失。

### 15.5 稳定性技巧小结

| 技巧               | 作用位置                   | 主要目的                  |
| ------------------ | -------------------------- | ------------------------- |
| z-loss             | output softmax             | 控制输出 logits 尺度      |
| QK norm            | attention softmax          | 控制 attention score 尺度 |
| logit soft-capping | output 或 attention logits | 强制限制 logits 范围      |

实践上，不要一开始就堆满所有 trick。先用稳定 baseline，如果看到 loss spike、logit scale 异常、attention score 爆炸，再有针对性加入。

---

## 16. Attention heads：MQA、GQA 与推理成本

### 16.1 训练时 attention 为什么还可以接受？

全量训练时，整个 sequence 可以并行处理。矩阵乘法规模大，GPU 可以保持较高利用率。

粗略地说：

- attention 中有大矩阵乘法。

- batch 和 sequence 维度可以并行。

- arithmetic intensity 相对更高。

因此训练时的瓶颈常常可以被高效 kernel 和并行化缓解。

### 16.2 推理时问题变了：incremental decoding

生成文本时，token 必须一步一步生成：

```
生成第 t 个 token -> 才知道第 t+1 个 token 的输入
```

不能像训练那样一次并行处理所有未来 token。

为了避免每步重新计算历史 token 的 key/value，推理会保存 KV cache：

```
KV cache = 每一层、每个历史 token 的 key 和 value
```

问题：

- context 越长，KV cache 越大。

- 每生成一个新 token，都要读取历史 KV。

- 推理常常变成 memory bandwidth limited，而不是纯 compute limited。

### 16.3 MQA：Multi-Query Attention

标准 multi-head attention：

```
每个 query head 都有自己的 key head 和 value head
```

MQA 的关键思想：

```
多个 query heads 共享一组 key/value heads
```

极端情况下：

```
many Q heads, one K head, one V head
```

好处：

- KV cache 大幅变小。

- 推理时需要从显存读取的 K/V 更少。

- 对长上下文和高吞吐推理非常有利。

代价：

- 表达能力可能下降。

- Shazeer 2019 观察到 MQA 可能带来小的 perplexity 损失。

### 16.4 GQA：Grouped-Query Attention

GQA 是 MQA 和标准 MHA 之间的折中。

做法：

```
把 query heads 分成若干组。
每组 query heads 共享一组 key/value heads。
```

它提供一个可调旋钮：

| 方法 | KV heads 数量   | 推理效率 | 表达能力     |
| ---- | --------------- | -------- | ------------ |
| MHA  | 与 Q heads 相同 | 最低     | 最高         |
| GQA  | 少于 Q heads    | 中等到高 | 通常接近 MHA |
| MQA  | 1 组 K/V        | 最高     | 可能略低     |

讲义结论：

- MQA 有时会有小的 PPL hit。

- GQA 往往能在效率和质量之间取得更好的折中。

- Ainslie 2023 观察到 GQA 可以做到 low/no hit。

### 16.5 什么时候该关心 GQA/MQA？

如果目标主要是训练小模型或做课程实现，标准 MHA 更简单。

如果目标是部署推理，尤其是：

- 长上下文。

- 大 batch serving。

- 高 QPS。

- 显存带宽成为瓶颈。

那么 GQA/MQA 会变得非常重要。

---

## 17. Sparse attention 与 sliding window attention

### 17.1 全 attention 的成本

标准 full self-attention 对 sequence length 是二次复杂度：

```
attention matrix size = n x n
cost roughly grows as O(n^2)
```

上下文很长时，这会非常贵。

### 17.2 Sparse / structured attention

思想：

```
不要让每个 token attend 到所有 token。
只允许 attend 到某些结构化位置。
```

例子：

- strided attention。

- block sparse attention。

- local + global attention。

这类方法在 GPT-3 相关工作和 Child et al. 2019 中出现过。

权衡：

- 速度和内存更好。

- 表达能力可能下降。

- 实现复杂度更高。

### 17.3 Sliding window attention

sliding window attention 只让 token attend 到附近窗口：

```
token i 只看 [i - window, i] 范围内的 token
```

优点：

- attention cost 从全局二次变得更接近局部线性。

- 对局部依赖很强的语言建模很有效。

- Mistral 等模型使用过。

为什么仍能传递远距离信息？

```
第 1 层传播局部信息。
第 2 层在局部信息基础上继续传播。
层数越深，有效 receptive field 越大。
```

### 17.4 Full attention 和 local attention 交替

近期常见技巧：

```
大多数层使用 local / sliding window attention。
每隔若干层使用一次 full attention。
```

讲义例子：

- Cohere Command A：每 4 层有一层 full attention。

- 长程信息可以通过 full/no-position attention 传播。

- 短程信息可以通过 RoPE + sliding window attention 处理。

- LLaMA 4、Gemma 等也使用过 SWA + full attention 的组合。

实践理解：

```
local attention 负责便宜地处理短程上下文。
periodic full attention 负责让信息跨窗口流动。
```

---

## 18. 从零搭模型时的决策清单

如果要实现一个现代 decoder-only LM baseline，可以按这个顺序决定：

| 决策         | 推荐起点                         | 为什么                       |
| ------------ | -------------------------------- | ---------------------------- |
| Block norm   | pre-norm                         | 现代共识，训练稳定           |
| Norm type    | RMSNorm                          | 更快，效果通常不差           |
| Bias         | no bias                          | 现代常见，减少参数和数据移动 |
| Position     | RoPE                             | 主流、相对位置信息自然       |
| FFN          | SwiGLU                           | 现代默认，通常有小收益       |
| `d_ff`       | `8/3 d_model`                    | 保持 GLU 参数量接近标准 FFN  |
| Head ratio   | `num_heads * head_dim = d_model` | 简单保守                     |
| Head dim     | 64 或 128                        | 常见硬件友好值               |
| Dropout      | 0 起步                           | 大规模预训练常见             |
| Weight decay | 0.1 起步                         | 常用于优化动态               |
| Stability    | 先不加，必要时加 z-loss/QK norm  | 避免过早复杂化               |
| Inference    | 需要部署时考虑 GQA               | 降低 KV cache 成本           |

一个最小现代 block：

```
for each layer:
    x = x + Attention(RMSNorm(x), RoPE, nobias)
    x = x + SwiGLU(RMSNorm(x), dff = 8/3 dmodel, nobias)
final:
    logits = LMHead(RMSNorm(x))
```

如果要优化推理：

```
MHA -> GQA
full attention -> sliding window + periodic full attention
```

---

## 19. 常见误区

### 19.1 “某个模型用了某技巧，所以一定要用”

不一定。很多技巧只在特定 scale、数据、硬件、训练代码下有意义。

更好的问法：

```
这个技巧解决什么问题？
我现在是否遇到了这个问题？
它带来的复杂度是否值得？
```

### 19.2 “FLOPs 少就一定快”

不一定。RMSNorm 的例子说明：

- Norm 层 FLOPs 不大。

- 但内存读写和 kernel 效率会影响 runtime。

- 系统层面的性能要看 arithmetic intensity、memory bandwidth、fusion、parallelism。

### 19.3 “训练效率和推理效率是同一个问题”

不是。

训练：

- 大 batch。

- 整段 sequence 并行。

- 大矩阵乘法主导。

推理：

- 自回归逐 token。

- KV cache 反复读写。

- 内存带宽和 latency 更关键。

因此 GQA/MQA 主要是推理效率技巧，而不是单纯为了训练 loss。

### 19.4 “超参数默认值是理论定律”

不是。`d_ff = 4d_model`、head ratio `1`、aspect ratio `100-200` 都是经验稳定点。

它们是好起点，但不是不可改变的规则。

---

## 20. 复习问题

| 问题                                          | 你应该能答出                                                    |
| --------------------------------------------- | --------------------------------------------------------------- |
| 为什么现代 LLM 几乎都用 pre-norm？            | residual stream 更稳定，梯度传播更好，减少 spike                |
| RMSNorm 相比 LayerNorm 少了什么？             | 不减 mean，通常无 bias，只按 RMS 缩放                           |
| SwiGLU 为什么常用 `8/3 d_model`？             | 多一个 gate projection，缩小 `d_ff` 后参数量接近非 gated 4x FFN |
| RoPE 为什么是相对位置编码？                   | 旋转后 Q/K 内积依赖 `j - i`                                     |
| `num_heads * head_dim = d_model` 是必须的吗？ | 不是，但多数模型这么做                                          |
| 为什么新模型常不用 dropout？                  | 数据巨大、单 pass，不一定需要传统防过拟合                       |
| weight decay 在 LLM 中只防 overfitting 吗？   | 不是，还影响优化动态和 LR schedule                              |
| z-loss 惩罚什么？                             | `logsumexp(logits)` 的平方，控制 output logits 尺度             |
| QK norm 解决什么？                            | 控制 attention score 尺度，避免 softmax 不稳定                  |
| MQA/GQA 为什么能提升推理效率？                | 减少 KV cache 读写，降低 memory bandwidth 压力                  |
| sliding window attention 的代价是什么？       | 降低全局可见性，需要深层或 periodic full attention 弥补         |

---

## 21. 一句话总复习

Lecture 3 的主旨是：现代 LLM 架构并不是完全自由组合的“魔法配方”，而是一组在大规模训练和部署中被反复验证的工程默认值。pre-norm、RMSNorm、RoPE、SwiGLU、no bias、标准 head ratio、合理 `d_ff` 倍数构成了强 baseline；z-loss、QK norm、GQA、sliding window attention 则是在稳定性和推理成本压力下逐渐变重要的补充技巧。
