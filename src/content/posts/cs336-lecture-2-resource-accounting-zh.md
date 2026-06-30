---
title: CS336：第 2 讲 PyTorch 与资源核算
date: '2026-05-18'
overview: 第 2 讲是关于具体化训练成本：张量、数据类型、内存、FLOP、autograd、优化器、数据加载、检查点和混合精度都有资源价格。
description: 关于 PyTorch 机制和语言模型训练资源核算的紧凑 CS336 讲义。
math: true
toc: true
relatedPosts: false
tags:
 - cs336
 - resource-accounting
categories:
 - learning
 - systems
lang: zh
translationKey: cs336-lecture-2-resource-accounting
canonicalSlug: cs336-lecture-2-resource-accounting
---

<!-- notion-sync: 3644e07a-a023-8037-81e3-fbd69dc4a41f parent=CS336 url=链接 0 -->

> 来源：斯坦福 CS336 2025 年春季讲座 2 可执行笔记。
>
> 本次讲座还不是关于 Transformer 架构的。它是关于训练下的工程基础：张量、内存、FLOP、设备、自动分级、数据移动、优化器和检查点。

## 一帧讲座

在训练模型之前，每个架构选择都应该有一个资源价格。

|层|理解什么 |为什么这很重要 |
| --- | --- | --- |
|张量 |形状、数据类型、设备、步幅、存储 |所有训练状态都在这里 |
|内存|参数、梯度、优化器状态、激活 |确定适合的 |
|计算|浮点运算、浮点运算/秒、MFU |确定训练需要多长时间 |
|自动毕业|前向图和后向成本 |落后不是免费的|
|模块|参数、初始化、组成 |定义可训练状态 |
|数据| Memmap、批量采样、固定内存 |输入管道可能会成为训练瓶颈 |
|优化器| SGD、AdaGrad、RMSProp、Adam |优化器状态消耗内存 |
|训练|种子、检查点、混合精度 |可靠性是工程，而不是运气 |

心态是资源核算：
```text
Can this run?
How much memory does it need?
How many FLOPs does it spend?
Where is the bottleneck?
What will break first when scale increases?
```
## 餐巾纸数学

密集语言模型训练的规范估计是：

$$
\text{训练 FLOPs} \大约 6ND
$$

其中 $N$ 是参数计数，$D$ 是训练 token。

对于在 15T token上训练的 70B 模型：
```python
params = 70e9
tokens = 15e12
total_flops = 6 * params * tokens
```
给定 H100 吞吐量、GPU 数量和模型 FLOP 利用率 (MFU)，训练时间大致为：
```python
h100_flops_per_sec = 1979e12 / 2 # rough dense bf16/fp16 adjustment
mfu = 0.5
num_gpus = 1024

flops_per_day = h100_flops_per_sec * mfu * num_gpus * 60 * 60 * 24
days = total_flops / flops_per_day
```
这忽略了通信、检查点、数据加载、故障和调度开销。那很好。重点是在编写训练代码之前要知道数量级。

## 内存统计

张量的内存占用是：

$$
\text{字节} = \text{numel}(x) \times \text{元素\_size}(x)
$$

在 PyTorch 中：
```python
x.numel() * x.element_size()
```
对于 float32 中的朴素 AdamW，粗略的参数状态预算为：
```text
parameter 4 bytes
gradient 4 bytes
Adam first moment 4 bytes
Adam second moment 4 bytes
-------------------------
total 16 bytes per parameter
```
这不包括激活、临时缓冲区、通信缓冲区、碎片或检查点。

## 数据类型

|数据类型 |字节 |实力|风险|
| --- | ---: | --- | --- |
| `float32` | 4 |稳定默认 |贵|
| `float16` | 2 |又快又小|动态范围小 |
| `bfloat16` | 2 |动态范围大，适合训练|降低尾数精度 |
| `fp8` | 1 |在支持的硬件上非常高效 |需要专门的食谱|

下溢示例是值得记住的一个：
```python
import torch

torch.tensor([1e-8], dtype=torch.float16)
# may become 0

torch.tensor([1e-8], dtype=torch.bfloat16)
# keeps the scale because bf16 has a wider exponent range
```
当数字范围很重要时，请使用 `torch.finfo(dtype)`。

## 设备移动

张量存在于设备上：
```python
x = torch.randn(4, 8, device="cuda")
y = x.to("cpu")
```
跨 CPU 和 GPU 移动数据并不是免费的。训练性能通常取决于数据管道是否能够满足 GPU 的需求。

固定内存有助于主机到 GPU 的传输：
```python
batch = batch.pin_memory()
batch = batch.to("cuda", non_blocking=True)
```
这不是神奇的加速。当转移处于关键路径上时，这一点很重要。

## 存储、跨步、查看和复制

张量不仅仅是一个多维数组。这是一个关于形状和跨度的存储视图。
```python
x = torch.arange(12).reshape(3, 4)
x.shape # torch.Size([3, 4])
x.stride() # often (4, 1)
```
许多操作都会创建视图：
```python
y = x.view(4, 3)
z = x.transpose(0, 1)
```
但并非所有布局都可以在不复制的情况下查看。如果张量不连续，则 `view` 可能会失败，并且 `reshape` 可能会分配。

心理模型：
```text
view = reinterpret existing storage when possible
reshape = view if possible, copy if needed
contiguous = materialize a layout that supports simple strides
```
## 矩阵乘法

矩阵乘法在语言模型计算中占主导地位。

对于：

$$
A \in \mathbb{R}^{m \times k}, \quad B \in \mathbb{R}^{k \times n}
$$

输出的形状为 $m \times n$，粗略的 FLOP 计数为：

$$
2mkn
$$

在 PyTorch 中：
```python
x = torch.randn(16, 32)
w = torch.randn(32, 64)
y = x @ w
assert y.shape == (16, 64)
```
对于批量 matmul：
```python
x = torch.randn(4, 8, 16, 32)
w = torch.randn(4, 8, 32, 64)
y = x @ w
assert y.shape == (4, 8, 16, 64)
```
批量尺寸广播或对齐；最后两个维度进行矩阵相乘。

## 浮点运算、浮点运算/秒和 MFU

三个术语应该分开：

|术语 |意义|
| --- | --- |
|失败 |浮点运算数 |
|失败/秒 |硬件吞吐量|
| MFU |模型 FLOP 利用率，实际有用 FLOP/s 除以理论峰值 |

MFU 是一个有用的现实检查：

$$
\text{MFU} =
\frac{\text{实际模型 FLOP/s}}{\text{理论峰值 FLOP/s}}
$$

如果 MFU 较低，则问题可能是内存带宽、通信、内核开销、Python 开销、数据加载或不良形状。

## 自动毕业

PyTorch 在前向传递过程中构建计算图，并在后向传递过程中使用它：
```python
x = torch.tensor([2.0], requires_grad=True)
y = x * x + 3 * x
y.backward()
print(x.grad)
```
后向计算的成本通常与核心线性运算的前向计算的成本相同，通常约为两倍。它还需要保存激活，除非使用检查点或重新计算。

因此，资源核算应包括：
```text
forward activations
backward compute
gradient storage
optimizer state
temporary buffers
```
## 参数和模块

`nn.Parameter` 将张量标记为可训练状态：
```python
import torch.nn as nn

class Linear(nn.Module):
 def __init__(self, in_features, out_features):
 super().__init__()
 self.weight = nn.Parameter(torch.randn(in_features, out_features) * 0.02)
 self.bias = nn.Parameter(torch.zeros(out_features))

 def forward(self, x):
 return x @ self.weight + self.bias
```
初始化很重要，因为规模控制着激活和梯度行为。错误的初始化可能会使模型在优化发挥作用之前变得不稳定。

## 优化内存

优化器是模型内存占用的一部分。

|优化器|额外状态 |
| --- | --- |
|新元 |通常没有，或者动量缓冲|
|阿达格勒 |累积平方梯度|
| RMSProp|平方梯度的移动平均值 |
|亚当 / AdamW |第一和第二时刻|

对于 AdamW 来说，优化器状态可以大规模控制内存。分片、混合精度和 ZeRO 式分区等技术就是对这一会计问题的回应。

## 数据加载

标记化数据集通常存储为数组并使用内存映射读取：
```python
import numpy as np

tokens = np.memmap("tokens.bin", dtype=np.uint16, mode="r")
```
批量采样通常是基于切片的：
```python
ix = torch.randint(len(tokens) - seq_len, (batch_size,))
x = torch.stack([torch.from_numpy(tokens[i : i + seq_len].astype("int64")) for i in ix])
y = torch.stack([torch.from_numpy(tokens[i + 1 : i + 1 + seq_len].astype("int64")) for i in ix])
```
应测量数据路径。如果批次延迟到达，完美的模型内核仍然会闲置。

## 训练循环清单

最小循环具有比“循环”一词所暗示的更多的移动部分：
```python
model.train()

for step in range(num_steps):
 x, y = next_batch()
 logits = model(x)
 loss = loss_fn(logits, y)

 optimizer.zero_grad(set_to_none=True)
 loss.backward()
 optimizer.step()
```
生产版本还需要：

- 尽可能确定的种子政策；
- 如果需要的话进行梯度裁剪；
- 混合精密配方；
- 检查点保存和加载；
- 学习率表；
- 评估节奏；
- 日志记录；
- 故障恢复。

## 检查点

有用的检查点应该包含足够的状态来恢复：
```python
torch.save(
 {
 "model": model.state_dict(),
 "optimizer": optimizer.state_dict(),
 "step": step,
 "rng_state": torch.get_rng_state(),
 },
 "checkpoint.pt",
)
```
如果训练无法忠实恢复，则检查点只是一个快照，而不是恢复基础设施。

## 混合精度

混合精度以数字格式换取速度和内存。

主要区别：
```text
compute dtype: often bf16/fp16
master state: may remain fp32
optimizer state: often fp32 or carefully managed
```
实际规则是将混合精度视为一个配方，而不是单个开关。正确的方法取决于硬件、模型规模、优化器、标准化和损失行为。

## 我想记住什么

第二讲是学科讲座。它教导说，在调试训练系统之前应该对其进行估计。

紧凑的评论：
```text
memory = numel * element_size
matmul FLOPs = 2mkn
training FLOPs ~= 6 * parameters * tokens
MFU = actual useful FLOP/s / hardware peak FLOP/s
AdamW naive fp32 state ~= 16 bytes per parameter
```
真正的教训是：

> 大模型训练不仅仅是模型设计。这是不确定性下的资源核算。
