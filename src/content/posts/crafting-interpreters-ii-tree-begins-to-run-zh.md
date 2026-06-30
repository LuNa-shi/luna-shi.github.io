---
title: >-
  Crafting Interpreters（II）：树开始运行
date: '2026-06-30'
overview: >-
  AST 只有被解释器遍历后才会变成一次运行：表达式产生值，语句制造效果，环境保存状态，控制流选择子树，闭包保留被捕获的作用域。
description: >-
  一篇 Crafting Interpreters 笔记，解释 AST 如何变成运行时值、效果、环境、控制流、函数调用和闭包。
image: /assets/img/blog/crafting-interpreters-ii-tree-begins-to-run-zh/ci-ii-figure-1-ast-to-run.png
math: false
toc: true
relatedPosts: false
tags:
  - crafting-interpreters
  - interpreters
  - lox
categories:
  - learning
  - systems
lang: zh
translationKey: crafting-interpreters-ii-tree-begins-to-run
canonicalSlug: crafting-interpreters-ii-tree-begins-to-run
---

# Crafting Interpreters（II）：树开始运行

## 从 AST 到运行报表：值、效果、状态、控制流、调用和闭包

TL;DR：AST 不会自己运行。解释器要沿着树走，把表达式节点变成运行时值，用语句产生输出和状态变化，把名字存进一串环境里，通过控制流改变下一步访问哪棵子树，再让函数把声明时的环境一起带走。

[Episode I](/zh/blog/crafting-interpreters-1-when-source-text-becomes-structure/) 停在 source text becomes structure。parser 已经选出了一棵树，但这棵树还只是结构。`Literal(2)` 是一段以后可以产生值的语法，不是已经在程序里流动的值。

Episode II 从这里接上。问题不再是：

> 源代码如何变成一棵树？

而是：

> 这棵树如何变成一次运行？

我们会追踪一个很小的 report 程序。它故意写得朴素一些：Lox 不会自动把字符串和数字拼接起来，所以 label 和数字会分成两行打印。

```text
fun row(day, amount) {
  print "day";
  print day;
  print "amount";
  print amount;
  return amount;
}

fun makeTotal(start) {
  var sum = start;

  fun add(amount) {
    sum = sum + amount;
    return sum;
  }

  return add;
}

var running = makeTotal(0);
var total = 0;

for (var day = 1; day <= 3; day = day + 1) {
  var amount = day * 10;
  total = running(row(day, amount));
}

if (total >= 60 and total < 100) {
  print "status";
  print "ok";
} else {
  print "status";
  print "review";
}

print "total";
print total;
```

输出是：

```text
day
1
amount
10
day
2
amount
20
day
3
amount
30
status
ok
total
60
```

整篇文章的问题其实藏在这一行里：

```text
total = running(row(day, amount));
```

这行代码运行时，哪个表达式先产生哪个值？哪个语句改变了哪个状态？每个名字存在哪个环境里？下一步该运行哪棵子树？为什么 `makeTotal()` 已经返回了，隐藏的 `sum` 还活着？

完整路径可以压成一条链：

```text
AST → values → effects → environments → control flow → calls → closures
```

每个箭头解决一个新的不确定性。表达式产生值。语句让值变得可见，或者让值留下来。环境给名字一个运行时住所。控制流改变哪些子树会被访问。函数调用创建新的执行边界。闭包让某些边界在创建它的那次调用结束之后继续活着。

这些问题也出现在更大的语言里。C 和 Rust 有表达式求值顺序、块作用域、函数调用帧和返回边界。JavaScript 和 Python 把闭包放进日常写法里。Lox 的好处是模型足够小，每个部件都能被看见。

技术承诺：读完这篇之后，你应该能把 `total = running(row(day, amount));` 追踪完整：表达式求值、参数求值、函数调用、参数绑定、`return` 退栈、赋值、环境查找、`for` 脱糖，以及闭包捕获。

![从 AST 到运行报表：source code 先变成 AST，再由 interpreter 产生值、输出、环境变化、控制流选择、返回值和被捕获的状态。](/assets/img/blog/crafting-interpreters-ii-tree-begins-to-run-zh/ci-ii-figure-1-ast-to-run.png)

图 1：Episode I 产出了树。Episode II 追问解释器如何把这棵树变成一份运行报表。

## 1. AST 记住归属关系，解释器创造时间顺序

在顶层，一个 Lox 程序是一组语句。我们的 report 程序先有两个函数声明，然后是两个变量声明，接着是一个循环、一个分支和最后两条打印语句。

这给出第一条简单规则：

```text
顶层语句按顺序执行，除非控制流改变路径。
```

在这些语句内部，解释器会不断在两个动词之间切换：

```java
private Object evaluate(Expr expr) {
  return expr.accept(this);
}

private void execute(Stmt stmt) {
  stmt.accept(this);
}
```

`evaluate(expr)` 运行一个表达式，并返回一个 Lox 值。`execute(stmt)` 运行一条语句，并产生一个效果。这个区分很重要，因为树里同时有表达式节点和语句节点。二元表达式问的是：“我产生什么值？” `print` 语句问的是：“我执行什么动作？”

现在聚焦循环体：

```text
var amount = day * 10;
total = running(row(day, amount));
```

第二行是一条 expression statement，它里面的表达式是赋值。赋值不能马上修改 `total`，它必须先让右侧产生一个值。右侧是一个调用：

```text
running(row(day, amount))
```

这个调用的参数里又有另一个调用：

```text
Call running
  argument:
    Call row
      argument: day
      argument: amount
```

所以树固定了归属关系：`row(day, amount)` 是 `running(...)` 的参数；`running(...)` 是 `total = ...` 的右侧；这个赋值在循环体里。

解释器补上时间顺序：

```text
evaluate assignment
  evaluate right-hand side: running(row(day, amount))
    evaluate callee: running
    evaluate argument: row(day, amount)
      evaluate callee: row
      evaluate argument: day
      evaluate argument: amount
      call row
        print "day"
        print day
        print "amount"
        print amount
        return amount
    call running
      update captured sum
      return new sum
  assign returned value to total
```

这就是 Episode I 解析轨迹在运行时的对应物。第一篇里，parser 的调用栈临时记住哪个 grammar rule 正在等待哪棵子树。这里，解释器的 Java 调用栈临时记住哪个运行时操作正在等待哪个值。

树是静态的。遍历是运行时发生的。

![核心行追踪：`total = running(row(day, amount));` 的 AST 片段、求值时间线和状态变化。](/assets/img/blog/crafting-interpreters-ii-tree-begins-to-run-zh/ci-ii-figure-2-core-line-trace.png)

图 2：AST 说明哪个表达式拥有哪个孩子。解释器决定这些孩子什么时候求值，副作用什么时候发生。

后面的每一节都会回到这行代码。每一节只补一块缺失的运行时能力。

## 2. 表达式产生运行时值

子表达式返回时，它返回的不是语法，而是运行时值。

在 `jlox` 里，最先出现的用户可见值用普通 Java 对象表示：

```text
Lox number  -> Java Double
Lox string  -> Java String
Lox bool    -> Java Boolean
Lox nil     -> Java null
```

循环用一个二元表达式创建 `amount`：

```text
var amount = day * 10;
```

parser 已经构造好了 `Binary` 节点。解释器现在要先求左孩子，再求右孩子，然后应用运算符规则：

```java
public Object visitBinaryExpr(Expr.Binary expr) {
  Object left = evaluate(expr.left);
  Object right = evaluate(expr.right);

  switch (expr.operator.type) {
    case PLUS:
      if (left instanceof Double && right instanceof Double) {
        return (double)left + (double)right;
      }
      if (left instanceof String && right instanceof String) {
        return (String)left + (String)right;
      }
      throw new RuntimeError(expr.operator,
          "Operands must be two numbers or two strings.");

    case STAR:
      checkNumberOperands(expr.operator, left, right);
      return (double)left * (double)right;
  }

  return null;
}
```

对 `day * 10` 来说，左侧是当前的 `day`，右侧是数字字面量 `10`。`*` 要求两个数字，所以三轮循环得到：

```text
day = 1 -> amount = 10
day = 2 -> amount = 20
day = 3 -> amount = 30
```

这就是运行时语义。AST 说：“这是一个带 `STAR` token 的二元表达式。”解释器说：“先求两个操作数，检查它们都是数字，然后相乘。”

`+` 也遵循同样模式，但 Lox 给 `+` 两个合法含义：

```text
print 1 + 2;     // 3
print "a" + "b"; // ab
print "1" + 2;   // runtime error
```

第三行很关键。Lox 不会把数字自动转成字符串。在书里的实现中，`+` 只接受两个数字，或者两个字符串。混合操作数是运行时错误，而且错误会带着运算符 token，这样解释器可以报告源代码里出错的位置。

比较运算符更严格。`<`、`<=`、`>` 和 `>=` 都要求数字，并产生布尔值：

```text
print 3 < 4;     // true
print "a" < "b"; // runtime error
```

相等判断在另一个方向上更宽松。不同种类的值可以比较，但 Lox 不做隐式转换：

```text
print nil == nil;   // true
print 3 == "3";     // false
print false != nil; // true
```

真值规则也是运行时法律。它出现在 `!`、`if`、`while`、`and` 和 `or` 里：

```text
只有 false 和 nil 是假值。
其他所有值都是真值。
```

所以在 Lox 里，`0` 和 `""` 都是真值。

这个规则直接影响 report 的状态判断：

```text
if (total >= 60 and total < 100) {
  print "status";
  print "ok";
} else {
  print "status";
  print "review";
}
```

循环结束后，`total >= 60` 求值为 `true`。因为运算符是 `and`，解释器继续求 `total < 100`，它也得到 `true`。条件为真，所以 then 分支执行。

变量表达式是语法。数字、字符串、布尔值、`nil` 和函数对象才是运行时数据。解释器的第一份工作，就是把前者变成后者。

## 3. 语句把值变成效果

一份 report 需要的不只是一个值。它有输出，也有随时间变化的状态。

前两条顶层语句是函数声明：

```text
fun row(day, amount) { ... }
fun makeTotal(start) { ... }
```

执行函数声明不会运行函数体。它会创建一个 callable 运行时对象，并用函数名存起来：

```text
global
  row       -> <fn row>
  makeTotal -> <fn makeTotal>
```

接着程序声明变量：

```text
var running = makeTotal(0);
var total = 0;
```

变量声明会先求初始化器，再在当前环境里定义名字。`makeTotal(0)` 返回内部的 `add` 函数，所以全局环境变成：

```text
global
  row       -> <fn row>
  makeTotal -> <fn makeTotal>
  running  -> <fn add>
  total    -> 0
```

AST 表示源代码结构，所以它不应该存 `total` 的当前值。运行时状态属于环境。

循环内部，赋值改变这个状态：

```text
total = running(row(day, amount));
```

赋值也是表达式。它会先求右侧，再把得到的值存进一个已经存在的变量里。

三轮循环的效果是：

```text
day 1: row returns 10, running returns 10, total becomes 10
day 2: row returns 20, running returns 30, total becomes 30
day 3: row returns 30, running returns 60, total becomes 60
```

这行代码不是单纯计算出 `60`。它让 `total` 记住 `60`，这样后面的语句还能继续使用它。

简化成几条规则：

```text
expression statement: evaluate, then discard the result
print statement:      evaluate, then expose the result
var declaration:      evaluate initializer, then define a name
assignment:           evaluate new value, then mutate an existing name
```

核心想法是：

> 表达式产生值。语句把值变成效果。环境让这些效果跨语句保留下来。

这就是运行时模型的起点。名字和值不住在语法树里。它们住在一份会变化的存储里，解释器一边走树，一边携带这份存储。

## 4. 环境给状态加上边界

只靠一个全局环境，一遇到局部变量就不够了。report 循环里有一个局部变量：

```text
for (var day = 1; day <= 3; day = day + 1) {
  var amount = day * 10;
  total = running(row(day, amount));
}
```

`amount` 应该只存在于循环体内部。它不应该变成全局变量，也不应该在循环体结束后继续存在。块会创建这种临时世界。

块环境会指向进入块之前的当前环境：

```text
loop body block
  amount -> 10
  ↓ enclosing
for block
  day -> 1
  ↓ enclosing
global
  total -> 0
  running -> <fn add>
```

查找从当前环境开始，找不到就向外走。赋值也沿着同一条链向外走，但它会修改找到名字的那个环境：

```java
Object get(Token name) {
  if (values.containsKey(name.lexeme)) return values.get(name.lexeme);
  if (enclosing != null) return enclosing.get(name);
  throw new RuntimeError(name, "Undefined variable.");
}

void assign(Token name, Object value) {
  if (values.containsKey(name.lexeme)) {
    values.put(name.lexeme, value);
    return;
  }
  if (enclosing != null) {
    enclosing.assign(name, value);
    return;
  }
  throw new RuntimeError(name, "Undefined variable.");
}
```

这个规则解释了循环体。`amount` 定义在 body block 里。`day` 在外一层的 for block 里找到。`total` 在 global 里找到，并在那里被修改。

解释器进入块时，会临时替换当前环境：

```java
void executeBlock(List<Stmt> statements, Environment environment) {
  Environment previous = this.environment;
  try {
    this.environment = environment;
    for (Stmt statement : statements) execute(statement);
  } finally {
    this.environment = previous;
  }
}
```

`finally` 很关键。一个块可能正常结束，也可能因为运行时错误离开，还可能被一个 `return` 信号穿过。不管是哪种情况，解释器都必须恢复之前的环境。否则，局部作用域会泄漏到后面的程序里。

这就是带 `{ ... }` 的语言中 block scope 的运行时形状。一个局部世界可以看见外面，但控制离开这个世界之后，它自己的局部名字就不再是当前名字。

现在 report 有了分层状态：

```text
global
  row       -> <fn row>
  makeTotal -> <fn makeTotal>
  running  -> <fn add>
  total    -> 0 / 10 / 30 / 60

for block
  day      -> 1 / 2 / 3 / 4

loop body block
  amount   -> 10 / 20 / 30
```

状态不再是一张扁平的全局 map。它有边界，而这些边界也是执行的一部分。

![环境链：全局状态、for block 状态、loop body 状态、调用环境，以及被闭包捕获的环境。](/assets/img/blog/crafting-interpreters-ii-tree-begins-to-run-zh/ci-ii-figure-3-environments-lifetime.png)

图 3：声明写入当前环境。查找向外走。闭包可以让一个旧环境继续可达。

## 5. 控制流改变下一棵要运行的子树

如果解释器对每个孩子节点都只访问一次，它可以计算算术，也可以执行直线语句。但它跑不出一个有循环和分支的 report。

控制流改变树的遍历路径。

`if` 语句先求条件。如果条件为真值，执行 then 分支。否则，如果有 else 分支，就执行 else 分支。

逻辑运算符也会在表达式内部做选择。对 `and` 来说，解释器先求左操作数。如果左值是假值，右操作数会被跳过。对 `or` 来说，如果左值是真值，右操作数会被跳过。

所以 AST 里可以有一个孩子节点，但它实际不会运行。

`while` 循环会重复访问一棵子树：

```text
while condition is truthy:
  execute body
```

条件会在每轮迭代之前求值，包括第一轮。body 可能运行零次、一次或很多次。

这一节最能说明问题的是 `for`，因为 `jlox` 没有为它增加新的运行时 visitor。parser 会把 `for` 降低成旧节点。

我们的源代码循环是：

```text
for (var day = 1; day <= 3; day = day + 1) {
  var amount = day * 10;
  total = running(row(day, amount));
}
```

parser 先拆出四块：

```text
initializer: var day = 1
condition:   day <= 3
increment:   day = day + 1
body:        the block that computes amount and updates total
```

然后构造一棵等价的树：

```text
{
  var day = 1;

  while (day <= 3) {
    {
      var amount = day * 10;
      total = running(row(day, amount));
    }

    day = day + 1;
  }
}
```

顺序不能乱：

```text
1. 把 increment 追加到原 body 后面。
2. 把 condition 用作 while 的条件。
3. 把 initializer 放在 while 前面。
4. 用外层 block 包住 initializer 和 while。
```

这个外层 block 给了 `day` 正确的生命周期。它对条件、body 和 increment 可见，但不会泄漏到循环外。

执行就变成：

```text
define day = 1
evaluate day <= 3 -> true
  define amount = 10
  run row, update running sum, assign total = 10
  increment day to 2
evaluate day <= 3 -> true
  define amount = 20
  run row, update running sum, assign total = 30
  increment day to 3
evaluate day <= 3 -> true
  define amount = 30
  run row, update running sum, assign total = 60
  increment day to 4
evaluate day <= 3 -> false
exit loop
```

parser 不只是识别了一个 `for` 循环。它为解释器选择了一套更小的运行时词汇。这个过程就是 desugaring：表层语法借用已有的运行时语义。

![for 脱糖：initializer 变成外层 block 的第一条语句；condition 变成 while 条件；increment 追加到 body 后面。](/assets/img/blog/crafting-interpreters-ii-tree-begins-to-run-zh/ci-ii-figure-4-for-desugaring.png)

图 4：`for` 复用了 block、while 和 expression statement 的执行方式，而不是增加一套新的运行时机制。

## 6. 函数调用创建新的执行边界

函数声明把代码存起来，留到以后执行。函数调用则在现在创建一个新的运行时世界。

`row` 和 `makeTotal` 都在顶层声明，所以函数对象都存进 global。但它们的函数体不会在声明时运行。

一个 callable 要回答两个运行时问题：

```text
arity(): 期待多少个参数？
call():  参数到达时发生什么？
```

对用户定义函数来说，`call()` 会创建环境、绑定参数、执行函数体，并返回值：

```java
public Object call(Interpreter interpreter, List<Object> arguments) {
  Environment environment = new Environment(closure);

  for (int i = 0; i < declaration.params.size(); i++) {
    environment.define(declaration.params.get(i).lexeme,
        arguments.get(i));
  }

  try {
    interpreter.executeBlock(declaration.body, environment);
  } catch (Return returnValue) {
    return returnValue.value;
  }

  return null;
}
```

当循环求值：

```text
row(day, amount)
```

解释器先求 callee，再从左到右求参数，然后调用函数。调用环境看起来是：

```text
row call
  day    -> 1
  amount -> 10
  ↓ enclosing
global
  row -> <fn row>
```

接着执行函数体：

```text
print "day";
print day;
print "amount";
print amount;
return amount;
```

前四条语句产生输出。最后一条语句返回数字，这个数字会成为 `running(...)` 的参数。

每次调用都会得到一个新环境：

```text
row call #1: day -> 1, amount -> 10
row call #2: day -> 2, amount -> 20
row call #3: day -> 3, amount -> 30
```

这就是为什么参数只属于某一次调用。函数声明是共享的，但参数环境不是共享的。

`return` 是这一篇里第一个刻意跨越多层 visitor 的结构。`return` 可以出现在块、分支或循环里面。它运行时，解释器必须跳回函数调用边界，跳过还在执行的嵌套结构。

`jlox` 用一个小的内部异常实现这个跳转：

```java
class Return extends RuntimeException {
  final Object value;

  Return(Object value) {
    super(null, null, false, false);
    this.value = value;
  }
}
```

用户不会把它看成运行时错误。在解释器内部，它是一个控制信号。执行 `return amount;` 时，解释器先求 `amount`，把值包进 `Return`，然后抛出它。`LoxFunction.call()` 捕获这个信号，把里面的值变成调用表达式的值。

在 report 这行里，这让 `row(day, amount)` 同时拥有两种作用：它打印一行 report，然后把 numeric amount 返回给外层调用。

## 7. 闭包让环境活得比调用更久

现在看 accumulator：

```text
fun makeTotal(start) {
  var sum = start;

  fun add(amount) {
    sum = sum + amount;
    return sum;
  }

  return add;
}

var running = makeTotal(0);
```

在顶层，`makeTotal` 被存成一个函数，它的 closure 是 global：

```text
global
  makeTotal -> <fn makeTotal, closure = global>
```

调用 `makeTotal(0)` 会创建一个新的调用环境：

```text
makeTotal call
  start -> 0
  ↓ enclosing
global
```

然后 `var sum = start;` 在这个调用环境里定义 `sum`：

```text
makeTotal call
  start -> 0
  sum   -> 0
  ↓ enclosing
global
```

接着运行嵌套函数声明：

```text
fun add(amount) {
  sum = sum + amount;
  return sum;
}
```

函数对象保存的不只是代码。它还保存声明它时的当前环境。

所以 `add` 保存了：

```text
declaration: the add function body
closure:     the makeTotal call environment
```

调用环境现在包含：

```text
makeTotal call
  start -> 0
  sum   -> 0
  add   -> <fn add, closure = this environment>
  ↓ enclosing
global
```

最后，`return add;` 把这个函数对象送回顶层，`running` 存住它：

```text
global
  running -> <fn add>
```

Java 调用栈里已经没有 `makeTotal(0)` 了。函数体已经结束。解释器的当前环境也回到 global。

但 `makeTotal` 的调用环境没有消失：

```text
global
  running -> <fn add>
               closure
                 ↓
              makeTotal call
                start -> 0
                sum   -> 0
                add   -> <fn add>
```

这是第一次有一个运行时环境比创建它的那次调用活得更久。

块环境通常在块结束后不再是当前环境。函数调用环境通常在调用返回后不再是当前环境。但闭包可以让一个函数调用环境继续可达。

这就是 Chapter 10 的 lifetime twist。

现在比较 report 里的两个函数：

```text
row is declared at top level:
  row call
    day -> 1
    amount -> 10
    ↓ enclosing
  global

add is declared inside makeTotal:
  add call
    amount -> 10
    ↓ enclosing
  makeTotal call
    sum -> 0
    ↓ enclosing
  global
```

它们都是 `LoxFunction` 对象。差别在于函数对象里保存的 closure。一次函数调用创建出来的环境，其 enclosing 指针会从函数对象的 closure 初始化。

这个细节解释了 running total：

```text
before loop:
  captured sum = 0

day 1:
  row returns 10
  add updates sum = 0 + 10
  captured sum = 10
  global total = 10

day 2:
  row returns 20
  add updates sum = 10 + 20
  captured sum = 30
  global total = 30

day 3:
  row returns 30
  add updates sum = 30 + 30
  captured sum = 60
  global total = 60
```

全局变量 `total` 保存最新返回值。`running` 里存着的闭包，让隐藏的 `sum` 在多次调用之间继续存在。

## 8. 那一行代码已经变成一次运行

回到具体问题：

```text
total = running(row(day, amount));
```

现在可以精确回答它了。

AST 说，`row(day, amount)` 是 `running(...)` 的一个参数。解释器会在调用 `running` 之前，先求这个参数。

调用 `row` 会创建一个新的调用环境。它的参数拿到当前的 `day` 和 `amount`。函数体打印 report row，然后返回 `amount`。

调用 `running` 会创建另一个新的调用环境。但 `running` 是返回出来的 `add` 函数，所以这个调用环境的 enclosing 指向被捕获的 `makeTotal` 环境，而不是循环体。`sum` 就在这个被捕获的环境里被找到并更新。

`running` 的返回值成为赋值表达式右侧的值。赋值随后从当前环境向外查找，直到在 global 里找到 `total`，并修改这个条目。

同一行代码运行了三次，因为 parser 把 `for` 循环降低成了 block 加 `while`，而当 `day = 1`、`2`、`3` 时，while 条件都是真值。

循环之后，分支条件运行：

```text
total >= 60 and total < 100
```

左侧比较为真。因为是 `and`，右侧比较也会运行。右侧也为真，所以 then 分支打印：

```text
status
ok
```

最后两条 print 语句暴露保存下来的结果：

```text
total
60
```

所以整个程序输出是：

```text
day
1
amount
10
day
2
amount
20
day
3
amount
30
status
ok
total
60
```

一开始我们只有一棵树。现在，它变成了一份 report。

解释器不是一步完成这件事的。它一层一层添加运行时含义：

```text
Expressions produce values.
Operators enforce laws on those values.
Statements turn values into effects.
Environments preserve those effects as state.
Blocks give state local boundaries.
Control flow changes which subtrees run.
Functions create fresh execution contexts.
Return jumps back to the function-call boundary.
Closures let a function carry an environment after its original call has ended.
```

这就是 Chapters 7-10 的主线。

## Runtime model checkpoint

到这里，读者应该能从五组问题解释这个运行时模型。

Values：

```text
1. Expression nodes produce runtime values.
2. Binary expressions evaluate children before applying an operator.
3. Lox's + accepts two numbers or two strings, but not a mixed pair.
4. Only false and nil are falsey.
```

Effects and state：

```text
5. Statements create visible or persistent effects.
6. Environments store names and values outside the AST.
7. Assignment mutates the environment where a name is found.
```

Boundaries：

```text
8. Blocks create temporary environments.
9. Function calls create fresh parameter environments.
10. executeBlock() restores the previous environment even when control exits early.
```

Control：

```text
11. if, while, and short-circuit logic change which subtrees run.
12. for reuses block and while through parser-side desugaring.
13. return is an internal non-local control signal.
```

Lifetime：

```text
14. A function object stores a declaration plus a closure environment.
15. A returned function can keep a local environment alive.
16. Captured state can be updated across later calls.
```

这些小部件支撑了很多熟悉的语言功能：表达式、变量、作用域、循环、调用、返回和闭包。

Lox 把机制压得足够小，所以我们能看见每个部件怎么动。

### Source map

这篇文章主要对应书中的几章：

- Chapter 7, “Evaluating Expressions”：运行时值、表达式 visitor、算术、比较、相等、真值规则和运行时错误。
- Chapter 8, “Statements and State”：语句、`print`、变量声明、赋值、环境和块。
- Chapter 9, “Control Flow”：`if`、逻辑运算符、`while` 和 `for` 脱糖。
- Chapter 10, “Functions”：callable 对象、arity、函数声明、调用环境、`return` 和闭包。

有用的实现入口：

- `Interpreter.java`：`evaluate()`、`execute()`、表达式 visitor、语句 visitor、`executeBlock()`、`visitCallExpr()`、`visitLogicalExpr()` 和 `visitReturnStmt()`。
- `Environment.java`：`define()`、`get()`、`assign()` 和 `enclosing` 链。
- `Parser.java`：`forStatement()` 如何脱糖成 block 和 `while` 节点。
- `LoxCallable.java`：`arity()` 和 `call()` 协议。
- `LoxFunction.java`：函数对象、参数绑定、调用环境、closure 捕获和 return 处理。
- `Return.java`：用于离开函数体的内部控制信号。

### Bridge to Episode III

这一篇结尾时，`running` 让一个 `sum` 继续活着：

```text
global
  running -> <fn add>
               closure
                 ↓
              makeTotal call
                sum -> 60
```

这解决了 lifetime mystery：

> 一个局部变量如何在函数返回之后继续存在？

答案是：返回的函数仍然指向声明这个变量时的环境。

但它打开了 binding mystery：

> 当解释器之后看到名字 `sum` 时，它怎么知道这个名字应该指向哪个声明？

到目前为止，查找是在运行时沿着环境链走。这对 report 程序够用。但闭包暴露了一个不舒服的事实：环境是可变对象，而程序可以保留对环境的引用。

Episode III 从这里开始。树现在已经运行起来了。下一步，每个变量表达式都需要稳定绑定到自己的声明。
