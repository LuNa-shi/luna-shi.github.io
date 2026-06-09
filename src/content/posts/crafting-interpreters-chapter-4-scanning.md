---
title: 'Crafting Interpreters: Chapter 4 - Scanning'
date: '2026-05-25'
overview: >-
  TLDR: Scanning is the first hard boundary in an interpreter: raw characters become tokens, and the rest of the
  language pipeline finally has structure to work with.
description: >-
  TLDR: Scanning is the first hard boundary in an interpreter: raw characters become tokens, and the rest of the
  language pipeline finally has structure to work with.
tags:
  - crafting-interpreters
categories:
  - learning
  - systems
math: true
toc: true
relatedPosts: true
---

<!-- notion-sync: 36b4e07a-a023-807a-8d48-ee3feeb2275d parent=Crafting interpreters url=https://app.notion.com/p/36b4e07aa023807a8d48ee3feeb2275d -->

> 核心问题：解释器如何把源代码字符切成 token？

---

第 4 章正式开始实现解释器。

这一章的核心其实很简单：

```
字符流 → token 流
```

例如：

```
var language = "lox";
print language + 1;
```

对于计算机来说，一开始只是：

```
v a r l a n g u a g e ...
```

Scanner 的任务是把它切成：

```
VAR
IDENTIFIER(language)
EQUAL
STRING("lox")
SEMICOLON
PRINT
IDENTIFIER(language)
PLUS
NUMBER(1)
SEMICOLON
EOF
```

后面的 parser、AST、解释器，全都建立在 token 之上。

---

## Token 到底是什么？

token 可以理解成：

> 编程语言里的“单词”。

例如：

```
print 123 + 456;
```

scanner 会得到：

```
PRINT
NUMBER
PLUS
NUMBER
SEMICOLON
```

书里定义的 Token 主要包含：

| 字段    | 含义         |
| ------- | ------------ |
| type    | token 类型   |
| lexeme  | 源码原始文本 |
| literal | 真正的值     |
| line    | 行号         |

例如：

```
"hello"
```

会变成：

```
type    = STRING
lexeme  = "\\"hello\\""
literal = "hello"
```

注意：

- lexeme 包含源码里的引号

- literal 是真正运行时的值

---

## Scanner 的整体结构

这一章最核心的代码其实就是：

```java
while (!isAtEnd()) {
  start = current;
  scanToken();
}
```

意思是：

```
从当前位置开始
↓
识别一个 token
↓
current 往前移动
↓
继续扫描
```

scanner 本质上就是：

> “不断读字符，不断产生 token”。

---

## 最简单的 token：单字符 token

例如：

```
(
)
+
-

;
```

这些最简单。

书里直接用：

```java
switch (c)
```

处理。

例如：

```java
case '(':
  addToken(LEFTPAREN);
  break;
```

因为：

```
一个字符 = 一个 token
```

---

## lookahead：为什么 scanner 要“偷看”？

真正重要的地方来了。

有些 token 是：

```
!=
==
<=
>=
```

问题是：

```
!
```

和：

```
!=
```

开头一样。

所以 scanner 需要：

> “向前偷看一个字符”。

书里用了：

```java
match('=')
```

例如：

```java
case '!':
  addToken(match('=') ? BANGEQUAL : BANG);
```

意思是：

```
如果后面是 =
→ 生成 !=

否则
→ 生成 !
```

这个技巧后面会反复出现。

---

## String：本章第一个真正复杂的 token

字符串不像：

```
+
;
(
```

那样一个字符就结束。

例如：

```
"hello world"
```

scanner 的过程是：

```
读到第一个 "
↓
不断向后扫描
↓
直到再次遇到 "
```

最后：

```
lexeme  = "\\"hello world\\""
literal = "hello world"
```

---

原文有个很重要的例子：

```
print "one
two";
```

Lox 允许字符串跨行。

所以 scanner 在扫描字符串时，还要：

```java
line++;
```

否则报错行号会错。

---

还有经典错误：

```
print "hello;
```

字符串没结束。

scanner 不应该直接崩掉。

而是：

```
报告错误
继续扫描
```

因为用户通常希望：

> 一次看到多个错误。

---

## Number：数字为什么没看起来简单？

scanner 不只是识别：

```
123
```

还要识别：

```
123.456
```

逻辑大概是：

```
先读整数
↓
如果看到 .
并且后面还是数字
↓
继续读小数部分
```

这里有个经典边界：

```
123.
```

后面没有数字。

这时候：

```
.
```

应该被识别成 DOT token，而不是浮点数。

所以书里写：

```java
if (peek() == '.' && isDigit(peekNext()))
```

只有：

```
点后面还是数字
```

才继续读浮点数。

这是 scanner 里典型的边界处理。

---

## Identifier 和 Keyword

例如：

```
breakfast
language
someVariable
```

都属于 identifier。

规则一般是：

```
字母或
开头
后面允许数字
```

例如：

```
abc123
```

合法。

但：

```
123abc
```

不合法。

---

然后会遇到一个关键问题：

```
class
```

到底是：

```
关键字
```

还是：

```
普通变量名
```

scanner 的做法是：

```
先按 identifier 扫描
↓
再检查它是不是关键字
```

书里用了：

```java
Map<String, TokenType>
```

例如：

```java
"class" -> CLASS
"while" -> WHILE
"for"   -> FOR
```

所以：

```
class
```

最终会变成：

```
CLASS
```

而不是 IDENTIFIER。

---

## 为什么 scanner 不直接处理语法？

这一章最容易产生的问题是：

```
既然 scanner 已经在读代码，
为什么不直接解析？
```

原因是：

> 分层会简单很多。

scanner 只负责：

```
字符 → token
```

parser 再负责：

```
token → AST
```

例如：

```
if (a + b > c)
```

scanner 不需要理解：

```
这是不是合法表达式？
```

它只需要输出：

```
IF
LEFTPAREN
IDENTIFIER
PLUS
IDENTIFIER
GREATER
IDENTIFIER
RIGHTPAREN
```

语法是否合法，是 parser 的事情。

---

## 本章最值得真正理解的例子

最值得反复看的，是 scanner 如何扫描字符串。

例如：

```
print "hello";
```

scanner 的过程：

```
current 指向 p
↓
扫描 print
↓
输出 PRINT token

current 指向 "
↓
进入 string()
↓
不断向后读
↓
直到遇到结束 "
↓
输出 STRING token

current 指向 ;
↓
输出 SEMICOLON
```

这里第一次真正体现了：

> 解释器是在“流式读取源码”。

后面的 parser、compiler、VM，本质上也都是类似思想。

---

## 本章真正重要的思想

第 4 章代码其实不复杂。

真正重要的是：

```
源码不能直接理解。
必须先切成 token。
```

token 是程序结构化理解的第一步。

没有 scanner：

```
parser 根本没法工作。
```

所以 scanner 虽然简单，但它是整个解释器流水线的入口。

---

## 本章关键词

| 词         | 含义                 |
| ---------- | -------------------- |
| Scanner    | 把字符切成 token     |
| Lexing     | Scanner 的另一种叫法 |
| Token      | 编程语言里的“词”     |
| Lexeme     | 源码原始文本         |
| Literal    | 真正运行时的值       |
| TokenType  | token 类别           |
| Lookahead  | 向前偷看字符         |
| Keyword    | 关键字               |
| Identifier | 用户定义名字         |
| EOF        | 文件结束 token       |

---

## 最后记住一句话

```
Scanner 不理解程序的“语义”。

它只是先把字符流，
切成后面阶段能理解的 token。
```
