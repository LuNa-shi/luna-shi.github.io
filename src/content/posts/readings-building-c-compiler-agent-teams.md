---
title: Building C compiler with agent teams
date: '2026-05-13'
overview: >-
  TLDR: A practical multi-agent software pipeline can stay simple: split compiler work across coding agents, isolate
  tasks, and judge progress with integration tests.
description: >-
  TLDR: A practical multi-agent software pipeline can stay simple: split compiler work across coding agents, isolate
  tasks, and judge progress with integration tests.
tags:
  - readings
categories:
  - reading
  - agents
math: true
toc: true
relatedPosts: true
---

<!-- notion-sync: 3524e07a-a023-801e-b99b-cabbe0723411 parent=Readings url=https://app.notion.com/p/3524e07aa023801eb99bcabbe0723411 -->

下面默认把 **MAS** 理解为 **Multi-Agent System / 多智能体系统**。这篇文章最值得注意的一点是：Anthropic 做的并不是一个“高大上、中心化、强规划”的多智能体平台，而是一个非常朴素但有效的 **自主软件工程流水线**：

**多个 Claude Code 实例并行运行；Git 仓库充当共享工作区；**`**current_tasks/**`** 文件充当任务锁；测试系统充当裁判；README / progress 文件充当长期记忆；人类主要负责设计目标和验证环境，而不是实时 pair-programming。**

它的本质是：**把“写一个能编译 Linux 的 C 编译器”这个巨大目标，变成成千上万个可自动发现、可并行修复、可测试验证的小问题。**

---

## **1. 项目到底做到了什么**

Anthropic 让 **16 个 Claude 实例**并行工作，目标是从零写一个 Rust 实现的 C 编译器，最终产物大约是 **10 万行代码**，能构建 Linux 6.9，并支持 x86、ARM、RISC-V 等目标架构；整个过程接近 **2,000 个 Claude Code session**，API 成本约 **2 万美元**。原文强调，这个实验的重点不是“编译器本身有多可用”，而是研究如何设计一个能让长时间运行的 agent team 自主推进大型软件项目的 harness。

公开仓库中的 README 也说明，这个项目是一个从零写的 Rust C 编译器，包含 frontend、SSA IR、优化器、代码生成、peephole optimizer、assembler、linker、DWARF debug info 等部分；仓库还明确提醒，除了 README 中一段人类说明外，代码和文档由 Claude Opus 4.6 写成，人类主要通过测试用例引导，而没有实时 pair-programming。

需要注意一个版本差异：原文发布时提到 assembler / linker 仍有外部 GCC 依赖和限制；当前公开仓库 README 则声称默认已使用内置 assembler 和 linker。也就是说，文章描述的是一个时间点上的实验状态，仓库可能在之后继续被 Claude 推进过。

---

## **2. MAS 的核心架构：不是“聊天群”，而是“Git 驱动的并行自循环”**

原文给出的核心 harness 非常简单：把 Claude Code 放进一个无限循环里，每次读取同一个 `AGENT_PROMPT.md`，完成一轮工作后立即开始下一轮。伪代码大意是：

```bash
while true; do
    COMMIT=$(git rev-parse --short=6 HEAD)
    LOGFILE="agentlogs/agent${COMMIT}.log"

    claude \
      --dangerously-skip-permissions \
      -p "$(cat AGENTPROMPT.md)" \
      --model claude-opus-X-Y \
      &> "$LOGFILE"
done
```

这个循环解决的是 **长任务续航问题**。普通 Claude Code session 通常会做一段时间，然后等人类继续指示；而这个 harness 强迫 agent 永远继续：完成一个任务后，自己找下一个任务。原文说 prompt 里会要求 Claude 把问题拆成小块、记录当前工作、判断下一步做什么，并持续推进到“完美”为止。

但真正让它成为 MAS 的，是下面这一层：

```
                    ┌──────────────────────────┐
                    │       upstream repo       │
                    │  shared Git bare repo     │
                    └─────────────┬────────────┘
                                  │
        ┌─────────────────────────┼─────────────────────────┐
        │                         │                         │
┌───────▼───────┐         ┌───────▼───────┐         ┌───────▼───────┐
│ Agent 1 VM    │         │ Agent 2 VM    │   ...   │ Agent 16 VM   │
│ /workspace    │         │ /workspace    │         │ /workspace    │
│ local clone   │         │ local clone   │         │ local clone   │
└───────┬───────┘         └───────┬───────┘         └───────┬───────┘
        │                         │                         │
        │ claim task file          │ claim task file          │ claim task file
        │ modify code              │ modify code              │ modify code
        │ run tests                │ run tests                │ run tests
        │ pull/merge/push          │ pull/merge/push          │ pull/merge/push
        ▼                         ▼                         ▼
              currenttasks/.txt + code + docs + tests
```

每个 agent 在自己的 Docker 容器里 clone 一份本地仓库，到 `/workspace` 工作；共享的 bare repo 挂载在 `/upstream`。完成任务后，agent pull 上游、合并其他 agent 的改动、push 自己的改动，然后释放任务锁。原文明确说没有专门的 orchestration agent，也没有实现复杂的 agent 间通信，高层目标管理也基本交给每个 Claude 自己判断。

这非常关键：**这个 MAS 的协作不是靠“多 agent 开会”，而是靠共享状态。**

共享状态包括：

```
1. Git history         —— 谁改了什么
2. currenttasks/      —— 哪些任务正在被占用
3. README / docs       —— 当前架构、进度、注意事项
4. tests / CI          —— 当前系统是否正确
5. logs                —— 失败原因、错误输出、可 grep 的诊断信息
```

这更像一个 **blackboard architecture**：所有 agent 不直接互相聊天，而是在同一块“黑板”上读写代码、任务、文档和测试结果。

---

## **3. 任务锁：用 Git 文件冲突实现最小化调度**

它的任务分配机制也很朴素。Claude 要做某个任务时，会在 `current_tasks/` 下面写一个文本文件，比如：

```
currenttasks/parseifstatement.txt
currenttasks/codegenfunctiondefinition.txt
```

写这个文件就等于“拿锁”。如果两个 agent 同时想做同一个任务，Git 同步时会产生冲突，后来的 agent 就必须换一个任务。原文说 merge conflict 经常发生，但 Claude 通常能自己处理。

公开仓库里现在还能看到这类任务文件，例如：

```
fixarmasmcaspalinstruction.txt
fixx86standalonekernellinkerrors.txt
implementstringliteraldeduplication.txt
```

其中一个 ARM 任务文件写得非常具体：要给 ARM assembler 增加 CASP/CASPA/CASPL/CASPAL 指令支持，指出这些是 Linux kernel 在 `mm/slub.o` 等核心内存管理代码中使用的 LSE atomic compare-and-swap pair 指令，并列出了需要修改的文件。另一个 x86 任务文件则定位到 kernel standalone link errors，包括复杂符号表达式解析、numeric forward label、`.altinstructions` 宏展开等问题。

这说明任务粒度已经不是“写一个编译器”，而是这种级别：

```
修 ARM assembler 的一条指令编码
修 x86 linker 对复杂 relocation expression 的解析
修 preprocessor 宏参数替换
修 i686 double 参数高位存储
修 RISC-V vaarg long double struct
修 string literal deduplication
```

这就是 MAS 能工作的根本原因：**大项目被测试失败不断切碎，变成许多互相相对独立的小修复。**

---

## **4. Prompt 的真实作用：不是详细教它怎么写编译器，而是让它持续自管理**

原文说，人类给了一个高层目标：从零写一个优化 C 编译器、无依赖、GCC-compatible、能编译 Linux kernel、支持多个 backend，并指定了一些设计方向，比如使用 SSA IR，但没有详细告诉 Claude 如何实现。

这意味着 prompt 的作用大概不是：

```
请实现 lexer
请实现 parser
请实现 SSA
请实现 x86 backend
```

而更接近：

```
你在一个长期运行的项目里。
目标：让这个编译器越来越接近 GCC-compatible，最终能编译 Linux。
你需要：
- 检查当前仓库状态
- 阅读 README / progress / currenttasks
- 找一个没有被占用的失败点
- 写任务锁
- 修代码
- 跑相关测试
- 更新文档和进度
- pull/merge/push
- 继续下一个任务
```

这类 prompt 把 Claude 从“回答问题的模型”变成“持续工作的工程代理”。

也就是说，人类真正设计的是 **agent operating protocol**，不是每一步的工程实现。

---

## **5. 编译器架构为什么适合 MAS**

这个项目选“C 编译器”并不是偶然。编译器天然有清晰的阶段边界：

```
C source
  ↓
preprocessor
  ↓
lexer
  ↓
parser
  ↓
semantic analysis
  ↓
AST
  ↓
IR lowering
  ↓
SSA IR
  ↓
optimization passes
  ↓
non-SSA IR
  ↓
architecture-specific codegen
  ↓
assembly
  ↓
object file
  ↓
linker
  ↓
ELF executable
```

公开设计文档也描述了类似 pipeline：frontend 负责 preprocessor、lexer、parser、sema；IR 子系统负责 lowering 和 mem2reg；passes 里有 constant folding、copy propagation、DCE、GVN、LICM、CFG simplify、inlining 等；backend 通过 trait-based architecture 支持 x86-64、i686、AArch64、RISC-V，并包含 assembler 和 linker。

这种架构对 MAS 友好，因为它满足三个条件：

第一，**模块边界清晰**。一个 agent 可以修 preprocessor，另一个可以修 ARM assembler，第三个可以修 x86 register allocation，不一定踩到同一片代码。

第二，**正确性比较容易外部验证**。编译器可以用测试程序、开源项目、GCC oracle、运行结果、exit code、stdout、kernel boot 等方式验证。

第三，**失败可以局部化**。比如某个 C 文件编译失败，可能是宏展开、类型系统、ABI、指令编码、relocation、linker 之一；错误日志和最小复现可以把问题压缩到某个组件。

所以，这个 MAS 不是“无中生有地解决一个模糊问题”，而是在一个可测试、可分层、可局部修复的工程空间里做大规模搜索。

---

## **6. 测试系统才是真正的“老板”**

原文最重要的经验是：**agent loop 只有在 Claude 能判断自己是否进步时才有用**。作者说，大部分精力不是花在 agent 通信上，而是花在设计 Claude 周围的环境：测试、反馈、日志、验证器。

原因很简单：

```
如果测试不可靠，agent 会优化错误目标。
如果错误输出太长，agent 会被上下文污染。
如果测试太慢，agent 会把大量时间浪费在等待上。
如果没有回归保护，agent 会修一个功能、破坏三个功能。
```

原文提到，作者需要寻找高质量 compiler test suites，为开源项目写 verifier 和 build scripts，观察 Claude 常犯的错，然后针对性补测试。项目后期 Claude 经常在实现新功能时破坏旧功能，于是作者加入 CI 和更严格的回归约束，让新 commit 不能轻易破坏已有功能。

公开仓库 README 也显示，测试分两类：Rust 源码里的 unit tests，以及 `tests/` 目录下的 integration tests。integration test 的形式是每个目录包含 `main.c`、期望 stdout、期望 return code 等，运行方式是用 `ccc` 编译 C 程序、执行产物、比较输出和退出码。

这就是整个 MAS 的控制论闭环：

```
测试失败
  ↓
agent 读取失败日志
  ↓
agent 选择一个失败点
  ↓
写任务锁
  ↓
修改代码
  ↓
跑 fast tests / targeted tests
  ↓
如果通过，则提交
  ↓
CI 防止回归
  ↓
下一个 agent 在新状态上继续
```

这比“让多个 agent 互相评价”更可靠，因为最终裁判不是另一个 LLM，而是可执行测试。

---

## **7. 上下文管理：日志必须适合 LLM 阅读**

原文有一个非常实用的点：测试 harness 不是给人看的，而是给 Claude 看的。

作者提到两类 LLM 特有问题：

**第一，context window pollution。** 测试系统不能输出几千行没用文本。它应该只在上下文里打印几行摘要，把详细信息写入日志；错误行最好包含 `ERROR` 和原因，方便 Claude 用 `grep` 找到。还可以预先计算汇总统计，避免 Claude 自己重复扫描大量日志。

**第二，time blindness。** Claude 对时间不敏感，可能花几个小时跑测试而不推进。为了解决这个问题，harness 提供默认 `--fast` 选项，只跑 1% 或 10% 的随机样本；这个样本对每个 agent 是确定性的，但不同 VM 之间随机不同，所以总体上仍能覆盖很多文件，同时每个 agent 又能稳定复现自己的回归。

这点非常前沿：MAS 的性能瓶颈不只是模型能力，还包括 **反馈信号的可读性**。

对人类来说，长日志无非麻烦一点；对 LLM agent 来说，长日志会污染上下文、稀释关键信号、浪费 token，并诱导它走错方向。

---

## **8. 并行为什么一开始有效，后来在 Linux kernel 上失效**

在普通 compiler test suite 阶段，并行很自然：有几百个失败测试，每个 agent 选一个失败测试修。等测试通过率达到 99% 左右后，agent 进一步并行处理不同的小型开源项目，比如 SQLite、Redis、libjpeg、QuickJS、Lua 等。

但到了 Linux kernel，问题发生了变化。

Linux kernel 构建不是几百个独立小测试，而是一个巨大的整体任务。所有 agent 可能都会撞到同一个最早失败点，然后同时修同一个 bug，互相覆盖。这时 16 个 agent 并不会带来 16 倍效率，反而可能增加冲突。原文明确说，编译 Linux kernel 时 agent 一开始卡住了，因为大家都在解决同一个问题。

Anthropic 的解决方案非常聪明：使用 GCC 作为 **known-good oracle**，把一个整体任务重新切成可并行任务。

大致算法是：

```
给定 Linux kernel 的大量 .c 文件：

1. 大部分文件用 GCC 编译。
2. 随机挑一小部分文件用 Claude 的 C 编译器编译。
3. 如果最终 kernel 正常，说明这批 CCC 编译的文件大概率没问题。
4. 如果失败，说明问题可能在这批 CCC 文件里。
5. 继续缩小范围：把其中一部分切回 GCC，另一部分保留 CCC。
6. 重复，直到定位到具体文件、具体组合、具体失败模式。
7. 把这些失败点变成 currenttasks/ 下的小任务。
```

原文说，这让每个 agent 能在不同文件、不同 bug 上并行工作；之后还需要 delta debugging，找出“单独编译都没问题，但组合在一起会失败”的文件对。

这是整篇文章里最关键的 MAS 技术细节之一：**当任务不可并行时，不是增加 agent，而是重新设计 verifier，把整体目标切回可并行的局部目标。**

---

## **9. 多角色 agent：不是所有 agent 都写功能**

原文还提到，MAS 可以利用 specialization。比如：

```
Agent A：修实际功能 bug
Agent B：合并重复代码，减少 re-implementation
Agent C：提高编译器自身性能
Agent D：提高生成代码质量
Agent E：从 Rust 开发者角度批判架构并重构
Agent F：维护文档
```

作者特别指出，LLM 写代码常会重复实现已有功能，所以专门放一个 agent 做 duplicate code coalescing。另有 agent 负责 compiler performance、generated code efficiency、Rust design review、documentation。

这说明它的 MAS 分工不只是“把 bug 平分给 16 个 agent”，而是混合了几种角色：

```
1. Feature agents      —— 增加语言特性、架构支持
2. Bugfix agents       —— 修 failing tests / failing projects
3. Regression agents   —— 保证旧功能不坏
4. Refactor agents     —— 合并重复代码、改善架构
5. Performance agents  —— 优化编译速度或产物效率
6. Documentation agents—— 更新 README、progress、设计说明
```

但这些角色仍然不是由中央 scheduler 精细调度的。文章说整体很 bare-bones，很多情况下是 Claude 自己选择“下一个最明显的问题”。

---

## **10. 为什么它能完成大型项目：五个必要条件**

我把这套 MAS 的成功条件总结成五个。

### **条件一：目标可以被客观验证**

“写一个好用的产品”很难自动验证；“这个 C 程序能否编译、运行、输出正确结果”容易验证。

C 编译器项目非常适合 autonomous agents，因为它有天然 oracle：

```
- GCC / Clang 作为行为对照
- compiler torture tests
- 开源项目 test suite
- Linux kernel 是否能 build
- QEMU 里 kernel 是否能 boot
- stdout / return code 是否匹配
```

原文提到，该编译器通过了大量 compiler test suite，并能编译 Linux 6.9、QEMU、FFmpeg、SQLite、Postgres、Redis 等项目，还能编译运行 Doom；公开仓库当前 README 也列出了 PostgreSQL、SQLite、QuickJS、zlib、Lua、Redis、DOOM、FFmpeg、Busybox、CPython、QEMU 等项目状态。

### **条件二：大目标能被失败样例自然切碎**

每个 failing test、每个 failing C file、每个 failing project 都是一个潜在任务。

例如公开的 `current_tasks` 文件已经是非常细粒度的 bug ticket：ARM CASP 指令、x86 kernel link expression、macro substitution、RISC-V `va_arg` 等。

这让 16 个 agent 有活可干，而且多数时候不会完全踩在一起。

### **条件三：架构有阶段边界**

编译器 pipeline 本身把系统拆成 frontend、IR、passes、backend、assembler、linker。设计文档也强调，每个阶段有明确输入输出；frontend 在 text/token/AST 上工作，IR 子系统在 alloca-based IR 和 SSA IR 上工作，backend 在 non-SSA IR 上工作。

这降低了并行修改的冲突概率。

### **条件四：共享记忆不靠聊天，而靠代码和文档**

每个 Claude session 可能是短暂的、无长期记忆的，所以项目要求维护大量 README 和 progress 文件，帮助新 agent 快速 orient。原文明确说，每个 agent 会被丢进 fresh container，没有上下文，因此文档和进度文件非常重要。

这相当于把“团队记忆”外化到仓库里。

### **条件五：人类没有消失，而是转移到“环境设计者”角色**

作者并不是完全放手。他主要做的是：

```
- 写总体目标
- 设计 harness
- 找高质量测试套件
- 写 verifier 和 build scripts
- 观察 agent 常见失败模式
- 针对失败模式补测试
- 建 CI 防止回归
- 设计 Linux kernel 的 GCC oracle / delta debugging 方法
```

原文也说，大部分努力花在设计 Claude 周围的环境，而不是手把手写代码。

这说明未来的大型 MAS 工程里，人类角色会从“直接写每一行代码”转向“设计奖励函数、验证器、任务分解机制和安全边界”。

---

## **11. 一个更具体的 agent 工作循环**

把原文和仓库信息综合起来，一个 agent 的单轮工作大概是这样：

```
Step 1: 启动
- 进入 fresh Docker container
- clone /workspace
- 读取 AGENTPROMPT.md
- 查看 README、DESIGNDOC、progress 文件、currenttasks

Step 2: 选择任务
- 查看当前 failing tests / build failures / ideas
- 避免 currenttasks 中已被锁定的问题
- 选择一个“小而明确”的问题
- 在 currenttasks/xxx.txt 写任务锁

Step 3: 定位问题
- 运行 fast tests
- grep ERROR 日志
- 找最小失败样例
- 对照 GCC / 期望输出 / kernel build log

Step 4: 修改代码
- 改 frontend / IR / backend / assembler / linker / tests
- 尽量只改当前任务相关部分
- 必要时新增 regression test

Step 5: 验证
- 跑目标测试
- 跑 fast regression sample
- 如果失败，继续修
- 如果通过，更新 README / progress

Step 6: 合并
- git pull upstream
- 处理 merge conflict
- 再跑关键测试
- push
- 删除 currenttasks/xxx.txt

Step 7: 下一轮
- 当前 Claude Code session 结束
- 外层 while true 再启动新的 session
```

这个循环看似简单，但足以产生大量增量改动。真正的“智能”并不只在模型里，而在这个闭环里：

```
模型能力 × 自动执行 × Git 同步 × 测试反馈 × 文档记忆 × 任务锁
```

---

## **12. 这不是传统项目管理，而是“测试驱动的群体爬山”**

传统工程团队通常是：

```
架构师设计模块
PM 分配任务
工程师实现
review
CI
release
```

这个实验更像：

```
给一个巨大目标
让测试系统暴露失败梯度
多个 agent 从不同失败点向上爬
每个通过的 patch 都提升整体 pass rate
CI 阻止明显倒退
文档帮助后续 agent 继续爬
```

所以它不是强计划式的，而是 **opportunistic / failure-driven** 的。

这也解释了为什么它后期会遇到瓶颈。原文说，当新功能和 bugfix 经常破坏旧功能时，模型已经接近能力上限；一些限制包括 16-bit x86 real mode 支持不足、生成代码效率差、不是成熟编译器的 drop-in replacement、Rust 代码质量不如专家等。

换句话说：

```
MAS 可以把模型能力横向扩展，
但不能完全消除模型本身在全局架构、一致性、深层正确性上的限制。
```

---

## **13. 如果要复刻这类 MAS，关键不是“多开几个 agent”**

很多人读这篇文章容易误解为：

“我只要开 16 个 Claude，就能自动写大型项目。”

实际不是。真正可复用的是这套工程方法：

```
1. 选择一个有强验证器的问题
2. 把仓库设计成 agent 可读、可测试、可恢复
3. 把长任务拆成大量 failing-test-sized tasks
4. 用 Git / 文件锁做最低限度同步
5. 用 CI 和回归测试防止破坏
6. 用短摘要 + 可 grep 日志保护上下文
7. 用 fast deterministic sampling 避免 agent 浪费时间
8. 给一部分 agent 做重构、文档、性能、质量控制
9. 当并行性消失时，重新设计测试 harness，而不是盲目增加 agent
```

最重要的一句话是：

**MAS 的上限不是 agent 数量，而是任务能否被验证、分解、隔离和持续反馈。**

这个 C 编译器项目成功，是因为“C 编译器”刚好具备这些特性：模块化、可测试、有 GCC oracle、有大量现成 test suite、有开源项目作为真实 benchmark、有 Linux kernel 作为 ultimate integration target。

---

## **14. 我对这篇文章的技术判断**

这篇文章代表的不是“agent 会自动接管软件工程”的简单叙事，而是一个更具体的方向：

**未来的大型自主开发系统，核心竞争力可能不是单个 agent 的 prompt，而是整个工程环境的设计：测试、日志、任务切分、共享记忆、冲突处理、oracle、CI、沙箱和人类监督。**

Anthropic 这个实验的先进性在于它证明了：

```
单个 agent 很容易在长任务中迷失；
但多个 agent + 好的验证环境 + 自动反馈，
可以把一个超大工程推进到以前很难想象的规模。
```

但它也同时证明：

```
没有高质量测试和人类验证，
“看起来能跑”的 autonomous code 很危险。
```

原文最后也表达了这种担忧：自主系统很容易让人看到测试通过就以为完成了，但实际软件质量、安全性和正确性仍需要认真验证。
