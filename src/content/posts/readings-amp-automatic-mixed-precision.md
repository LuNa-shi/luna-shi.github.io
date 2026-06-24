---
title: 'AMP: automatic mixed precision as a dispatch policy'
date: '2026-05-18'
overview: >-
  TLDR: AMP is not "turn the model into half precision." It is a runtime policy that runs safe, high-throughput ops in
  lower precision while protecting numerically sensitive paths.
description: >-
  TLDR: AMP is not "turn the model into half precision." It is a runtime policy that runs safe, high-throughput ops in
  lower precision while protecting numerically sensitive paths.
math: true
toc: true
relatedPosts: false
tags:
  - mixed-precision
  - gpu-systems
categories:
  - reading
  - systems
---

<!-- notion-sync: 3644e07a-a023-80b8-99a5-d9363dba6a0a parent=Readings url=https://app.notion.com/p/3644e07aa02380b899a5d9363dba6a0a -->

The easiest mistake with AMP is to think it means "train the whole model in half precision."

That is not the right mental model. AMP is a runtime precision policy. It lets PyTorch choose lower precision for operations that benefit from it, while keeping sensitive operations in safer precision.

The goal is practical:

```text
more throughput
less activation memory
minimal manual dtype surgery
acceptable numerical stability
```

## The two moving parts

In PyTorch, AMP is mainly two mechanisms:

```text
autocast: choose execution dtype per operation
GradScaler: protect fp16 gradients from underflow and overflow
```

A typical bf16 training step looks like this:

```python
with torch.autocast(device_type="cuda", dtype=torch.bfloat16):
    logits = model(x)
    loss = F.cross_entropy(logits, y)

loss.backward()
optimizer.step()
optimizer.zero_grad(set_to_none=True)
```

The important part is the boundary. `autocast` wraps the forward computation. Backward usually does not need its own autocast block because it follows dtype decisions recorded in the forward graph.

## Autocast is a dispatcher decision

Inside `autocast`, each PyTorch operation goes through a policy decision. Some operations are safe and profitable in lower precision. Others are numerically sensitive.

| Operation family | Typical autocast behavior | Reason |
| --- | --- | --- |
| `matmul`, `linear`, `conv` | bf16 or fp16 | Tensor Cores can make these much faster |
| Attention matrix multiplies | bf16 or fp16 | high arithmetic intensity |
| Softmax, norm, reductions | fp32 or internal fp32 | numerically sensitive |
| Loss functions | often fp32 path | protects loss stability |
| Elementwise ops | usually follows inputs | lower performance leverage |

So AMP is not a global conversion. It is a per-op execution policy.

## Parameters usually stay where they are

If model weights start as fp32, autocast does not permanently rewrite them.

```python
model.weight.dtype  # torch.float32

with torch.autocast(device_type="cuda", dtype=torch.bfloat16):
    y = model(x)

model.weight.dtype  # still torch.float32
```

During a `linear` call, PyTorch may use lower-precision temporary inputs or kernels. The parameter object itself remains fp32. Optimizer states also usually remain fp32.

This is why AMP reduces activation and temporary buffer cost more than it reduces the entire training-state footprint.

## bf16 and fp16 solve different pain

The main difference is dynamic range.

| dtype | Dynamic range | Precision | Training behavior |
| --- | --- | --- | --- |
| fp32 | large | high | most stable |
| fp16 | small | medium | can underflow or overflow |
| bf16 | close to fp32 | coarser | usually easier for large models |

bf16 keeps the fp32 exponent width, so it has a much larger dynamic range than fp16. That is why bf16 training often does not need a `GradScaler`.

fp16 is different. Small gradients may underflow to zero:

```text
small gradient -> underflow -> 0
```

`GradScaler` works by scaling the loss before backward, then unscaling gradients before the optimizer step:

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

Conceptually:

```text
scale loss
  -> backward produces scaled gradients
  -> unscale before step
  -> check inf or nan
  -> step if safe, skip and lower scale if unsafe
```

## Gradient clipping has one trap

For fp16 with a scaler, clip after unscaling:

```python
scaler.scale(loss).backward()
scaler.unscale_(optimizer)

torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)

scaler.step(optimizer)
scaler.update()
optimizer.zero_grad(set_to_none=True)
```

If you clip scaled gradients directly, the clipping threshold no longer means what you think it means.

## The mental model

The useful summary is:

```text
master parameters: usually fp32
large matmuls: temporary low precision
sensitive ops: fp32 or internal fp32
fp16: use GradScaler
bf16: usually no GradScaler
backward: follows the forward graph
```

AMP is a dispatch-layer precision policy. It is not the same as manually calling `.half()` on the model, and treating those two as equivalent is the fastest way to get confused debugging numerical issues.
