---
title: "Crafting Interpreters (IV)：Resolver 铺路，Interpreter 填值"
subtitle: "jlox 如何不用第二套运行时，就跑起 class、this、继承和 super"
series: "Crafting Interpreters: Following Lox from Source to Heap"
episode: 4
lang: zh
translationKey: crafting-interpreters-iv-resolver-lays-the-track-interpreter-fills-the-values
canonicalSlug: crafting-interpreters-iv-resolver-lays-the-track-interpreter-fills-the-values
book_scope: "Chapters 12-13"
figures: 5
date: 2026-07-01
overview: >-
  jlox 的对象系统没有另起一套运行时：class、instance、method、this、inheritance 和 super
  都落回 LoxClass、LoxInstance、LoxFunction、environment、closure 和 resolver distance。
description: "jlox 如何不用第二套运行时，就跑起 class、this、继承和 super。"
image: /assets/img/blog/crafting-interpreters-iv-resolver-lays-the-track-interpreter-fills-the-values/01-cover-track-values.png
tags: [crafting-interpreters, interpreters, lox, classes, inheritance, resolver]
categories: [learning, systems]
toc: true
relatedPosts: true
---

# Crafting Interpreters (IV)：Resolver 铺路，Interpreter 填值

## jlox 如何不用第二套运行时，就跑起 `class`、`this`、继承和 `super`

TL;DR：jlox 的对象系统并不是一套额外的 OOP 宇宙。class 会变成 `LoxClass`，instance 会变成 `LoxInstance`，method 仍然是 `LoxFunction`。`this` 和 `super` 最后也仍然是 environment 里的名字。resolver 先记录这些名字的位置，interpreter 再在运行时把真实的值放进去。

上一篇文章停在了“树开始跑起来”的地方：expression 产生值，statement 产生效果，environment 保存名字，call 创建局部世界，closure 让某些局部世界在函数返回后继续活着。

现在来到 class，看起来像是进入了一个新大陆。对象、字段、方法、构造函数、继承、`this`、`super`——这些概念似乎需要一整套新的机器。

但 jlox 最有意思的地方恰好是：它基本没有换机器。

对象系统仍然建立在旧组件上：

```text
source syntax
  → parser shape
  → resolver distances
  → interpreter values
  → environment lookup
  → closure capture
```

所以这篇文章的主线是：

> 从 Lox 的 class 语法出发，看 resolver 和 interpreter 如何配合，让 class / instance / this / inheritance / super 真正跑起来。

![jlox object system overview](/assets/img/blog/crafting-interpreters-iv-resolver-lays-the-track-interpreter-fills-the-values/01-cover-track-values.png)

Figure 1. class 看起来是一个很大的功能，但实现反复回到两个动作：resolver 记录名字在哪里，interpreter 创建真实的运行时值。

## 1. 先看 Lox 的 class 长什么样

先不要急着看实现。先看表面语言：

```lox
class Person {
  init(name) {
    this.name = name;
  }

  sayHi() {
    print "Hi, I am " + this.name;
  }
}

var p = Person("Luna");
p.sayHi();
```

如果你写过 JavaScript、Python、Java 或 Ruby，这段代码会有熟悉感。但 Lox 的设计又刻意保持得很小。

第一，没有 `new` 关键字。创建对象时直接调用 class：

```lox
Person("Luna")
```

在运行时，class object 本身是 callable。调用它，就创建一个 instance。

第二，field 不会提前写在 class body 里。字段是在执行赋值时出现的：

```lox
this.name = name;
```

这行代码会把 `name` 放到当前 instance 上。class declaration 本身没有字段列表。

第三，method 在 class body 里不写 `fun`：

```lox
sayHi() {
  print this.name;
}
```

parser 已经有 function declaration 的结构，所以 method 可以复用这个结构，只是语法上更轻一点。

第四，initializer 固定叫 `init`，不是和类同名：

```lox
init(name) {
  this.name = name;
}
```

这意味着每个 class 都用同一个 initializer 名字，class name 只负责表示 class 本身。

第五，继承用 `<`：

```lox
class B < A {
  test() {
    super.method();
  }
}
```

`<` 可以理解成“B 在 A 下面”或者“B 派生自 A”。当 `B` 找不到某个 method 时，就继续去 `A` 里找。当 `B` 想明确从 `A` 开始找时，就使用 `super.method()`。

这就是从用户视角看到的全部对象系统。真正有趣的是，每个表面特性都可以对应到已有的 runtime 模型里。

## 2. Parser：先做形状，不负责运行

parser 不需要知道 `this` 是谁。它也不需要知道 `super` 指向哪个 class。parser 的任务只是认出结构。

这段源码：

```lox
class B < A {
  test() {
    super.method();
  }
}
```

会被解析成一个 statement 形状的 AST 节点：

```text
ClassStmt
  name: B
  superclass: Variable(A)
  methods:
    FunctionStmt test(...)
      body:
        Super(method)
```

class declaration 是 statement，因为它会在当前 environment 里引入一个名字。class 里的 method 复用之前的 function statement 节点，因为 method 和 function 一样，都有名字、参数和函数体。

parser 还会为对象相关语法加上 expression 节点：

```text
this                 → This expression
super.method          → Super expression
object.field          → Get expression
object.field = value  → Set expression
```

这里有一个重要边界：

> Parser 只认结构，不附加运行时意义。

parser 看到 `this.name`，可以构造 `Get(This, name)`。但它不知道 `this` 将来会是哪一个对象。parser 看到 `super.method`，可以构造 `Super(method)`。但它也不知道真正的 superclass object 是谁。

这些缺失的信息会被拆给后面两条线：resolver 负责决定名字应该去哪里找，interpreter 负责在运行时创建并填入真实对象。

![Class syntax to runtime objects](/assets/img/blog/crafting-interpreters-iv-resolver-lays-the-track-interpreter-fills-the-values/02-class-to-runtime.png)

Figure 2. parser 和 resolver 先准备地图；interpreter 再把 `LoxClass`、`LoxInstance`、field、method 和 environment 放到地图上。

## 3. Resolver：提前铺轨道，但不放火车

resolver 不执行代码。它不会创建 instance，也不会把 `this` 赋值成 `p`。它做的是解释执行之前的静态分析。

对 class 来说，resolver 的工作主要是检查合法性和记录位置：

```text
1. 当前是不是在 class 里面？
2. this 在这里能不能用？
3. super 在这里能不能用？
4. this 将来要向外走几层 environment？
5. super 将来要向外走几层 environment？
6. method body 里的变量引用要如何解析？
```

一个很好用的比喻是：resolver 负责铺铁轨。它决定之后 lookup 应该沿着哪个方向走。但此时轨道上还没有火车。

看一个简单方法：

```lox
class Person {
  sayHi() {
    print this.name;
  }
}
```

resolver 进入 `sayHi` 时，会创建一个临时 scope，里面放一个名字：

```text
scope:
  this
```

这不是一个真正的 runtime environment。它里面没有真实对象。它只是静态分析时使用的 scope。

然后 resolver 遇到 `this` 时，就可以记录：

```text
this 距离未来的 call environment 有 N 层
```

interpreter 会把这个数字存在 `locals` map 里，key 是那一个 expression node。将来解释执行到同一个 `this` expression 时，interpreter 不需要动态搜索，可以直接按照 distance 跳到对应 environment。

关键句是：

> Resolver 记录的是位置，不是值。

这个句子也能解释几个 class 相关错误。class 外面不能用 `this`，因为 resolver 没有 class scope 可以挂它。没有 superclass 的 class 里面不能用 `super`，因为运行时不会有 `super` environment。class 不能继承自己，因为 superclass reference 会指回同一个 class name。

resolver 并没有“理解对象”。它只是非常严格地处理名字。

## 4. Interpreter：把 class 语法变成 runtime object

现在开始执行。

jlox 执行下面的 class declaration：

```lox
class Person {
  init(name) {
    this.name = name;
  }

  sayHi() {
    print this.name;
  }
}
```

它会创建一个 `LoxClass` object，并把它存进当前 environment：

```text
global environment
  Person → LoxClass("Person")
```

`LoxClass` 内部按名字保存 methods：

```text
LoxClass("Person")
  methods:
    init  → LoxFunction
    sayHi → LoxFunction
```

接着执行这一行：

```lox
var p = Person("Luna");
```

因为 class 实现了 callable 接口，所以调用 `Person` 会创建一个 `LoxInstance`：

```text
global environment
  Person → LoxClass("Person")
  p      → Person instance
```

instance 自己有 field map：

```text
Person instance
  fields:
    name → "Luna"
```

这给出了对象系统最重要的分工：

```text
class    存 method
instance 存 field
```

正因为有这个分工，method 可以在所有 instance 之间共享，而每个 instance 又能有自己的状态。

这也解释了 property access。执行：

```lox
p.name
```

jlox 会去 instance 的 field map 里找。但执行：

```lox
p.sayHi
```

通常不会有一个叫 `sayHi` 的 field，于是它会去 instance 的 class 上找同名 method。如果找到了 method，interpreter 不会直接返回原始函数，而是先把这个 method 绑定到当前 instance。

这就是 `this` 变成真实值的地方。

## 5. `this`：resolver 写好地址，interpreter 放入对象

再看这个调用：

```lox
var p = Person("Luna");
p.sayHi();
```

最关键的步骤不是最后那对括号，而是 call 之前的 property access：

```lox
p.sayHi
```

interpreter 从 class 里拿到 method 以后，会做：

```text
sayHi.bind(p)
```

bind 会创建一个新的 environment，它的 parent 是 method 原来的 closure：

```text
this environment
  this → p
```

然后这个 bound function 被调用。调用时会照常创建 call environment，用来保存参数和局部变量，而这个 call environment 会指回 `this environment`。

形状大概是：

```text
sayHi call environment
  local variables...
  ↓ enclosing
this environment
  this → p
  ↓ enclosing
method closure
  ...
```

所以在 interpreter 里，`this` 不是魔法。它就是 environment 里的一个名字。

method binding 的核心是：

```java
LoxFunction bind(LoxInstance instance) {
  Environment environment = new Environment(closure);
  environment.define("this", instance);
  return new LoxFunction(declaration, environment, isInitializer);
}
```

resolver 已经提前记录了 `this` expression 应该向外走几层。interpreter 现在保证那一层 environment 存在，并且里面真的放着当前 instance。

所以：

```lox
this.name
```

意思是：

```text
1. 按 resolver distance 找到 this。
2. 这个 this 的值是 p。
3. 去 p 的 field map 里读 name。
```

![this binding in jlox](/assets/img/blog/crafting-interpreters-iv-resolver-lays-the-track-interpreter-fills-the-values/03-this-binding.png)

Figure 3. `this` 最后就是 `bind(instance)` 创建出来的普通 environment binding。resolver 记录去哪里找；interpreter 创建能让 lookup 成功的 environment。

这就是第 12 章的核心。jlox 没有把 `this` 做成隐藏的全局变量，也没有把它做成 interpreter 上的特殊 slot。它把 `this` 做成了一个被 capture 的 environment binding。

method 仍然是 function。对象是通过把这个 function 绑定到 instance 上提供的。

## 6. `init`：constructor 只是 class 自动调用的特殊 method

理解了 `this`，initializer 就很自然。

执行：

```lox
var p = Person("Luna");
```

jlox 大概做的是：

```text
1. 创建一个新的 Person instance。
2. 查找名为 init 的 method。
3. 把 init bind 到这个新 instance。
4. 调用 init("Luna")。
5. 返回这个新 instance。
```

initializer body：

```lox
init(name) {
  this.name = name;
}
```

使用的 `this` 机制和普通 method 完全一样。没有另一套 constructor binding 规则。

`init` 的特殊之处在两个地方：

```text
class call 会自动找 init
initializer 最终返回新 instance
```

第二点很重要。就算 initializer body 自然结束，class call 也会返回 instance。就算之后直接调用 `init`，jlox 也会把 initializer method 当成返回 `this` 处理。为了避免让程序变得混乱，resolver 会禁止在 initializer 里 return 一个值。

但主模型没有变：

```text
init 是 method
method binding 创建 this
class call 自动选择调用 init
```

## 7. 继承先从 method lookup 开始

现在从第 12 章进入第 13 章。

不要一上来就看 `super`。先看最简单的继承方法：

```lox
class A {
  method() {
    print "A method";
  }
}

class B < A {}

B().method();
```

运行时规则很小：

```text
B.findMethod("method")
  如果 B 有 method：返回它
  否则问 A.findMethod("method")
```

继承首先改变的是 method lookup。subclass 保存一个 superclass reference，当 subclass 里找不到 method 时，`findMethod()` 就沿着 superclass chain 往上走。

instance 仍然是一个 `B` instance：

```text
B() → B instance
```

如果 `method` 是在 `A` 里找到的，这不会把对象变成 `A` instance。method 只是从 `A` 里找到。真正调用时，它仍然会 bind 到原来的 `B` instance。

这个细节是理解 `super` 的前提。

## 8. `super`：改变查找起点，但不改变 `this`

下面这个例子把整件事都暴露出来：

```lox
class A {
  method() {
    print this.name;
  }
}

class B < A {
  test() {
    super.method();
  }
}

var b = B();
b.name = "B instance";
b.test();
```

输出是：

```text
B instance
```

为什么？

一个很容易想到但错误的解释是：“`super` 是父类对象。”

Lox 里这里没有父类对象。`B` instance 里面也没有藏着一个单独的 `A` instance。这里只有一个 receiver：

```text
b → B instance
```

正确解释是：

```text
super 决定 method lookup 从哪里开始。
this 决定 method 运行时面对哪个对象。
```

在这个例子里：

```text
super → A class
this  → b
```

所以：

```lox
super.method();
```

近似等于：

```text
superclass.findMethod("method").bind(this)()
```

也就是：

```text
1. 从 A 开始找，而不是从 B 开始。
2. 找到 A.method。
3. 把 A.method bind 到 b。
4. 运行 A.method，此时 this → b。
5. 在 A.method 内部，this.name 读的是 b.name。
```

查找从 superclass 开始，但 receiver 仍然是当前 instance。

![super method lookup and this binding](/assets/img/blog/crafting-interpreters-iv-resolver-lays-the-track-interpreter-fills-the-values/04-super-method.png)

Figure 4. `super` 和 `this` 配合工作。`super` 指向 method search 的起点 class，`this` 指向真正接收 method 的 instance。

第 13 章最重要的一句话是：

> `super` 不是另一个对象。它只是另一个 method lookup 起点。

一旦这个点想通，剩下的实现问题就变成了 environment 如何摆放。

## 9. resolver 和 interpreter 如何一起让 `super` 工作

`super` 比 `this` 更微妙，因为它同时需要两个值：

```text
superclass: method lookup 应该从哪里开始？
object:     this 应该 bind 到哪个对象？
```

resolver 不能保存这两个真实值。它仍然只能记录位置。

解析 subclass 时：

```lox
class B < A {
  test() {
    super.method();
  }
}
```

resolver 会在 methods 外面创建两个临时 scope：

```text
super scope
  super

this scope
  this

method local scope
  ...
```

从 `test` 内部看，distance 是：

```text
method local scope  distance 0
this scope          distance 1
super scope         distance 2
```

所以 resolver 会为 `super` expression 记录 distance。它还依赖一个布局规则：`this` environment 永远在 `super` environment 里面一层。

运行时，interpreter 用真实 environment 镜像这个 fake scope 布局。

执行 `class B < A` 时，它会先求出 `A`，然后创建 superclass environment：

```text
super environment
  super → A class
```

接着创建 `B` 的 methods。这些 `LoxFunction` 会 capture 存着 `super` 的 environment。

之后访问 `b.test` 时，method binding 会创建 `this` environment：

```text
this environment
  this → b
  ↓ enclosing
super environment
  super → A class
```

最后执行 `super.method()` 时，interpreter 按 resolver 记录的 distance 取值：

```java
int distance = locals.get(expr);
LoxClass superclass = (LoxClass) environment.getAt(distance, "super");
LoxInstance object = (LoxInstance) environment.getAt(distance - 1, "this");
LoxFunction method = superclass.findMethod(expr.method.lexeme);
return method.bind(object);
```

这个 `distance - 1` 就是关键。resolver 记录了 `super` 在哪里。因为 jlox 控制 environment 的布局，所以当前 `this` 一定比 `super` 近一层。

于是 `super.method()` 的完整故事是：

```text
Resolver:
  记录 super 将来在哪里
  安排 this 在 super 里面一层

Interpreter 执行 class declaration:
  创建 super → A class
  让 B 的 methods capture 它

Interpreter 访问 method:
  bind this → b

Interpreter 执行 super expression:
  按 distance 取 superclass
  按 distance - 1 取 this
  从 superclass 开始找 method
  把找到的 method bind 到当前 this
```

不需要一套单独的 OOP runtime。

## 10. 最后压缩成一个 mental model

到最后，class 系统可以压缩成一张表。

![jlox object system mental model table](/assets/img/blog/crafting-interpreters-iv-resolver-lays-the-track-interpreter-fills-the-values/05-mental-model-table.png)

Figure 5. 每个 OOP 特性最后都回到同一套实现词汇：environment、closure、resolver distance。

整篇文章可以收束成两行：

```text
Resolver:   提前算好名字应该去哪里找。
Interpreter: 运行时把真实值放到那些位置。
```

对 `this` 来说，resolver 先说 `this` 在哪里；interpreter 后来把 `this` bind 到当前 instance。

对 `super` 来说，resolver 先说 `super` 在哪里；interpreter 后来把 superclass 放进去，再把找到的方法 bind 到当前 instance。

对 method 来说，class 保存可复用的 function；instance 提供 receiver。

对 field 来说，instance 保存数据；class 不提前声明字段。

这就是为什么所有组件连起来以后，对象系统反而显得很小。

jlox 没有因为 class 到来就停止使用 environment model。相反，它把这个模型用得更彻底了。

## Closing thought

class 常常让人感觉像是语言里一套有私有规则的功能。但在 jlox 里，如果把 class 看成 function 和 closure 的延伸，它就没有那么神秘。

method 是一个带 receiver environment 的 function。

initializer 是 class 自动调用的 method。

inheritance 是递归的 method lookup。

`super` 是被 capture 的 superclass 加上当前 `this`。

resolver 铺路。interpreter 填值。同一台小小的 runtime 机器，把语言从 function 带到了 object。

## References

- [Crafting Interpreters, Chapter 12: Classes](https://craftinginterpreters.com/classes.html)
- [Crafting Interpreters, Chapter 13: Inheritance](https://craftinginterpreters.com/inheritance.html)
- [Previous post: Crafting Interpreters (II): The Tree Begins to Run](/zh/blog/crafting-interpreters-ii-tree-begins-to-run/)
