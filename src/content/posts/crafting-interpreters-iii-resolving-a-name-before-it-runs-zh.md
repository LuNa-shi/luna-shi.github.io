---
title: "Crafting Interpreters（三）：在运行之前确定名字"
subtitle: "Resolver 如何给每个变量使用点一条稳定路线"
series: "Crafting Interpreters: Following Lox from Source to Heap"
episode: 3
lang: zh
translationKey: crafting-interpreters-iii-resolving-a-name-before-it-runs
canonicalSlug: crafting-interpreters-iii-resolving-a-name-before-it-runs
book_scope: "Chapter 11"
figures: 4
date: 2026-07-01
overview: >-
  Resolver 会在运行前冻结变量身份：每个变量使用点要么得到固定的 local depth，要么明确走 global lookup，
  因此 closure 捕获的可变 environment 可以继续变化，但源码层面的 binding 不会改变。
description: "Resolver 如何给每个变量使用点一条稳定路线。"
image: /assets/img/blog/crafting-interpreters-iii-resolving-a-name-before-it-runs/fig1-one-use-one-binding.png
tags: [crafting-interpreters, interpreters, resolver, lexical-scope]
categories: [learning, systems]
toc: true
relatedPosts: true
---

# Crafting Interpreters（三）：在运行之前确定名字

## Resolver 如何给每个变量使用点一条稳定路线

TLDR: Resolver 会在运行前冻结变量身份。每个变量使用点要么得到固定的 local depth，要么明确走 global lookup，所以 closure 捕获的可变 environment 可以继续变化，但源码层面的 binding 不会改变。

上一篇让语法树真正跑了起来。表达式产生值，语句制造效果，environment 保存名字，函数调用创建新的 environment，closure 又让某个 environment 在原来的调用返回之后继续活着。

这解决了一个生命周期问题，但还没有解决名字绑定问题。

这一篇从一个小到有点可疑的程序开始：

```lox
var a = "global";

{
  fun showA() {
    print a;
  }

  showA();
  var a = "block";
  showA();
}
```

源码里只有一个 `print a;`。变量 `a` 从来没有被重新赋值。按照 Lox 的词法作用域规则，这一个变量使用点在整个执行过程中都应该指向同一个声明，所以期望输出是：

```text
global
global
```

但我们在 closure 之后得到的解释器可能会打印：

```text
global
block
```

给 `showA()` 里的那个变量表达式贴一个标签：

```text
U_a = print a 里面的 Expr.Variable("a") 节点
```

同一个 AST 节点运行了两次，却改变了自己的含义。这就是 bug。

技术承诺：读完这一篇，你应该能从源码里的一个变量表达式一路追到 `Resolver.scopes`，再追到 `Interpreter.locals`，最后追到 `getAt()` 或 `globals.get()`，并解释为什么修复后的解释器会打印两次 `global`，但并没有把 environment 改成不可变对象。

![Figure 1. One variable-use node keeps one declaration.](/assets/img/blog/crafting-interpreters-iii-resolving-a-name-before-it-runs/fig1-one-use-one-binding.png)

_图 1。`U_a` 的源码级绑定在执行前就已经决定。后面的 block 声明会在运行时出现，但在 `U_a` 所在的源码位置还不属于它。_

<!--
Figure prompt: Create a 1600×900 editorial diagram with English labels and a clean technical-blog style. Use the series color system: blue for source/syntax, purple for resolver/compiler state, green for runtime state, orange for the tracked variable use/value, red for invalid late binding, navy for headings and arrows. Title: "Resolving a name before it runs". Left half: a blue source-code card showing the Lox snippet with three highlighted rows: `var a = "global";` labeled `D_global`, `print a;` labeled `U_a`, and `var a = "block";` labeled `D_block`. Right half: a white decision panel labeled "lexical binding decision". Draw an orange node `U_a / Expr.Variable("a")`, a blue node `D_global / var a = "global"`, and a red node `D_block / later var a`. Draw a solid navy arrow from `U_a` to `D_global` labeled "preceding / innermost / enclosing". Draw a dashed red arrow from `U_a` to `D_block` with a large red X and the label "not preceding when U_a is written". Bottom-right note: "The resolver records this decision before execution. The same AST node can run twice without changing meaning." Keep spacing generous; avoid overlapping code labels with code text.
-->

## 1. 规则属于源码，不属于时间

Lox 使用词法作用域。一个变量使用点指向哪个声明，可以通过阅读程序文本决定，而不需要等到程序真的跑起来。

第 11 章里最关键的规则可以压成一句话：

> 一个变量使用点指向同名、在它之前出现、位于包住它的最内层作用域里的声明。

这句话里有三个关键词。

**在它之前出现**，意思是声明必须在源码文本里先于使用点。开头程序里，全局声明在 `U_a` 之前：

```lox
var a = "global"; // D_global
```

而 block 里的声明在包含 `U_a` 的函数体之后：

```lox
fun showA() {
  print a; // U_a
}

var a = "block"; // D_block
```

函数体确实会晚一点执行，但函数体的文本位置早就确定了。运行时的延迟不会改变 `print a;` 在源码里的位置。

**最内层** 用来处理 shadowing：

```lox
var a = "outer";
{
  var a = "inner";
  print a; // inner
}
```

两个声明都在使用点之前，但 block 里的声明处在最内层 enclosing scope，所以它赢。

**包住它** 则限制了搜索范围。文件里其他地方的同名声明不会因为拼写一样就成为候选项。

这个规则是静态的。它没有提 environment、函数调用、哈希表，也没有提 mutation。一个变量表达式可以执行很多次，但它的声明不应该每次重新选择。

现在的解释器却是在运行时动态查名字。大多数时候，动态搜索刚好和静态规则一致。Closure 把这个裂缝暴露了出来。

## 2. Closure 记住的是一个可变 environment

运行时，开头程序会经过三个重要状态。

首先，全局声明创建一个全局条目：

```text
global env
  a = "global"
```

然后进入 block，创建 block environment。解释器执行函数声明时，会创建一个 `LoxFunction`。这个函数对象保存两样东西：函数声明节点，以及创建函数时的当前 environment，也就是 closure。

```text
block env  # object B
  showA = <fn showA, closure → object B>
  enclosing → global env

global env
  a = "global"
```

这里的 `object B` 很重要。Closure 保存的不是 block 的冻结副本，也不是快照。它保存的是指向同一个可变 `Environment` 对象的引用。

现在第一次调用：

```lox
showA();
```

调用 `showA` 会创建一个新的 call environment，它的 parent 是函数的 closure：

```text
showA call env
  enclosing → object B

object B
  showA = <fn showA>
  enclosing → global env

global env
  a = "global"
```

旧解释器查找 `a` 时，会沿着当前 environment chain 往外走：

```text
call env: no a
object B: no a
global: a = "global"
```

所以第一次调用打印：

```text
global
```

然后执行这条声明：

```lox
var a = "block";
```

它不会创建第二个 block environment，而是把新条目插进同一个 object B：

```text
object B
  showA = <fn showA, closure → object B>
  a = "block"
  enclosing → global env
```

第二次调用会再次创建一个空的 call environment，仍然 enclosing object B。如果查找逻辑继续问 runtime chain：“今天谁叫 `a`？”，它现在会得到另一个答案：

```text
call env: no a
object B: a = "block"
```

Closure 并没有忘记什么。它记住的那个 environment 长出了一个新的条目。

![Figure 2. The captured block environment changes after the closure is created.](/assets/img/blog/crafting-interpreters-iii-resolving-a-name-before-it-runs/fig2-mutable-closure-environment.png)

_图 2。问题不是 `showA` 没有捕获 environment。它捕获的是一个可变 environment 对象，而那个对象后来收到了新的 binding。_

<!--
Figure prompt: Create a 1600×900 editorial diagram with English labels and the same color system: blue source/syntax, purple resolver state, green runtime environments, orange captured function/variable marker, red invalid lookup, navy headings/arrows. Title: "The captured environment mutates under the closure". Use three side-by-side columns labeled `T1 declaration`, `T2 first call`, and `T3 second call`. T1: draw a green `global env` box containing `a = "global"`; above it a green `block env object B` containing `showA = <fn showA>`; above that an orange `<fn showA>` box with an orange arrow labeled `closure → B` pointing to block env. Show a green `enclosing` arrow from block env to global env. T2: draw `showA call env <empty>` above `block env object B { showA = <fn showA> }` above `global env { a = "global" }`; show green enclosing arrows and a navy lookup route that skips the first two boxes and lands on the global `a`; label it "naive lookup: no a, no a, then global a" and "prints global". T3: draw the same call env and same block env object B, but now the block box contains both `showA = <fn showA>` and orange-highlighted `a = "block"`; draw a red lookup route that stops at the new block entry, labeled "old dynamic lookup stops at new entry" and "buggy output: block". Bottom note: "The closure did not forget. The environment it remembered grew a new entry." Keep arrows outside text areas and avoid crossing labels.
-->

一种修复办法是使用持久化、不可变 environment。每次声明变量时都创建一个新 environment，closure 就能保留旧的那个。这可以解决问题，但会让 `jlox` 改动很多。

书里选择了一个更小、更有用的修复：继续保留可变 environment，但不要让局部名字每次执行时都去搜索可变的 runtime chain。

## 3. Resolver 是源码世界里的笔记本，不是 environment

新机制是一趟插在 parsing 和 interpretation 之间的 pass：

```java
Resolver resolver = new Resolver(interpreter);
resolver.resolve(statements);

interpreter.interpret(statements);
```

Resolver 会在执行前遍历一次 AST。它不运行用户代码，不打印，不调用函数，也不会把 loop 真的跑很多遍。它访问的是程序结构，用来回答一个静态问题：

```text
这个变量使用点，在源码规则下应该指向哪个声明？
```

先把几个对象分开：

| 名字 | 保存什么 | 什么时候存在 | 回答什么 |
| --- | --- | --- | --- |
| AST | statements 和 expressions | parsing 之后 | 这个使用点出现在源码哪里？ |
| `Resolver.scopes` | `name → declared/defined` | resolution 期间 | 这个名字在当前源码位置是否可见？ |
| `Environment.values` | `name → runtime value` | interpretation 期间 | 这个名字现在的值是什么？ |
| `Interpreter.locals` | `Expr node → depth` | resolution 后写入，runtime 使用 | 这个使用点运行时应该往外跳几层？ |

Resolver 的 scope stack 不是 runtime environment。它不存 `"global"`、`"block"`、`40`、`true` 这些运行时值。它只记录一个名字在当前源码位置是否已经可见。

在 `jlox` 里，这个字段是：

```java
private final Stack<Map<String, Boolean>> scopes = new Stack<>();
```

Boolean 区分两种声明状态：

```text
false  declared, but not ready to read
true   defined, ready to read
```

这个区分用来抓住一个容易出错的 initializer：

```lox
var a = "outer";

{
  var a = a;
}
```

对于局部变量，Resolver 会先 declare 名字，再 resolve initializer，最后 define 名字：

```java
declare(stmt.name);
resolve(stmt.initializer);
define(stmt.name);
```

在 initializer 期间，local `a` 已经出现在 resolver map 里，但状态是 `false`。如果 initializer 试图读取同一个 local 变量，Resolver 就会报错。注意，这里是 declaration state，不是 runtime state；Resolver 不需要任何 Lox 值就能发现这个问题。

现在用 Resolver 走一遍开头程序：

```lox
var a = "global";

{
  fun showA() {
    print a;
  }

  showA();
  var a = "block";
  showA();
}
```

顶层的 global 变量不会记录进 `Resolver.scopes`，所以解析完 `var a = "global";` 之后，local scope stack 仍然是空的。

进入 block 时，压入一个 local scope：

```text
scopes = [
  {}
]
```

解析函数声明时，把 `showA` 加入这个 block scope：

```text
scopes = [
  { showA: true }
]
```

然后 Resolver 进入函数体，为参数和局部变量再压入一个 function scope：

```text
scopes = [
  { showA: true },
  {}
]
```

现在走到关键节点：

```lox
print a; // U_a
```

Resolver 从最内层 local scope 往外找：

```text
function scope: no a
block scope:    no a
```

没有找到 local 声明。因为 global 不记录在这个 local stack 里，Resolver 会让这个表达式缺席 `Interpreter.locals`：

```text
Interpreter.locals[U_a] = absent
```

Absent 不是忘了记录，而是有明确含义：

```text
运行时去 globals 里查。
```

只有在解析完 `U_a` 之后，Resolver 后面才会走到：

```lox
var a = "block";
```

这时 block scope 变成：

```text
scopes = [
  { showA: true, a: true }
]
```

但源码时间已经越过了 `U_a`。后面的 block `a` 不能回头改写之前那个变量表达式的声明。

![Figure 3. The resolver records the route for each expression node.](/assets/img/blog/crafting-interpreters-iii-resolving-a-name-before-it-runs/fig3-resolver-notebook.png)

_图 3。解析 `U_a` 时，Resolver 能看到 block scope 里的 `showA`，但还看不到后面的 block `a`。没有记录 local depth 是有意的：运行时应该走 global lookup。_

<!--
Figure prompt: Create a 1600×900 editorial diagram with English labels. Use blue for source, purple for resolver state, orange for `U_a`, red for invalid retroactive binding, navy for arrows and headings. Title: "Resolver notebook: scopes are not environments". Left: blue source-code card showing the opening snippet; highlight `print a;` as `U_a` in orange and the later `var a = "block";` as `D_block later` in red. Middle: purple panel labeled `Resolver.scopes at U_a` with a vertical stack: top `function scope { }`, below `block scope { showA: true }`, below muted `global scope / not tracked here`. Draw an orange arrow from the highlighted source `U_a` into the stack labeled `resolve U_a`. Draw a dashed red arrow from the later `D_block` toward the resolver stack, crossed out, labeled `later declaration cannot rewrite U_a`. Right: white panel labeled `Interpreter.locals`; include rows `U_a → absent / means: globals.get("a")`, `showA call #1 → depth 0`, `showA call #2 → depth 0`, and an inset `Control case: Expr.Variable(b) → depth 1`. Keep the diagram calm, with clear card spacing and no overlapping text.
-->

## 4. Depth 把绑定关系变成运行路线

开头的 bug 属于 global case，所以 `U_a` 没有 local depth。为了看清正向情况，换一个真的能找到 local 声明的小例子：

```lox
{
  var b = "outer";

  fun f() {
    print b;
  }

  f();
}
```

Resolver 走到 `print b` 时，scope stack 是：

```text
scopes = [
  { b: true, f: true },
  {}
]
```

最上面是函数体 scope，下面是外层 block scope。

Resolver 从内往外找：

```text
function scope: no b
block scope:    b found
```

声明在当前 scope 外面一层，所以 Resolver 记录：

```text
Interpreter.locals[U_b] = 1
```

实现很短：

```java
private void resolveLocal(Expr expr, Token name) {
  for (int i = scopes.size() - 1; i >= 0; i--) {
    if (scopes.get(i).containsKey(name.lexeme)) {
      interpreter.resolve(expr, scopes.size() - 1 - i);
      return;
    }
  }
}
```

这个 distance 表示从当前最内层 scope 到声明所在 scope 需要往外跳几层。当前 scope 是 depth `0`，直接外层是 depth `1`，再外一层是 depth `2`。

Resolver 把这个数字交给 interpreter：

```java
void resolve(Expr expr, int depth) {
  locals.put(expr, depth);
}
```

Interpreter 把它存进 side table：

```java
private final Map<Expr, Integer> locals = new HashMap<>();
```

key 是 expression node，不是变量名字符串。

这一点很重要：

```lox
var a = "global";

{
  var a = "block";
  print a; // U_inner
}

print a;   // U_global
```

两个变量表达式的 lexeme 都是 `"a"`，但它们不是同一个 binding。

表不是：

```text
"a" → one answer
```

而是：

```text
U_inner  → depth 0
U_global → absent, global
```

每个 `Expr.Variable` 对象都有自己的身份。`locals` 这张表把解析结果挂到那个具体节点上。

## 5. Runtime lookup 不再搜索，而是按路线取值

在 Resolver 之前，变量查找是一个 runtime search：

```text
environment.get(name)
  try current
  try enclosing
  try enclosing.enclosing
  ...
```

Resolution 之后，local lookup 变成 indexed access：

```text
lookUpVariable(name, expr)
  find this expression's distance
  if distance exists:
      getAt(distance, name)
  else:
      globals.get(name)
```

Interpreter 里的代码变成：

```java
private Object lookUpVariable(Token name, Expr expr) {
  Integer distance = locals.get(expr);

  if (distance != null) {
    return environment.getAt(distance, name.lexeme);
  } else {
    return globals.get(name);
  }
}
```

对于局部变量，`Environment` 增加了固定跳数的访问方法：

```java
Object getAt(int distance, String name) {
  return ancestor(distance).values.get(name);
}

Environment ancestor(int distance) {
  Environment environment = this;
  for (int i = 0; i < distance; i++) {
    environment = environment.enclosing;
  }
  return environment;
}
```

赋值也使用同一条路线：

```java
void assignAt(int distance, Token name, Object value) {
  ancestor(distance).values.put(name.lexeme, value);
}
```

这没有替换 environment。运行时仍然使用一条 `Environment` chain。变化在于：已经 resolved 的 local 不再问“今天最近的同名变量在哪里？”，它已经知道应该跳到哪一层。

现在重放 block 声明执行之后的第二次 `showA()` 调用：

```text
showA call env
  enclosing → block env

block env
  showA = <fn showA>
  a = "block"
  enclosing → global env

global env
  a = "global"
```

runtime chain 里确实有一个很诱人的 block `a`。但 `showA` 里的变量表达式已经有了解析结果：

```text
locals.get(U_a) = null
```

所以 interpreter 不调用：

```text
environment.get("a")
```

而是调用：

```text
globals.get("a")
```

结果是：

```text
global
```

Block environment 仍然会 mutation。Closure 仍然指向它。修复点是：`U_a` 不再问那个 environment 有没有一个 `a`。

Resolver 没有冻结 environment。它冻结的是 lookup decision。

## 6. 回到 `makeCounter`：identity 和 lifetime 终于合在一起

现在回到系列里的主程序：

```lox
fun makeCounter(start) {
  var n = start;

  fun tick() {
    n = n + 1;
    return n;
  }

  return tick;
}

var counter = makeCounter(40);
print counter(); // 41
```

Episode II 已经解释了 `n` 为什么能活下来。声明 `tick` 时，`tick` 对应的 `LoxFunction` 会捕获当前 environment，也就是 `makeCounter` 这次调用的 call environment。`makeCounter` 返回后，Java 调用栈没了，但返回出去的函数还指着那个 environment。

这是 lifetime。

Episode III 解释的是 identity。

Resolution 期间，Resolver 进入 `makeCounter` 的 function scope，并绑定参数：

```text
makeCounter scope:
  start: true
```

然后解析：

```lox
var n = start;
```

`n` 先被 declare，initializer 里的 `start` 解析为 depth `0`，然后 `n` 被 define：

```text
makeCounter scope:
  start: true
  n: true
```

接着 Resolver 走到嵌套函数：

```lox
fun tick() {
  n = n + 1;
  return n;
}
```

它先在 `makeCounter` scope 里 declare/define `tick`，然后进入 `tick` 函数体的新 scope：

```text
scopes = [
  { start: true, n: true, tick: true },
  {}
]
```

在 `tick` 里面，每个 `n` 都从内往外找：

```text
tick scope:        no n
makeCounter scope: n found
```

所以 `tick` 里的每个 `n` 都得到 depth `1`：

```text
Expr.Assign(n in n = ...)       → 1
Expr.Variable(n in n + 1)       → 1
Expr.Variable(n in return n)    → 1
```

运行时，`makeCounter(40)` 返回之后，被保留下来的 environment 像这样：

```text
global
  counter → <fn tick>
               closure
                 ↓
              makeCounter call env
                start = 40
                n = 40
                tick = <fn tick>
```

当 `counter()` 运行时，`tick` 的 call environment enclosing 捕获的 `makeCounter` environment：

```text
tick call env
  enclosing → makeCounter call env
                  n = 40
```

赋值表达式使用已经解析好的路线：

```text
getAt(1, "n")      → 40
assignAt(1, "n")   → 41
getAt(1, "n")      → 41
```

然后 `return n;` 返回 `41`。

![Figure 4. Resolver identity and closure lifetime meet in makeCounter.](/assets/img/blog/crafting-interpreters-iii-resolving-a-name-before-it-runs/fig4-counter-identity-lifetime.png)

_图 4。Resolver 给 `tick` 里的每个 `n` 一个 depth `1`。Closure 则让这个 depth 对应的 environment 在 `makeCounter` 返回后仍然可达。_

<!--
Figure prompt: Create a 1600×900 editorial diagram with English labels. Use blue for source/syntax, purple for resolver routes, green for runtime environments, orange for the tracked `n`, navy for headings/arrows. Title: "makeCounter: identity meets lifetime". Left panel: blue source-code card for `makeCounter(start)` with orange highlights on `var n = start`, `n = n + 1`, and `return n`; label the declaration `D_n` and the uses/assignment `U_n`. Middle panel: purple `Resolver routes` table with rows `Assign n → depth 1`, `Variable n in n + 1 → depth 1`, `Variable n in return → depth 1`, plus an orange note `same declaration: var n`. Right panel: green runtime state with `tick call env <empty>` above `makeCounter call env { start = 40, n = 40 → 41, tick = <fn tick> }`, plus `global counter → <fn tick, closure → makeCounter env>` below. Draw green closure/enclosing arrows, and navy arrows labeled `getAt(1, "n")` and `assignAt(1, "n")` from the resolver routes to the orange `n` entry. Bottom banner: "Resolver freezes identity. Closure preserves lifetime." Keep `n` visually orange and recognizable.
-->

所以，现在 `n` 在哪里？

```text
source text        var n = start;
variable uses      tick 里的每个 n
lexical binding    这些使用点都指向 makeCounter 的 n
resolver route     Expr → depth 1
runtime storage    makeCounter call environment
lifetime reason    tick 的 closure 让这个 environment 保持可达
```

Resolver 回答：

```text
这个 n 指向哪个声明？
```

Closure 回答：

```text
那个声明对应的存储为什么还活着？
```

把这两个问题拆开，closure 就不再那么魔法了。

## 7. 静态错误是额外收益，不是主修复点

有了 semantic pass 以后，解释器还能在运行前拒绝一些不可能的状态。

前面已经见过一个：

```lox
var a = "outer";

{
  var a = a;
}
```

在 initializer 里，local `a` 已经出现在当前 resolver scope map 中，但状态是 `false`，所以 Resolver 会报：

```text
Can't read local variable in its own initializer.
```

另一个例子是重复声明 local：

```lox
fun bad() {
  var a = "first";
  var a = "second";
}
```

Resolver 能看到当前 local scope 里已经有 `a`，所以可以报告静态错误。

第三个例子是顶层 `return`：

```lox
return "at top level";
```

运行时的 `Return` exception 只有在函数调用内部才有意义。Resolver 会记录自己当前是否在函数里，并拒绝函数外的 `return`。

这些检查都很有用，但不是这一篇的核心。核心仍然是名字身份：每个变量使用点都应该带着一条从源码含义到运行时存储的稳定路线。

这个模式到对象章节还会出现。`this` 看起来像变量表达式，但它只有在方法里才有意义。Resolver 正是知道这件事的地方。

## 8. 重跑 bug：binding edge 被固定了

回到开头程序：

```lox
var a = "global";

{
  fun showA() {
    print a;
  }

  showA();
  var a = "block";
  showA();
}
```

Resolution 之后，关键表格是：

```text
U_a inside showA       → absent from locals → global
first showA callee     → depth 0
second showA callee    → depth 0
```

第一次调用时：

```text
U_a:
  locals.get(U_a) = null
  globals.get("a") = "global"
```

执行 block-local 声明之后，block environment 变成：

```text
block env
  showA = <fn showA>
  a = "block"
```

第二次调用时：

```text
U_a:
  locals.get(U_a) = null
  globals.get("a") = "global"
```

所以输出是：

```text
global
global
```

同一个 AST 节点执行了两次。两次之间 runtime environment 变了，但 binding 没变。

这一篇的 checkpoint 是：

```text
Environment stores values.
Closure preserves environments.
Resolver records name identity.
Interpreter.locals stores routes.
getAt() and assignAt() follow those routes.
```

更大的经验很短，但很耐用：

> Runtime container 可以变化。源码层面不应该变化的关系，需要自己的表示。

### Source map

主要来源：

- Robert Nystrom, *Crafting Interpreters*, Chapter 11, ["Resolving and Binding"](https://craftinginterpreters.com/resolving-and-binding.html)：static scope、`showA()` closure-scope bug、mutable environments、resolver pass、`Resolver.scopes`、`declare()` / `define()`、`resolveLocal()`、`Interpreter.locals`、`lookUpVariable()`、`getAt()`、`assignAt()`，以及在 interpretation 前运行 resolver。
- Robert Nystrom, *Crafting Interpreters*, Chapter 12, ["Classes"](https://craftinginterpreters.com/classes.html)：下一篇会接到 `this`、methods 和 `LoxFunction.bind()`。

实现入口：

```text
Resolver.java
  visitBlockStmt()
  visitVarStmt()
  visitVariableExpr()
  visitAssignExpr()
  visitFunctionStmt()
  resolveFunction()
  beginScope()
  endScope()
  declare()
  define()
  resolveLocal()

Interpreter.java
  locals
  resolve()
  visitVariableExpr()
  lookUpVariable()
  visitAssignExpr()

Environment.java
  get()
  assign()
  getAt()
  assignAt()
  ancestor()

Lox.java
  run()
  Resolver resolver = new Resolver(interpreter)
  resolver.resolve(statements)
  interpreter.interpret(statements)
```

上一篇：

- [Crafting Interpreters（II）：树开始运行](/zh/blog/crafting-interpreters-ii-tree-begins-to-run/)：runtime values、environments、function call environments、closure capture，以及留下来的 binding mystery。

### Bridge to Episode IV

Episode III 固定了普通变量的 identity。一个变量表达式现在能带着一条稳定路线，从源码含义走到运行时存储。

Episode IV 会把同样的压力移到对象上：

```lox
class Counter {
  init(start) {
    this.n = start;
  }

  tick() {
    this.n = this.n + 1;
    return this.n;
  }
}
```

这时 `n` 不再是一个 lexical local variable，而是通过 `this` 到达的 field。

问题因此改变了。Receiver `this` 是 lexical 的，但 field name `n` 是运行时在 instance 上查的。当一个 method 从 object 上取出来、被保存、又在之后调用时，它仍然需要记住当初是哪一个 instance 提供了 `this`。

所以下一篇会问同一个问题的新版本：

> 局部变量需要一个稳定声明。方法需要什么，才能让 `this.n` 在之后仍然找到正确的对象？
