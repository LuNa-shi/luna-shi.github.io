---
title: AMP：Automatic Mixed Precision 技术笔记
date: '2026-05-18'
overview: >-
  TLDR: AMP speeds training and reduces memory by choosing lower precision for safe ops while keeping higher precision
  where numerical stability matters.
description: >-
  TLDR: AMP speeds training and reduces memory by choosing lower precision for safe ops while keeping higher precision
  where numerical stability matters.
tags:
  - readings
categories:
  - reading
  - systems
math: true
toc: true
relatedPosts: true
---

<!-- notion-sync: 3644e07a-a023-80b8-99a5-d9363dba6a0a parent=Readings url=https://app.notion.com/p/3644e07aa02380b899a5d9363dba6a0a -->

AMP 的目标是：**在不手动改模型 dtype 的情况下，让训练自动混合使用高精度与低精度，从而提升速度、降低显存，同时尽量保持数值稳定。**

它主要由两部分组成：

```
autocast：自动决定每个 op 用什么 dtype
GradScaler：主要为 fp16 防止梯度 underflow / overflow
```

## 1. autocast 做了什么

典型写法：

```python
with torch.autocast(devicetype="cuda", dtype=torch.bfloat16):
    logits = model(x)
    loss = F.crossentropy(logits, y)

loss.backward()
optimizer.step()
optimizer.zerograd(settonone=True)
```

进入 `autocast` 后，PyTorch 会启用一个 autocast 状态。之后每个 PyTorch op 会经过 dispatcher，dispatcher 根据该 op 的 policy 决定执行 dtype。

简化理解：

| op 类型                      | 常见 autocast 行为    | 原因                  |
| ---------------------------- | --------------------- | --------------------- |
| `matmul` / `linear` / `conv` | 用 bf16/fp16          | Tensor Cores 加速明显 |
| attention 中的大矩阵乘法     | 用 bf16/fp16          | 计算量大，收益高      |
| softmax / norm / reduction   | 常用 fp32 或内部 fp32 | 数值敏感              |
| loss，如 cross entropy       | 常保留 fp32 路径      | 避免 loss 不稳定      |
| 普通 elementwise             | 多数跟随输入 dtype    | 计算成本较低          |

重点：**autocast 不是把整个模型改成低精度，而是按 op 自动选择 dtype。**

## 2. autocast 不会永久改变参数 dtype

假设模型参数是 fp32：

```python
model.weight.dtype  # torch.float32
```

在 autocast 中：

```python
with torch.autocast("cuda", dtype=torch.bfloat16):
    y = model(x)
```

PyTorch 可能临时把 `linear` 的输入和权重 cast 到 bf16 执行，但参数本体仍是 fp32。

```python
model.weight.dtype  # 仍然是 torch.float32
```

这意味着：

- optimizer 更新的通常还是 fp32 参数。

- optimizer states 通常也仍是 fp32。

- AMP 主要节省 activations 和临时计算 buffer，不一定让全部训练状态减半。

## 3. bf16 vs fp16

| dtype | 动态范围  | 精度 | 训练稳定性                |
| ----- | --------- | ---- | ------------------------- |
| fp32  | 大        | 高   | 最稳                      |
| fp16  | 小        | 中   | 容易 underflow / overflow |
| bf16  | 接近 fp32 | 较粗 | 通常比 fp16 稳            |

bf16 的关键优势：**exponent 位数和 fp32 一样多，所以动态范围大**。因此大模型训练中，bf16 通常比 fp16 更省心，也通常不需要 `GradScaler`。

## 4. GradScaler 为什么主要用于 fp16

fp16 动态范围小，小梯度可能变成 0：

```
small grad -> underflow -> 0
```

`GradScaler` 的做法是先放大 loss：

```python
scaledloss = loss  scale
```

于是 backward 得到的梯度也被放大：

```
scaledgrad = truegrad × scale
```

optimizer step 前再除回来，并检查是否出现 `inf` / `nan`。

典型 fp16 写法：

```python
scaler = torch.cuda.amp.GradScaler()

with torch.autocast(devicetype="cuda", dtype=torch.float16):
    logits = model(x)
    loss = F.crossentropy(logits, y)

scaler.scale(loss).backward()
scaler.step(optimizer)
scaler.update()
optimizer.zerograd(settonone=True)
```

内部逻辑：

```
1. scale(loss)
2. backward 得到 scaled gradients
3. step 前 unscale gradients
4. 检查 inf / nan
5. 如果正常：optimizer.step()
6. 如果异常：跳过 step，降低 scale
```

## 5. backward 一般不包进 autocast

推荐：

```python
with torch.autocast("cuda", dtype=torch.bfloat16):
    loss = computeloss(model, x, y)

loss.backward()
```

不推荐特意写成：

```python
with torch.autocast("cuda", dtype=torch.bfloat16):
    loss = computeloss(model, x, y)
    loss.backward()
```

原因：backward 的 dtype 通常由 forward graph 中记录的 op 决定。forward 用什么路径，backward 会沿着对应 graph 执行，不需要额外包 autocast。

## 6. 常见注意点

| 场景              | 正确做法                                          |
| ----------------- | ------------------------------------------------- |
| bf16 训练         | 通常只用 `autocast(dtype=torch.bfloat16)`         |
| fp16 训练         | 用 `autocast(dtype=torch.float16)` + `GradScaler` |
| gradient clipping | fp16 下先 `scaler.unscale_(optimizer)`，再 clip   |
| debug 数值问题    | 打印 tensor dtype、检查 `nan/inf`                 |
| 评估/inference    | 可以用 autocast，但不需要 GradScaler              |
| 手动 `.half()`    | 不等价于 AMP，风险更高                            |

gradient clipping 示例：

```python
scaler.scale(loss).backward()
scaler.unscale(optimizer)

torch.nn.utils.clipgradnorm(model.parameters(), maxnorm=1.0)

scaler.step(optimizer)
scaler.update()
```

## 7. 最重要的 mental model

```
参数主副本：通常 fp32
大矩阵乘法：临时低精度，用 Tensor Cores
数值敏感 op：保留 fp32 或内部 fp32
fp16：需要 GradScaler
bf16：通常不需要 GradScaler
```

一句话总结：

> AMP 的本质是在 PyTorch dispatcher 层面，根据 op 的性能收益和数值稳定性，自动选择执行精度；它不是简单地把模型整体转成半精度。
