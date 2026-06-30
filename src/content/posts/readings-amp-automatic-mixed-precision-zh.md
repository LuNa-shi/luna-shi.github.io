---
title: AMP：自动混合精度作为调度策略
date: '2026-05-18'
overview: TLDR：AMP 并不是“将模型变成半精度”。它是一种运行时策略，可以以较低的精度运行安全、高吞吐量的操作，同时保护数字敏感路径。
description: TLDR：AMP 并不是“将模型变成半精度”。它是一种运行时策略，可以以较低的精度运行安全、高吞吐量的操作，同时保护数字敏感路径。
math: true
toc: true
relatedPosts: false
tags:
 - mixed-precision
 - gpu-systems
categories:
 - reading
 - systems
lang: zh
translationKey: readings-amp-automatic-mixed-precision
canonicalSlug: readings-amp-automatic-mixed-precision
---

<!-- notion-sync: 3644e07a-a023-80b8-99a5-d9363dba6a0a parent=Readings url=链接 0 -->

AMP 最容易犯的错误是认为它意味着“以半精度训练整个模型”。

这不是正确的思维模式。 AMP 是一种运行时精度策略。它允许 PyTorch 为从中受益的操作选择较低的精度，同时将敏感操作保持在更安全的精度。

目标很实际：
```text
more throughput
less activation memory
minimal manual dtype surgery
acceptable numerical stability
```
## 两个活动部件

在 PyTorch 中，AMP 主要是两种机制：
```text
autocast: choose execution dtype per operation
GradScaler: protect fp16 gradients from underflow and overflow
```
典型的 bf16 训练步骤如下所示：
```python
with torch.autocast(device_type="cuda", dtype=torch.bfloat16):
 logits = model(x)
 loss = F.cross_entropy(logits, y)

loss.backward()
optimizer.step()
optimizer.zero_grad(set_to_none=True)
```
重要的部分是边界。 `autocast` 包装了前向计算。 Backward 通常不需要自己的 autocast 块，因为它遵循前向图中记录的 dtype 决策。

## Autocast 是调度员的决定

在 `autocast` 内部，每个 PyTorch 操作都会经历一个策略决策。有些操作在较低精度下是安全且有利可图的。其他的则对数字敏感。

|操作家族|典型的自动施放行为 |原因 |
| --- | --- | --- |
| `matmul`、`linear`、`conv` | bf16 或 fp16 |张量核心可以使这些速度更快 |
|注意力矩阵乘法 | bf16 或 fp16 |高算术强度 |
| Softmax、范数、缩减 | fp32 或内部 fp32 |数字敏感|
|损失函数|常 fp32 路径|保护损失稳定性|
|逐元素运算 |通常遵循输入 |较低的绩效杠杆|

所以 AMP 不是全局转换。这是每操作执行策略。

## 参数通常保留在原来的位置

如果模型权重以 fp32 开头，则 autocast 不会永久重写它们。
```python
model.weight.dtype # torch.float32

with torch.autocast(device_type="cuda", dtype=torch.bfloat16):
 y = model(x)

model.weight.dtype # still torch.float32
```
在 `linear` 调用期间，PyTorch 可能会使用较低精度的临时输入或内核。参数对象本身仍然是 fp32。优化器状态通常也保留为 fp32。

这就是为什么 AMP 减少的激活和临时缓冲区成本比减少整个训练状态占用空间要多。

## bf16 和 fp16 解决不同的痛点

主要区别在于动态范围。

|数据类型 |动态范围|精密|训练行为|
| --- | --- | --- | --- |
| FP32 |大|高|最稳定|
| FP16 |小|中等|可以下溢或溢出|
| BF16 |接近 fp32 |较粗|通常对于大型模型来说更容易

bf16 保留了 fp32 指数宽度，因此它的动态范围比 fp16 大得多。这就是为什么 bf16 训练通常不需要`GradScaler`。

fp16 则不同。小梯度可能下溢到零：
```text
small gradient -> underflow -> 0
```
`GradScaler` 的工作原理是在向后缩放之前缩放损失，然后在优化器步骤之前取消缩放梯度：
```python
scaler = torch.cuda.amp.GradScaler()

with torch.autocast(device_type="cuda", dtype=torch.float16):
 logits = model(x)
 loss = F.cross_entropy(logits, y)

scaler.scale(loss).backward()
scaler.step(optimizer)
scaler.update()
optimizer.zero_grad(set_to_none=True)
```
从概念上讲：
```text
scale loss
 -> backward produces scaled gradients
 -> unscale before step
 -> check inf or nan
 -> step if safe, skip and lower scale if unsafe
```
## 梯度裁剪有一个陷阱

对于带有缩放器的 fp16，取消缩放后进行剪辑：
```python
scaler.scale(loss).backward()
scaler.unscale_(optimizer)

torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)

scaler.step(optimizer)
scaler.update()
optimizer.zero_grad(set_to_none=True)
```
如果直接剪切缩放渐变，则剪切阈值不再具有您认为的含义。

## 心智模型

有用的总结是：
```text
master parameters: usually fp32
large matmuls: temporary low precision
sensitive ops: fp32 or internal fp32
fp16: use GradScaler
bf16: usually no GradScaler
backward: follows the forward graph
```
AMP 是调度层精准策略。它与在模型上手动调用 `.half()` 不同，将这两者视为等效是混淆调试数值问题的最快方法。
