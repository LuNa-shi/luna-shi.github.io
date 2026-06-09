---
title: 'Crafting Interpreters: Chapter 3 - The Lox Language'
date: '2026-05-25'
overview: >-
  TLDR: Lox is the small language that carries the book: expressive enough for classes, closures, and control flow, but
  compact enough to implement twice.
description: >-
  TLDR: Lox is the small language that carries the book: expressive enough for classes, closures, and control flow, but
  compact enough to implement twice.
tags:
  - crafting-interpreters
categories:
  - learning
  - systems
math: true
toc: true
relatedPosts: true
---

<!-- notion-sync: 36b4e07a-a023-80ed-bbe1-ed954cdf9b57 parent=Crafting interpreters url=https://app.notion.com/p/36b4e07aa02380edbbe1ed954cdf9b57 -->

> 核心问题：Lox 是一门什么样的语言？它提供哪些语法和能力？

---

## 0. 本章一句话

第 3 章是在介绍本书后面要实现的语言：**Lox**。

Lox 是一门小型、高层、动态类型、自动内存管理的脚本语言。

它故意设计得不大，目的是让我们能在一本书里完整实现两遍：一次用 Java，一次用 C。

本章可以理解为：

> 先看一眼终点，再开始造解释器。

---

## 1. Hello, Lox

最小的 Lox 程序：

```
print "Hello, world!";
```

可以看到几个特点：

- 使用 C 风格语法

- 字符串用双引号

- 语句以分号结尾

- `print` 是内置语句，不是函数

Lox 选择 C-like syntax，不是因为它最优雅，而是因为熟悉。

Java、C、JavaScript 用户读起来都不会太陌生。

---

## 2. Lox 是高层脚本语言

Lox 借鉴了 JavaScript、Scheme、Lua 等小型高层语言。

它有两个重要特点：

### Dynamic Typing

Lox 是动态类型语言。

变量不固定类型：

```
var x = 123;
x = "hello";
```

类型错误不会在编译前检查，而是在运行时发现。

例如：

```
"hello" / 3
```

这种错误会在执行到这里时才报错。

---

### Automatic Memory Management

Lox 自动管理内存。

用户不用手动写：

```c
free(ptr);
```

后面实现 C 版解释器时，会自己写 garbage collector。

### 记忆点

Lox 的设计目标不是工业级完整语言，而是教学用完整语言：

足够小，但包含真实语言的重要机制。

---

## 3. Lox 的基本数据类型

Lox 内置类型很少：

### Boolean

```
true;
false;
```

用于逻辑判断。

---

### Number

Lox 只有一种数字类型：double-precision floating point。

```
1234;
12.34;
```

没有 int、float、long 的区分。

---

### String

```
"I am a string";
"";
"123";
```

注意：

```
123;    // number
"123";  // string
```

---

### Nil

```
nil;
```

表示“没有值”，类似其他语言里的 `null`。

---

## 4. 表达式 Expressions

表达式的主要作用是：

> 产生一个值。

### Arithmetic

```
a + b;
a - b;
a  b;
a / b;
-a;
```

`+` 比较特殊：

```
1 + 2;              // 数字加法
"hello " + "lox";   // 字符串拼接
```

---

### Comparison

```
a < b;
a <= b;
a > b;
a >= b;
```

比较运算返回 Boolean。

---

### Equality

```
1 == 2;
"cat" != "dog";
123 == "123";
```

不同类型的值不会自动转换。

---

### Logical Operators

```
!true;
true and false;
nil or "default";
```

`and` 和 `or` 会 short-circuit：

```
false and expensiveCall();
true or expensiveCall();
```

右边可能根本不会执行。

---

### Grouping

```
var average = (min + max) / 2;
```

括号用于改变优先级。

---

## 5. 语句 Statements

语句的主要作用是：

> 产生效果，而不是产生值。

例如输出、修改变量、控制流程。

### Print Statement

```
print "hello";
print 1 + 2;
```

---

### Expression Statement

```
someFunction();
a = 3;
```

表达式加分号，就可以当语句执行。

---

### Block

```
{
  print "one";
  print "two";
}
```

block 可以把多个语句包成一个语句，同时也会影响作用域。

---

## 6. Variables

声明变量：

```
var name = "lox";
var empty;
```

如果没有 initializer，默认值是：

```
nil
```

读取和修改变量：

```
var breakfast = "bagels";
print breakfast;

breakfast = "beignets";
print breakfast;
```

### 记忆点

变量让程序可以保存状态。

没有变量，语言更像计算器。

---

## 7. Control Flow

Lox 有基本控制流。

### if

```
if (condition) {
  print "yes";
} else {
  print "no";
}
```

### while

```
var a = 1;
while (a < 10) {
  print a;
  a = a + 1;
}
```

### for

```
for (var a = 1; a < 10; a = a + 1) {
  print a;
}
```

Lox 的 `for` 是 C 风格 for loop，不是 foreach。

---

## 8. Functions

函数调用：

```
makeBreakfast(bacon, eggs, toast);
makeBreakfast();
```

定义函数：

```
fun printSum(a, b) {
  print a + b;
}
```

返回值：

```
fun add(a, b) {
  return a + b;
}
```

如果没有显式 `return`，函数默认返回：

```
nil
```

---

## 9. 参数 vs 实参

本章特别区分两个词：

### Parameter

函数声明里的变量：

```
fun add(a, b) {
  return a + b;
}
```

这里 `a` 和 `b` 是 parameters。

### Argument

调用函数时传入的实际值：

```
add(1, 2);
```

这里 `1` 和 `2` 是 arguments。

---

## 10. First-class Functions

Lox 的函数是一等值。

也就是说，函数可以：

- 存进变量

- 作为参数传递

- 作为返回值返回

例子：

```
fun addPair(a, b) {
  return a + b;
}

fun identity(a) {
  return a;
}

print identity(addPair)(1, 2);
```

这里 `identity(addPair)` 返回函数本身，然后继续调用。

---

## 11. Closures

Lox 支持闭包。

例子：

```
fun returnFunction() {
  var outside = "outside";

  fun inner() {
    print outside;
  }

  return inner;
}

var fn = returnFunction();
fn();
```

`inner()` 使用了外层函数里的变量 `outside`。

即使 `returnFunction()` 已经结束，`inner()` 仍然能记住这个变量。

这就是 closure。

### 记忆点

closure 的核心是：

> 函数不仅保存自己的代码，也保存它需要的外部变量环境。

---

| 模块         | 你需要知道什么                                    | 例子                                    | 重要性                     |
| ------------ | ------------------------------------------------- | --------------------------------------- | -------------------------- |
| Lox 定位     | 小型、高层、动态类型脚本语言                      | 类似 JavaScript / Lua / Scheme 的简化版 | 理解后面为什么设计得很小   |
| 基本程序     | `print` 是内置语句，不是函数                      | `print "Hello";`                        | 用来测试解释器是否能输出   |
| 动态类型     | 变量类型可变，错误运行时发现                      | `var x = 1; x = "hi";`                  | 后面解释器用 `Object` 存值 |
| 自动内存管理 | 用户不用手动释放内存                              | 不写 `free()`                           | 后面 C 版会实现 GC         |
| Boolean      | 真假值                                            | `true`, `false`                         | 条件判断基础               |
| Number       | 只有一种数字，double                              | `123`, `12.34`                          | 简化数字系统               |
| String       | 双引号字符串                                      | `"hello"`                               | `+` 可用于字符串拼接       |
| Nil          | 表示“没有值”                                      | `nil`                                   | 类似 `null`                |
| 表达式       | 产生值的代码                                      | `1 + 2 * 3`                             | 解释器最先实现的部分       |
| 算术运算     | 数字运算，`+` 也可拼字符串                        | `1 + 2`, `"a" + "b"`                    | 需要运行时类型检查         |
| 比较运算     | 比较数字，返回 Boolean                            | `a < b`, `a >= b`                       | 控制流常用                 |
| 相等判断     | 可比较任意类型                                    | `123 == "123"`                          | 不做隐式转换               |
| 逻辑运算     | `and` / `or` 会短路                               | `false and call()`                      | 本质上也带控制流           |
| 分组         | 括号改变优先级                                    | `(min + max) / 2`                       | 影响 AST 结构              |
| 语句         | 产生效果，不一定产生值                            | `print x;`                              | 程序不只是算值             |
| Block        | 多条语句组成一个作用域                            | `{ var a = 1; }`                        | 后面作用域和闭包的基础     |
| 变量         | 保存状态                                          | `var a = 1; a = 2;`                     | 让程序从计算器变成语言     |
| if           | 条件执行                                          | `if (ok) print "yes";`                  | 分支控制流                 |
| while        | 条件循环                                          | `while (i < 10) { ... }`                | 重复执行                   |
| for          | C 风格循环                                        | `for (var i = 0; i < 10; i = i + 1)`    | 后面会被 desugar 成 while  |
| 函数定义     | 用 `fun` 声明函数                                 | `fun add(a, b) { return a + b; }`       | 代码复用                   |
| 参数 / 实参  | parameter 是声明里的变量，argument 是调用时传的值 | `fun f(a)` / `f(1)`                     | 避免概念混淆               |
| 返回值       | `return` 返回结果；没有返回则是 `nil`             | `return a + b;`                         | 函数调用结果               |
| 一等函数     | 函数可以存变量、传参、返回                        | `var f = add;`                          | 闭包和函数式写法基础       |
| 闭包         | 函数能记住外层变量                                | inner function 使用 outer variable      | 后面实现作用域的难点       |

## 12. Classes：本章重点

Lox 既有函数式语言特征，也有面向对象特征。

本章最值得重点关注的是 class。

---

## 12.1 为什么 Lox 要支持类

作者加入 class，不是因为 Lox 要做成大型语言，而是因为：

- OOP 很常见

- 很多程序员熟悉 class

- class 能把状态和行为组织在一起

- 语言实现书经常略过 OOP，实现它很有价值

在动态类型语言里，object 特别有用，因为它提供了一种组织复合数据的方式。

---

## 12.2 Class vs Prototype

对象系统常见有两条路线：

### Class-based

代表：

- Java

- C++

- C#

- Ruby

- Python

核心概念：

```
class → 描述对象的行为
instance → 具体对象，保存状态
```

调用方法时，通常是：

```
instance → 找到 class → 在 class 中查找 method
```

---

### Prototype-based

代表：

- JavaScript

核心概念：

```
只有 object，没有 class
```

对象可以直接继承另一个对象。

作者认为 prototype 更简单、更灵活，但很多用户最后会自己模拟 class。

所以 Lox 直接内置 class。

---

## 12.3 声明 Class

Lox 中声明类：

```
class Breakfast {
  cook() {
    print "Eggs a-fryin'!";
  }

  serve(who) {
    print "Enjoy your breakfast, " + who + ".";
  }
}
```

特点：

- 用 `class` 关键字

- 方法写在 class body 里

- 方法声明不写 `fun`

- class 本身也是一个值

---

## 12.4 Class 是 first-class value

Lox 中 class 也是一等值。

可以存进变量：

```
var SomeClass = Breakfast;
```

可以传给函数：

```
someFunction(Breakfast);
```

这和函数是一等值类似。

### 记忆点

在 Lox 里，class 不只是语法结构，也是运行时对象。

---

## 12.5 创建实例

Lox 没有 `new` 关键字。

创建实例的方式是：

```
var breakfast = Breakfast();
```

也就是：

> 调用 class，得到 instance。

这和 Python 很像。

```
print breakfast;
```

会得到类似：

```
Breakfast instance
```

---

## 12.6 Fields：对象字段

Lox 的对象可以自由添加字段。

```
breakfast.meat = "sausage";
breakfast.bread = "sourdough";
```

读取字段：

```
print breakfast.meat;
print breakfast.bread;
```

特点：

- 不需要提前声明字段

- 给字段赋值时，如果字段不存在，就创建它

- 这和 JavaScript、Python 比较像

### 和 Java 的区别

Java 里字段通常在 class 里提前声明：

```java
class Breakfast {
  String meat;
  String bread;
}
```

Lox 不需要这样。

---

## 12.7 Methods：对象方法

方法定义在 class 里：

```
class Breakfast {
  cook() {
    print "Eggs a-fryin'!";
  }
}
```

调用方法：

```
var breakfast = Breakfast();
breakfast.cook();
```

方法和函数很像，但方法通常会操作当前对象。

---

## 12.8 this

在方法内部，用 `this` 指向当前对象。

```
class Breakfast {
  serve(who) {
    print "Enjoy your " + this.meat + " and " +
          this.bread + ", " + who + ".";
  }
}
```

使用：

```
var breakfast = Breakfast();
breakfast.meat = "bacon";
breakfast.bread = "toast";

breakfast.serve("reader");
```

`this.meat` 和 `this.bread` 读取的是当前实例上的字段。

### 记忆点

`this` 让方法知道“我正在操作哪个对象”。

---

## 12.9 init：初始化方法

Lox 用特殊方法 `init()` 作为 initializer。

```
class Breakfast {
  init(meat, bread) {
    this.meat = meat;
    this.bread = bread;
  }

  serve(who) {
    print "Enjoy your " + this.meat + " and " +
          this.bread + ", " + who + ".";
  }
}
```

创建实例时传参：

```
var baconAndToast = Breakfast("bacon", "toast");
baconAndToast.serve("Dear Reader");
```

执行逻辑是：

```
调用 class
→ 创建 instance
→ 自动调用 init
→ 返回 instance
```

### 记忆点

`init()` 不是普通函数意义上的 constructor，但承担初始化对象状态的作用。

---

## 12.10 Inheritance：继承

Lox 支持单继承。

语法：

```
class Brunch < Breakfast {
  drink() {
    print "How about a Bloody Mary?";
  }
}
```

含义：

```
Brunch 继承 Breakfast
```

所以 `Brunch` 的实例可以使用 `Breakfast` 的方法。

```
var benedict = Brunch("ham", "English muffin");
benedict.serve("Noble Reader");
```

这里 `serve()` 来自 superclass `Breakfast`。

---

## 12.11 superclass 和 subclass

术语：

```
Breakfast → superclass / base class
Brunch    → subclass / derived class
```

继承表示：

> subclass 拥有 superclass 的方法，并可以添加自己的方法。

Lox 只支持单继承，也就是一个类最多继承一个父类。

---

## 12.12 super

如果子类重写了方法，但还想调用父类的方法，用 `super`。

例子：

```
class Brunch < Breakfast {
  init(meat, bread, drink) {
    super.init(meat, bread);
    this.drink = drink;
  }
}
```

这里：

```
super.init(meat, bread);
```

调用的是父类 `Breakfast` 的 `init()`。

### 记忆点

`this` 指当前对象。

`super` 指父类方法查找起点。

---

## 12.13 Lox 的 OOP 特点总结

Lox 的 class 系统包括：

- class declaration

- instance creation

- fields

- methods

- this

- init initializer

- single inheritance

- super

但它不是纯 OOP 语言。

因为：

- number、string、boolean、nil 不是 class instance

- primitive values 没有方法

- 标准库很小

如果把 Lox 做成真正给用户用的语言，这部分可能需要补强。

---

## 13. Standard Library

Lox 的标准库非常小。

本书主要只需要：

```
print
clock()
```

`print` 用于输出。

`clock()` 用于后面做性能测试。

作者没有加入复杂标准库，因为本书重点是语言实现，不是库设计。

缺少的东西包括：

- 文件 I/O

- 字符串库

- 数学库

- 网络

- 用户输入

- 数据结构库

---

## 14. 本章关键词

### Lox

本书要实现的小型脚本语言。

### Dynamic Typing

变量没有固定类型，类型错误在运行时检查。

### Nil

表示没有值。

### Expression

产生值的代码片段。

### Statement

产生效果的代码片段。

### Function

可调用代码块。

### First-class Function

函数可以像普通值一样传递和返回。

### Closure

函数保存它需要的外部变量环境。

### Class

创建对象的模板，同时也是运行时值。

### Instance

由 class 创建出来的具体对象。

### Field

对象上的数据属性。

### Method

定义在 class 里的函数。

### this

当前实例。

### init

初始化实例的方法。

### Inheritance

子类复用父类方法的机制。

### super

从父类开始查找方法。

---

## 15. 复习总结

第 3 章介绍了 Lox 的语言特性。

Lox 有动态类型、自动内存管理、基本数据类型、表达式、语句、变量、控制流、函数和闭包。

其中 class 是本章最重要的高级结构：它让 Lox 支持面向对象编程。

Lox 的 class 系统比较简洁：

```
class 定义行为
instance 保存状态
field 保存数据
method 操作对象
this 指当前对象
init 初始化对象
super 调用父类方法
```

最后要记住：

**Lox 不是为了功能完整，而是为了教学完整。它足够小，但覆盖了解释器实现中最重要的语言机制。**
