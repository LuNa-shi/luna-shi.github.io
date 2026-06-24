---
title: 'CS336: Lecture 2 - PyTorch and resource accounting'
date: '2026-05-18'
overview: >-
  Lecture 2 is about making training cost concrete: tensors, dtypes, memory, FLOPs, autograd, optimizers, data loading,
  checkpoints, and mixed precision all have resource prices.
description: >-
  A compact CS336 lecture note on PyTorch mechanics and resource accounting for language-model training.
math: true
toc: true
relatedPosts: false
tags:
  - cs336
  - resource-accounting
categories:
  - learning
  - systems
---

<!-- notion-sync: 3644e07a-a023-8037-81e3-fbd69dc4a41f parent=CS336 url=https://app.notion.com/p/3644e07aa023803781e3fbd69dc4a41f -->

> Source: Stanford CS336 Spring 2025 Lecture 2 executable notes.
>
> This lecture is not yet about Transformer architecture. It is about the engineering substrate underneath training: tensors, memory, FLOPs, devices, autograd, data movement, optimizers, and checkpointing.

## The lecture in one frame

Before training a model, every architectural choice should have a resource price.

| Layer | What to understand | Why it matters |
| --- | --- | --- |
| Tensor | Shape, dtype, device, stride, storage | All training state lives here |
| Memory | Parameters, gradients, optimizer states, activations | Determines what fits |
| Compute | FLOPs, FLOP/s, MFU | Determines how long training takes |
| Autograd | Forward graph and backward cost | Backward is not free |
| Module | Parameters, initialization, composition | Defines trainable state |
| Data | Memmap, batch sampling, pinned memory | Input pipeline can bottleneck training |
| Optimizer | SGD, AdaGrad, RMSProp, Adam | Optimizer state consumes memory |
| Training | Seeds, checkpoints, mixed precision | Reliability is engineering, not luck |

The mindset is resource accounting:

```text
Can this run?
How much memory does it need?
How many FLOPs does it spend?
Where is the bottleneck?
What will break first when scale increases?
```

## Napkin math

The canonical estimate for dense language-model training is:

$$
\text{training FLOPs} \approx 6ND
$$

where $N$ is parameter count and $D$ is training tokens.

For a 70B model trained on 15T tokens:

```python
params = 70e9
tokens = 15e12
total_flops = 6 * params * tokens
```

Given H100 throughput, number of GPUs, and model FLOPs utilization (MFU), training time is roughly:

```python
h100_flops_per_sec = 1979e12 / 2  # rough dense bf16/fp16 adjustment
mfu = 0.5
num_gpus = 1024

flops_per_day = h100_flops_per_sec * mfu * num_gpus * 60 * 60 * 24
days = total_flops / flops_per_day
```

This ignores communication, checkpointing, data loading, failures, and scheduling overhead. That is fine. The point is to know the order of magnitude before writing training code.

## Memory accounting

A tensor's memory footprint is:

$$
\text{bytes} = \text{numel}(x) \times \text{element\_size}(x)
$$

In PyTorch:

```python
x.numel() * x.element_size()
```

For naive AdamW in float32, a rough parameter-state budget is:

```text
parameter        4 bytes
gradient         4 bytes
Adam first moment 4 bytes
Adam second moment 4 bytes
-------------------------
total           16 bytes per parameter
```

That does not include activations, temporary buffers, communication buffers, fragmentation, or checkpoints.

## Dtypes

| dtype | Bytes | Strength | Risk |
| --- | ---: | --- | --- |
| `float32` | 4 | Stable default | Expensive |
| `float16` | 2 | Fast and small | Small dynamic range |
| `bfloat16` | 2 | Large dynamic range, good for training | Lower mantissa precision |
| `fp8` | 1 | Very efficient on supported hardware | Needs specialized recipes |

The underflow example is the one to remember:

```python
import torch

torch.tensor([1e-8], dtype=torch.float16)
# may become 0

torch.tensor([1e-8], dtype=torch.bfloat16)
# keeps the scale because bf16 has a wider exponent range
```

Use `torch.finfo(dtype)` when the numeric range matters.

## Device movement

Tensors live on devices:

```python
x = torch.randn(4, 8, device="cuda")
y = x.to("cpu")
```

Moving data across CPU and GPU is not free. Training performance often depends on whether the data pipeline keeps the GPU fed.

Pinned memory helps host-to-GPU transfer:

```python
batch = batch.pin_memory()
batch = batch.to("cuda", non_blocking=True)
```

This is not a magic speedup. It matters when transfer is on the critical path.

## Storage, stride, view, and copy

A tensor is not just a multidimensional array. It is a view over storage with shape and stride.

```python
x = torch.arange(12).reshape(3, 4)
x.shape   # torch.Size([3, 4])
x.stride() # often (4, 1)
```

Many operations create views:

```python
y = x.view(4, 3)
z = x.transpose(0, 1)
```

But not every layout can be viewed without copying. If the tensor is non-contiguous, `view` may fail and `reshape` may allocate.

Mental model:

```text
view      = reinterpret existing storage when possible
reshape   = view if possible, copy if needed
contiguous = materialize a layout that supports simple strides
```

## Matrix multiplication

Matrix multiplication dominates language-model compute.

For:

$$
A \in \mathbb{R}^{m \times k}, \quad B \in \mathbb{R}^{k \times n}
$$

the output has shape $m \times n$, and the rough FLOP count is:

$$
2mkn
$$

In PyTorch:

```python
x = torch.randn(16, 32)
w = torch.randn(32, 64)
y = x @ w
assert y.shape == (16, 64)
```

For batched matmul:

```python
x = torch.randn(4, 8, 16, 32)
w = torch.randn(4, 8, 32, 64)
y = x @ w
assert y.shape == (4, 8, 16, 64)
```

The batch dimensions broadcast or align; the last two dimensions do the matrix multiply.

## FLOPs, FLOP/s, and MFU

Three terms should stay separate:

| Term | Meaning |
| --- | --- |
| FLOPs | Number of floating-point operations |
| FLOP/s | Hardware throughput |
| MFU | Model FLOPs utilization, actual useful FLOP/s divided by theoretical peak |

MFU is a useful reality check:

$$
\text{MFU} =
\frac{\text{actual model FLOP/s}}{\text{theoretical peak FLOP/s}}
$$

If MFU is low, the problem may be memory bandwidth, communication, kernel overhead, Python overhead, data loading, or bad shapes.

## Autograd

PyTorch builds a computation graph during the forward pass and uses it during backward:

```python
x = torch.tensor([2.0], requires_grad=True)
y = x * x + 3 * x
y.backward()
print(x.grad)
```

Backward usually costs on the same order as, and often about twice, the forward compute for core linear operations. It also needs saved activations unless checkpointing or recomputation is used.

Resource accounting should therefore include:

```text
forward activations
backward compute
gradient storage
optimizer state
temporary buffers
```

## Parameters and modules

`nn.Parameter` marks a tensor as trainable state:

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

Initialization matters because scale controls activation and gradient behavior. Bad initialization can make a model unstable before optimization has a chance to help.

## Optimizer memory

The optimizer is part of the model's memory footprint.

| Optimizer | Extra state |
| --- | --- |
| SGD | Often none, or momentum buffer |
| AdaGrad | Accumulated squared gradients |
| RMSProp | Moving average of squared gradients |
| Adam / AdamW | First and second moments |

For AdamW, optimizer state can dominate memory at scale. Techniques such as sharding, mixed precision, and ZeRO-style partitioning are responses to this accounting problem.

## Data loading

Tokenized datasets are often stored as arrays and read with memory mapping:

```python
import numpy as np

tokens = np.memmap("tokens.bin", dtype=np.uint16, mode="r")
```

Batch sampling is usually slice-based:

```python
ix = torch.randint(len(tokens) - seq_len, (batch_size,))
x = torch.stack([torch.from_numpy(tokens[i : i + seq_len].astype("int64")) for i in ix])
y = torch.stack([torch.from_numpy(tokens[i + 1 : i + 1 + seq_len].astype("int64")) for i in ix])
```

The data path should be measured. A perfect model kernel still idles if batches arrive late.

## Training loop checklist

A minimal loop has more moving parts than the word "loop" suggests:

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

The production version also needs:

- deterministic seed policy where possible;
- gradient clipping if needed;
- mixed precision recipe;
- checkpoint save and load;
- learning-rate schedule;
- evaluation cadence;
- logging;
- failure recovery.

## Checkpointing

A useful checkpoint should include enough state to resume:

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

If training cannot resume faithfully, the checkpoint is only a snapshot, not recovery infrastructure.

## Mixed precision

Mixed precision trades numeric format for speed and memory.

The key distinction:

```text
compute dtype: often bf16/fp16
master state: may remain fp32
optimizer state: often fp32 or carefully managed
```

The practical rule is to treat mixed precision as a recipe, not a single switch. The right recipe depends on hardware, model scale, optimizer, normalization, and loss behavior.

## What I want to remember

Lecture 2 is a discipline lecture. It teaches that training systems should be estimated before they are debugged.

The compact review:

```text
memory = numel * element_size
matmul FLOPs = 2mkn
training FLOPs ~= 6 * parameters * tokens
MFU = actual useful FLOP/s / hardware peak FLOP/s
AdamW naive fp32 state ~= 16 bytes per parameter
```

And the real lesson:

> Large-model training is not just model design. It is resource accounting under uncertainty.
