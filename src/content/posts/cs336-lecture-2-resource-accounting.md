---
title: 'CS336: Lecture 2 - PyTorch and Resource Accounting'
date: '2026-05-18'
overview: >-
  TLDR: Before training a model, PyTorch tensors, memory, FLOPs, and profiling have to become concrete enough that
  architecture choices have real resource prices.
description: >-
  TLDR: Before training a model, PyTorch tensors, memory, FLOPs, and profiling have to become concrete enough that
  architecture choices have real resource prices.
tags:
  - cs336
categories:
  - learning
  - systems
math: true
toc: true
relatedPosts: true
---

<!-- notion-sync: 3644e07a-a023-8037-81e3-fbd69dc4a41f parent=CS336 url=https://app.notion.com/p/3644e07aa023803781e3fbd69dc4a41f -->

> 来源：Stanford CS336 Spring 2025 Lecture 2 官方可执行讲义。主题不是 Transformer 结构本身，而是训练语言模型前必须掌握的 PyTorch 原语与资源核算方法。

## 0. 本讲主线

| 层级       | 内容                                          | 复习时要抓住什么             |
| ---------- | --------------------------------------------- | ---------------------------- |
| Motivation | 用 napkin math 粗估大模型训练成本             | 先估算，再动手               |
| Tensor     | 创建、存储、dtype、device、view/copy          | Tensor 是所有训练状态的容器  |
| Compute    | FLOPs、FLOP/s、MFU、matmul 计数               | 训练效率要量化               |
| Autograd   | forward graph、backward、grad                 | 反向传播约 2 倍 forward 成本 |
| Model      | `nn.Parameter`、`nn.Module`、初始化           | 参数规模和初始化影响稳定性   |
| Data       | memmap、batch sampling、pinned memory         | 数据加载也会成为瓶颈         |
| Optimizer  | SGD、AdaGrad、RMSProp、Adam 思路              | 优化器状态也占显存           |
| Training   | 训练循环、随机性、checkpoint、mixed precision | 可靠训练靠工程习惯           |

---

## 1. 核心观念：Resource Accounting

本讲最重要的 mindset：训练模型时，不能只问“代码能不能跑”，还要问：

- 需要多少显存？

- 需要多少 FLOPs？

- 在什么硬件、什么 dtype 下，多久能跑完？

- bottleneck 是 compute、memory、data transfer，还是 Python / framework overhead？

两类核心资源：

| 资源    | 单位       | 主要来源                                   |
| ------- | ---------- | ------------------------------------------ |
| Memory  | bytes / GB | 参数、梯度、激活值、优化器状态、数据 batch |
| Compute | FLOPs      | matmul、attention、MLP、backward           |

三个学习目标：

| 类型       | 含义                                                    |
| ---------- | ------------------------------------------------------- |
| Mechanics  | PyTorch 的基本机制，tensor、module、optimizer、autograd |
| Mindset    | 养成资源核算习惯                                        |
| Intuitions | 对效率、dtype、硬件、batch size、模型规模的经验判断     |

---

## 2. Napkin Math：两个 motivating questions

### 2.1 训练 70B 模型需要多久？

问题：训练一个 70B 参数模型，用 15T tokens，在 1024 张 H100 上，需要多久？

近似公式：

```
training FLOPs ≈ 6 × 参数量 × token 数
```

代入：

```
totalflops = 6 × 70e9 × 15e12
```

H100 dense bf16/fp16 峰值按：

```
1979e12 / 2 FLOP/s
```

假设：

```
MFU = 0.5
numgpus = 1024
```

每天可用计算量：

```
flopsperday = h100floppersec × MFU × 1024 × 60 × 60 × 24
```

训练天数：

```
days = totalflops / flopsperday
```

要点：这个估算忽略了通信、数据加载、checkpoint、failure recovery 等额外开销，但足够帮助判断数量级。

### 2.2 8 张 H100 能 naive 训练多大模型？

假设每张 H100 80GB，8 张总显存：

```
80e9 × 8 bytes
```

naive AdamW float32 显存估算：

```
bytesperparameter = 4 + 4 + (4 + 4)
                    = parameter + gradient + optimizer states
                    = 16 bytes
```

可容纳参数量：

```
numparameters = totalmemory / bytesperparameter
```

注意事项：

- 这没有计入 activations。

- activations 依赖 batch size 和 sequence length。

- bf16 参数和梯度可以更快，但通常仍会保留 fp32 master weights 或 optimizer states。

- ZeRO 这类方法可以 shard 参数、梯度、优化器状态，缓解显存压力。

---

## 3. Tensor Basics

Tensor 是训练系统里最基本的存储单元。它用来存：

- parameters

- gradients

- optimizer states

- data

- activations

### 3.1 创建 tensor

| API                     | 作用                               | 示例                                                 |
| ----------------------- | ---------------------------------- | ---------------------------------------------------- |
| `torch.tensor(...)`     | 从 Python list / array 创建 tensor | `torch.tensor([[1., 2], [3, 4]])`                    |
| `torch.zeros(shape)`    | 全 0 初始化                        | `torch.zeros(4, 8)`                                  |
| `torch.ones(shape)`     | 全 1 初始化                        | `torch.ones(4, 8)`                                   |
| `torch.randn(shape)`    | 标准正态采样                       | `torch.randn(4, 8)`                                  |
| `torch.empty(shape)`    | 分配内存但不初始化                 | `torch.empty(4, 8)`                                  |
| `nn.init.trunc_normal_` | 截断正态初始化                     | `nn.init.trunc_normal_(x, mean=0, std=1, a=-2, b=2)` |

`torch.empty` 的值是未初始化的旧内存垃圾值，通常用于后续手动初始化。

---

## 4. Memory Accounting 与 dtype

Tensor 显存公式：

```
memory = x.numel() × x.elementsize()
```

| API                    | 含义                 |
| ---------------------- | -------------------- |
| `x.dtype`              | 数据类型             |
| `x.numel()`            | tensor 元素总数      |
| `x.element_size()`     | 每个元素占多少 bytes |
| `x.size()` / `x.shape` | tensor shape         |

### 4.1 dtype 对比

| dtype             | 每个元素 | 优点                            | 风险 / 缺点                           |
| ----------------- | -------- | ------------------------------- | ------------------------------------- |
| `float32` / fp32  | 4 bytes  | 稳定、传统默认                  | 显存和计算成本高                      |
| `float16` / fp16  | 2 bytes  | 省显存、快                      | 动态范围小，容易 underflow / overflow |
| `bfloat16` / bf16 | 2 bytes  | 动态范围接近 fp32，适合深度学习 | 精度 resolution 比 fp16 更粗          |
| fp8               | 1 byte   | 更省显存、更快，H100 支持       | 训练稳定性更难，需要专门支持          |

### 4.2 float16 underflow 例子

```python
x = torch.tensor([1e-8], dtype=torch.float16)
# 可能变成 0
```

bf16 动态范围大得多：

```python
x = torch.tensor([1e-8], dtype=torch.bfloat16)
# 不会像 fp16 那样轻易 underflow
```

### 4.3 查看 dtype 数值范围

| API                           | 用法                 |
| ----------------------------- | -------------------- |
| `torch.finfo(torch.float32)`  | 查看 fp32 范围与精度 |
| `torch.finfo(torch.float16)`  | 查看 fp16 范围与精度 |
| `torch.finfo(torch.bfloat16)` | 查看 bf16 范围与精度 |

训练观念：

- fp32 稳但贵。

- fp16 / bf16 / fp8 快但可能不稳。

- mixed precision 的目的就是在速度、显存和稳定性之间折中。

---

## 5. CPU / GPU 与 device

默认 tensor 在 CPU：

```python
x = torch.zeros(32, 32)
x.device  # cpu
```

移动到 GPU：

```python
y = x.to("cuda:0")
```

直接在 GPU 创建：

```python
z = torch.zeros(32, 32, device="cuda:0")
```

常用 GPU API：

| API                                   | 作用                                |
| ------------------------------------- | ----------------------------------- |
| `torch.cuda.is_available()`           | 是否有可用 CUDA GPU                 |
| `torch.cuda.device_count()`           | GPU 数量                            |
| `torch.cuda.get_device_properties(i)` | 查看第 i 张 GPU 属性                |
| `torch.cuda.memory_allocated()`       | 当前已分配 GPU memory               |
| `torch.cuda.synchronize()`            | 等待 GPU 异步任务完成，计时时必须用 |

要点：

- CPU 与 GPU 之间的数据移动不是免费的。

- GPU kernel 通常异步执行，所以 benchmark 时要 `torch.cuda.synchronize()`。

---

## 6. Tensor Storage、Stride、View 与 Copy

PyTorch tensor 本质是：

```
pointer to storage + metadata
```

metadata 包括：

- shape

- dtype

- device

- stride

- offset

### 6.1 stride

stride 表示沿某个维度移动一步，需要在底层 storage 中跳过几个元素。

例子：

```python
x = torch.tensor([
    [0., 1, 2, 3],
    [4, 5, 6, 7],
])

x.stride(0)  # 下一行，跳过 4 个元素
x.stride(1)  # 下一列，跳过 1 个元素
```

索引位置：

```
storageindex = row × stride(0) + col × stride(1)
```

### 6.2 view 操作

很多操作不复制数据，只创建 view。

| 操作           | 是否通常共享 storage             | 示例                            |
| -------------- | -------------------------------- | ------------------------------- |
| indexing row   | 是                               | `x[0]`                          |
| slicing column | 是                               | `x[:, 1]`                       |
| `view`         | 是，但要求 contiguous-compatible | `x.view(3, 2)`                  |
| `transpose`    | 是，但可能 non-contiguous        | `x.transpose(1, 0)`             |
| `contiguous()` | 否，通常复制                     | `x.transpose(1,0).contiguous()` |

检查是否共享 storage：

```python
x.untypedstorage().dataptr() == y.untypedstorage().dataptr()
```

关键观念：

- view 几乎免费。

- copy 消耗额外 memory 和 compute。

- `transpose` 后的 tensor 可能 non-contiguous，不能直接 `.view(...)`。

- 如果必须重排内存，需要 `.contiguous()`。

---

## 7. Tensor Operations

### 7.1 Elementwise operations

Elementwise 操作对每个元素单独作用，输出通常 shape 不变。

| 操作                     | 含义                              |
| ------------------------ | --------------------------------- |
| `x.pow(2)`               | 平方                              |
| `x.sqrt()`               | 平方根                            |
| `x.rsqrt()`              | reciprocal sqrt，即 `1 / sqrt(x)` |
| `x + x`                  | elementwise addition              |
| `x * 2`                  | scalar multiplication             |
| `x / 0.5`                | scalar division                   |
| `torch.ones(3,3).triu()` | 取上三角                          |

`triu` 可用于 causal attention mask。

### 7.2 Matrix multiplication

矩阵乘法是深度学习计算核心：

```python
x = torch.ones(16, 32)
w = torch.ones(32, 2)
y = x @ w
# y shape: [16, 2]
```

带 batch / sequence 维度：

```python
x = torch.ones(4, 8, 16, 32)
w = torch.ones(32, 2)
y = x @ w
# y shape: [4, 8, 16, 2]
```

解释：前面的 batch-like 维度会被保留，只在最后两个矩阵维度上做乘法。

---

## 8. einops 与 jaxtyping

传统 PyTorch 代码容易写出难懂的维度操作：

```python
z = x @ y.transpose(-2, -1)
```

问题：`-2`、`-1` 的含义不直观，维度多时容易错。

### 8.1 jaxtyping

用于在代码里标注 tensor shape，主要是文档作用：

```python
x: Float[torch.Tensor, "batch seq heads hidden"]
```

注意：讲义里强调这只是 documentation，不自动 enforce。

### 8.2 einops.einsum

广义矩阵乘法，显式命名维度：

```python
z = einsum(
    x, y,
    "batch seq1 hidden, batch seq2 hidden -> batch seq1 seq2"
)
```

规则：没有出现在输出里的维度会被 sum 掉。

支持 `...` 表示任意 batch-like 前缀维度：

```python
z = einsum(x, y, "... seq1 hidden, ... seq2 hidden -> ... seq1 seq2")
```

### 8.3 einops.reduce

```python
y = reduce(x, "... hidden -> ...", "sum")
```

等价于对 hidden 维度求和。

### 8.4 einops.rearrange

拆分维度：

```python
x = rearrange(x, "... (heads hidden1) -> ... heads hidden1", heads=2)
```

合并维度：

```python
x = rearrange(x, "... heads hidden2 -> ... (heads hidden2)")
```

复习重点：einops 的价值是让维度语义显式化，减少 shape bug。

---

## 9. FLOPs Accounting

### 9.1 FLOPs vs FLOP/s

| 名称   | 含义                                |
| ------ | ----------------------------------- |
| FLOPs  | floating-point operations，总计算量 |
| FLOP/s | 每秒浮点运算数，硬件速度            |

### 9.2 数量级直觉

| 项目  | 训练 FLOPs    |
| ----- | ------------- |
| GPT-3 | 约 `3.14e23`  |
| GPT-4 | 传闻约 `2e25` |

硬件峰值：

| GPU  | 讲义中使用的峰值                           |
| ---- | ------------------------------------------ |
| A100 | `312e12` FLOP/s for bf16/fp16 tensor cores |
| H100 | `1979e12 / 2` dense FLOP/s for bf16/fp16   |

### 9.3 Matmul FLOPs

对：

```
(B × D) @ (D × K)
```

每个输出元素需要 D 次乘法和 D 次加法，近似：

```
2 × B × D × K FLOPs
```

解释：

```
B = data points / tokens
D × K = parameters
forward FLOPs ≈ 2 × tokens × parameters
```

这一近似对 Transformer 的大头计算也一阶成立。

### 9.4 其他操作 FLOPs

| 操作                       | FLOPs 量级 |
| -------------------------- | ---------- |
| elementwise on `m × n`     | `O(mn)`    |
| matrix addition `m × n`    | `mn`       |
| matmul `(m × n) @ (n × p)` | `2mnp`     |

结论：大矩阵乘法通常支配深度学习计算。

### 9.5 MFU

Model FLOPs Utilization：

```
MFU = actual FLOP/s / promised FLOP/s
```

实际测量：

```python
actualtime = timematmul(x, w)
actualfloppersec = actualnumflops / actualtime
mfu = actualfloppersec / promisedfloppersec
```

```js
torch.cuda.synchronize()
start = time.time()

y = x @ w

torch.cuda.synchronize()
end = time.time()
```

经验：

- MFU >= 0.5 通常已经不错。

- 如果 matmul 占比高，MFU 往往更高。

- bf16 通常比 fp32 实际 FLOP/s 高很多。

---

## 10. Autograd 与 Gradients

### 10.1 基本例子

模型：

```
y = 0.5 × (x @ w - 5)^2
```

代码：

```python
x = torch.tensor([1., 2, 3])
w = torch.tensor([1., 1, 1], requiresgrad=True)
predy = x @ w
loss = 0.5  (predy - 5).pow(2)
loss.backward()
```

只有 `requires_grad=True` 的 leaf tensor 会默认保存 `.grad`：

| 对象     | `.grad`                           |
| -------- | --------------------------------- |
| `w`      | 有                                |
| `x`      | 无，因为没有 `requires_grad=True` |
| `pred_y` | 默认无，因为不是 leaf             |
| `loss`   | 默认无                            |

如果要看中间变量梯度：

```python
h1.retaingrad()
```

### 10.2 backward FLOPs

两层线性模型：

```
x --w1--> h1 --w2--> h2 -> loss
```

forward：

```
h1 = x @ w1
h2 = h1 @ w2
```

以 `w2` 为例：

```
w2.grad[j,k] = sumi h1[i,j] × h2.grad[i,k]
h1.grad[i,j] = sumk w2[j,k] × h2.grad[i,k]
```

总结：

```
Forward pass  ≈ 2 × data points × parameters
Backward pass ≈ 4 × data points × parameters
Total         ≈ 6 × data points × parameters
```

这也是前面 `6 × 参数量 × tokens` 的来源。

---

## 11. `nn.Parameter`、`nn.Module` 与初始化

### 11.1 `nn.Parameter`

模型参数存为：

```python
w = nn.Parameter(torch.randn(inputdim, outputdim))
```

特点：

- 本质上仍是 Tensor。

- 被 `nn.Module` 注册后，会出现在 `model.parameters()` 和 `state_dict()` 中。

### 11.2 初始化问题

如果：

```python
w = torch.randn(inputdim, outputdim)
x = torch.randn(inputdim)
output = x @ w
```

那么 output 的尺度会随 `sqrt(input_dim)` 增长，input_dim 很大时容易造成不稳定。

改进：

```python
w = torch.randn(inputdim, outputdim) / np.sqrt(inputdim)
```

这与 Xavier initialization 思想接近：让输出尺度不随输入维度爆炸。

更安全：

```python
nn.init.truncnormal(
    torch.empty(inputdim, outputdim),
    std=1 / np.sqrt(inputdim),
    a=-3,
    b=3,
)
```

---

## 12. 自定义模型结构

### 12.1 Linear layer

```python
class Linear(nn.Module):
    def init(self, inputdim: int, outputdim: int):
        super().init()
        self.weight = nn.Parameter(
            torch.randn(inputdim, outputdim) / np.sqrt(inputdim)
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return x @ self.weight
```

重点：

- 参数必须注册为 `nn.Parameter`。

- forward 里定义计算。

### 12.2 Cruncher 模型

```python
class Cruncher(nn.Module):
    def init(self, dim: int, numlayers: int):
        super().init()
        self.layers = nn.ModuleList([
            Linear(dim, dim)
            for i in range(numlayers)
        ])
        self.final = Linear(dim, 1)

    def forward(self, x):
        B, D = x.size()
        for layer in self.layers:
            x = layer(x)
        x = self.final(x)
        x = x.squeeze(-1)
        return x
```

相关 API：

| API                  | 作用                       |
| -------------------- | -------------------------- |
| `nn.Module`          | 所有模型/层的基类          |
| `nn.ModuleList`      | 注册一组子模块             |
| `model.state_dict()` | 参数名到 tensor 的字典     |
| `model.parameters()` | 迭代所有参数               |
| `model.to(device)`   | 把模型参数移动到设备       |
| `param.numel()`      | 参数元素数量               |
| `x.squeeze(-1)`      | 去掉最后一个 size=1 的维度 |

参数量计算：

```python
sum(param.numel() for param in model.parameters())
```

---

## 13. Data Loading

语言模型数据是 tokenizer 输出的整数序列。

### 13.1 保存与加载 token ids

```python
origdata = np.array([...], dtype=np.int32)
origdata.tofile("data.npy")
data = np.memmap("data.npy", dtype=np.int32)
```

为什么用 memmap：

- 真实训练数据可能 TB 级。

- 不想一次性加载到内存。

- memmap 只在访问时读取需要的片段。

### 13.2 batch sampling

```python
startindices = torch.randint(len(data) - sequencelength, (batchsize,))
x = torch.tensor([
    data[start:start + sequencelength]
    for start in startindices
])
```

输出 shape：

```
[batchsize, sequencelength]
```

### 13.3 pinned memory

```python
x = x.pinmemory()
x = x.to(device, nonblocking=True)
```

作用：

- CPU pinned memory 可以更高效地传到 GPU。

- `non_blocking=True` 允许异步拷贝。

- 理想情况下可以 overlap：

- CPU 准备下一个 batch
  - GPU 处理当前 batch

---

## 14. Randomness 与可复现

随机性来源：

- 参数初始化

- dropout

- data ordering

- batch sampling

调试时固定随机种子：

```python
seed = 0
torch.manualseed(seed)
np.random.seed(seed)
random.seed(seed)
```

观念：

- 可复现不是为了漂亮，而是为了 debug。

- 对不同用途可以使用不同 seed，但要显式管理。

---

## 15. Optimizers

### 15.1 SGD

更新规则：

```
p = p - lr × grad
```

讲义实现：

```python
class SGD(torch.optim.Optimizer):
    def init(self, params, lr=0.01):
        super().init(params, dict(lr=lr))

    def step(self):
        for group in self.paramgroups:
            lr = group["lr"]
            for p in group["params"]:
                grad = p.grad.data
                p.data -= lr  grad
```

### 15.2 AdaGrad

核心思想：累计历史梯度平方，对经常更新的方向降低学习率。

```
g2 = g2 + grad²
p = p - lr × grad / sqrt(g2 + eps)
```

讲义实现：

```python
state = self.state[p]
g2 = state.get("g2", torch.zeroslike(grad))
g2 += torch.square(grad)
state["g2"] = g2
p.data -= lr  grad / torch.sqrt(g2 + 1e-5)
```

### 15.3 优化器家族关系

| 优化器   | 直觉                             |
| -------- | -------------------------------- |
| SGD      | 直接沿负梯度方向走               |
| Momentum | SGD + gradient 的指数滑动平均    |
| AdaGrad  | SGD + 累计 `grad²` 做自适应缩放  |
| RMSProp  | AdaGrad + `grad²` 的指数滑动平均 |
| Adam     | Momentum + RMSProp               |

### 15.4 优化器内存

训练状态通常包括：

| 项               | 数量级                                              |
| ---------------- | --------------------------------------------------- |
| parameters       | `#params`                                           |
| gradients        | `#params`                                           |
| optimizer states | 依优化器而定，AdaGrad 至少 `#params`，Adam 通常更多 |
| activations      | 与 batch size、sequence length、层数有关            |

讲义中简单模型 float32 总内存：

```
totalmemory = 4 × (parameters + activations + gradients + optimizerstates)
```

一步训练 compute：

```
flops = 6 × batchsize × numparameters
```

---

## 16. Training Loop

标准训练循环：

```python
for t in range(numtrainsteps):
    x, y = getbatch(B=B)

    predy = model(x)
    loss = F.mseloss(predy, y)

    loss.backward()

    optimizer.step()
    optimizer.zerograd(settonone=True)
```

步骤拆解：

| 步骤           | 作用            | 资源影响                               |
| -------------- | --------------- | -------------------------------------- |
| get batch      | 准备数据        | CPU/GPU transfer，data loader overhead |
| forward        | 计算预测和 loss | 保存 activations，占显存               |
| backward       | 计算 gradients  | 通常约 2 倍 forward FLOPs              |
| optimizer step | 更新参数        | 读写参数、梯度、优化器状态             |
| zero grad      | 清空梯度        | `set_to_none=True` 可释放/减少内存     |

讲义里虽然 `train` 函数传入了 `lr`，但示例实现中 optimizer 写成了 `lr=0.01`，这是教学代码里的简化/小瑕疵；复习概念时记住训练循环结构即可。

`optimizer.zero_grad(set_to_none=True)`

和普通清零不同：

| **写法**          | **行为**                |
| ----------------- | ----------------------- |
| set_to_none=False | 把 grad tensor 填成 0   |
| set_to_none=True  | 把 param.grad 设为 None |

好处：

- 少一次大 tensor 的 zero-fill。

- 可能省内存。

- 下一次 backward 时重新创建 grad。

但手写 optimizer 时要小心：

`if p.grad is not None:
    ...`

否则会遇到 NoneType。

---

## 17. Checkpointing

语言模型训练时间长，训练过程中 crash 是常态，所以需要周期保存。

保存：

```python
checkpoint = {
    "model": model.statedict(),
    "optimizer": optimizer.statedict(),
}
torch.save(checkpoint, "modelcheckpoint.pt")
```

加载：

```python
loadedcheckpoint = torch.load("modelcheckpoint.pt")
model.loadstatedict(loadedcheckpoint["model"])
optimizer.loadstatedict(loadedcheckpoint["optimizer"])
```

checkpoint 应至少包含：

- model weights

- optimizer states

- training step

- random states

- lr scheduler state

- config / hyperparameters

讲义代码只展示了 model 和 optimizer 的核心形式。

---

## 18. Mixed Precision Training

高精度与低精度权衡：

| 精度            | 优点       | 缺点       |
| --------------- | ---------- | ---------- |
| 高精度 fp32     | 稳定、准确 | 显存大、慢 |
| 低精度 bf16/fp8 | 显存小、快 | 可能不稳定 |

目标：best of both worlds。

讲义给出的策略：

```
默认使用 float32
能安全低精度的地方用 bfloat16 / fp8
```

具体：

- forward pass / activations 用 bf16 或 fp8。

- 参数、梯度等关键状态保留 fp32。

- PyTorch AMP 提供自动 mixed precision。

- NVIDIA Transformer Engine 支持 FP8 linear layers。

PyTorch AMP 典型形式：

```python
with torch.autocast(devicetype="cuda", dtype=torch.bfloat16):
    pred = model(x)
    loss = lossfn(pred, y)
```

---

## 19. Helper Functions 总表

| 函数                                       | 作用                              | 核心逻辑                                             |
| ------------------------------------------ | --------------------------------- | ---------------------------------------------------- |
| `get_memory_usage(x)`                      | 计算 tensor 内存                  | `x.numel() * x.element_size()`                       |
| `get_promised_flop_per_sec(device, dtype)` | 根据 GPU 和 dtype 返回理论 FLOP/s | A100/H100 + fp32/bf16/fp16 分支                      |
| `same_storage(x, y)`                       | 判断两个 tensor 是否共享 storage  | 比较 `untyped_storage().data_ptr()`                  |
| `time_matmul(a, b)`                        | 测量 `a @ b` 时间                 | CUDA synchronize + `timeit`                          |
| `get_num_parameters(model)`                | 统计模型参数量                    | `sum(param.numel() for param in model.parameters())` |
| `get_device(index=0)`                      | 优先返回 GPU，否则 CPU            | `cuda:{index}` or `cpu`                              |

---

## 20. PyTorch / NumPy API 速查

| API                                        | 用途                           |
| ------------------------------------------ | ------------------------------ |
| `torch.tensor`                             | 从数据创建 tensor              |
| `torch.zeros` / `ones` / `randn` / `empty` | 常见初始化                     |
| `nn.init.trunc_normal_`                    | 截断正态初始化                 |
| `x.numel()`                                | 元素数量                       |
| `x.element_size()`                         | 每个元素 bytes                 |
| `x.dtype`                                  | 数据类型                       |
| `x.device`                                 | 所在设备                       |
| `x.to(device)`                             | 移动设备或转换 dtype           |
| `x.pin_memory()`                           | pinned CPU memory              |
| `x.view(...)`                              | 视图 reshape，要求 stride 兼容 |
| `x.transpose(dim0, dim1)`                  | 交换维度                       |
| `x.contiguous()`                           | 转成连续内存，可能复制         |
| `x.is_contiguous()`                        | 是否内存连续                   |
| `x.stride(dim)`                            | 查看 stride                    |
| `x.pow` / `sqrt` / `rsqrt`                 | elementwise 数学操作           |
| `x.triu()`                                 | 上三角                         |
| `@`                                        | matmul                         |
| `loss.backward()`                          | 反向传播                       |
| `h.retain_grad()`                          | 保存中间变量梯度               |
| `F.mse_loss`                               | 均方误差 loss                  |
| `nn.Parameter`                             | 注册模型参数                   |
| `nn.Module`                                | 模型基类                       |
| `nn.ModuleList`                            | 注册多个子模块                 |
| `model.state_dict()`                       | 模型状态                       |
| `optimizer.state_dict()`                   | 优化器状态                     |
| `torch.save` / `torch.load`                | 保存/加载 checkpoint           |
| `np.memmap`                                | 懒加载大数组                   |
| `np.random.seed`                           | NumPy 随机种子                 |
| `torch.manual_seed`                        | PyTorch 随机种子               |

---

## 21. 最终复习框架

### 如果问“这节课讲了什么？”

它讲的是训练语言模型的底层工程基础：用 PyTorch 表示数据、参数和计算，并用 memory 与 FLOPs 对训练过程做资源核算。

### 如果问“最重要公式是什么？”

```
memory = numel × elementsize
matmul FLOPs = 2mnp
forward FLOPs ≈ 2 × tokens × parameters
backward FLOPs ≈ 4 × tokens × parameters
training FLOPs ≈ 6 × tokens × parameters
MFU = actual FLOP/s / promised FLOP/s
```

### 如果问“最重要观念是什么？”

- 大模型训练首先是资源管理问题。

- Tensor 的 dtype、device、storage layout 会直接影响效率。

- Matmul 主导计算成本。

- Backward 比 forward 更贵。

- Optimizer state 也会吃大量显存。

- 数据加载、checkpoint、随机性管理是训练可靠性的基础。

- Mixed precision 是现代大模型训练效率的关键。
