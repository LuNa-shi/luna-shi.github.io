---
title: Crafting Interpreters：第 4 章 扫描
date: '2026-05-25'
overview: 扫描是解释器中的第一个结构边界：原始字符变成 token，因此解析器可以使用语言单元而不是单个字节。
description: Crafting Interpreters 中扫描器设计的教程式笔记：token、lexeme、lookahead、字符串、数字、标识符和关键字识别。
math: true
toc: true
relatedPosts: false
tags:
 - crafting-interpreters
 - interpreters
 - scanning
categories:
 - learning
 - systems
lang: zh
translationKey: crafting-interpreters-chapter-4-scanning
canonicalSlug: crafting-interpreters-chapter-4-scanning
---

<!-- notion-sync: 36b4e07a-a023-807a-8d48-ee3feeb2275d parent=Crafting interpreters url=链接 0 -->

> 问题：解释器如何把源代码字符转换成 token？

第 4 章解释器不再是一个想法，而是开始成为一条管道。
```text
characters -> tokens -> parser -> AST -> interpreter
```
扫描器负责第一步。

## 扫描器的工作

鉴于此来源：
```text
var language = "lox";
print language + 1;
```
扫描器将字符流转换为 token 流：
```text
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
解析器不必关心原始字符。它需要语言单位。

## 什么是 token？

Token 是一条小记录，用来保存一段有意义的源代码。

| 字段 | 含义 |
| --- | --- |
| `type` | token 类别 |
| `lexeme` |确切的源子字符串 |
| `literal` |运行时值（如果有）|
| `line` |错误的源代码行 |

对于源码：
```text
"hello"
```
token 大致是：
```text
type = STRING
lexeme = "\"hello\""
literal = "hello"
```
`lexeme` 和 `literal` 之间的区别很有用。来源包含引号；运行时字符串值则不然。

## 扫描器循环

核心循环很小：
```java
while (!isAtEnd()) {
 start = current;
 scanToken();
}
```
扫描器反复做三件事：
```text
marks the start of a token
reads enough characters to classify it
emits a token
moves on
```
本章的大部分内容都是关于“足够的字符”的含义。

## 单字符 token

有些 token 恰好只有一个字符：
```text
( ) { } , . - + ; * /
```
`switch` 就足够了：
```java
case '(':
 addToken(LEFT_PAREN);
 break;
case '+':
 addToken(PLUS);
 break;
```
这些都是简单的情况，因为一个字符可以提供完整的信息。

## 前瞻

另一些 token 共享前缀：
```text
!
!=
=
==
<
<=
>
>=
```
当扫描器看到 `!` 时，它还不知道当前 token 是 `!` 还是 `!=`。这时需要一个字符的 lookahead：
```java
case '!':
 addToken(match('=') ? BANG_EQUAL : BANG);
 break;
```
这是第一个重要的扫描器模式：
```text
consume the current character
peek at the next character
conditionally consume it too
```
## 字符串

字符串是第一个可能跨越多个字符的 token：
```text
print "hello world";
```
扫描器看到起始引号后，会一直前进到结束引号。
```java
while (peek() != '"' && !isAtEnd()) {
 if (peek() == '\n') line++;
 advance();
}
```
有两个细节很重要：

- Lox 允许多行字符串，因此必须在字符串扫描器内更新行号。
- 未终止的字符串应报告错误并尽可能继续扫描。

这是一种反复出现的解释器习惯：报告错误，保留足够的状态，然后继续，以便用户可以看到多个问题。

## 数字

在小数出现之前，数字看起来很简单。
```text
123
123.456
123.
```
扫描器应该把 `123.456` 视为一个数字，但把 `123.` 视为 `NUMBER(123)` 后跟 `DOT`。

所以处理小数点时，既要看当前点号，也要看下一个字符：
```java
if (peek() == '.' && isDigit(peekNext())) {
 advance();
 while (isDigit(peek())) advance();
}
```
边界规则是精确的：
```text
a dot belongs to a number only if a digit follows it
```
## 标识符和关键字

标识符包括用户定义的名称：
```text
breakfast
language
someVariable
```
关键字起初看起来像标识符：
```text
class
while
for
```
扫描器使用两步：
```text
scan the full identifier-like word
look it up in the keyword table
```
在代码中，该表是一个地图：
```java
private static final Map<String, TokenType> keywords;

static {
 keywords.put("class", CLASS);
 keywords.put("while", WHILE);
 keywords.put("for", FOR);
}
```
因此，`class` 变为 `CLASS`，而 `breakfast` 仍为 `IDENTIFIER`。

## 为什么不立即解析？

扫描器已经在读取源代码，那么为什么不同时解析语法呢？

因为分离使每个阶段变得简单。
```text
scanner: characters -> tokens
parser: tokens -> syntax tree
```
对于这个来源：
```text
if (a + b > c)
```
扫描器只需要输出：
```text
IF LEFT_PAREN IDENTIFIER PLUS IDENTIFIER GREATER IDENTIFIER RIGHT_PAREN
```
该序列是否形成完整的语句是解析器的问题。

## 内化的例子

对于：
```text
print "hello";
```
扫描器的移动过程是：
```text
current at p -> scan print -> emit PRINT
current at " -> scan string -> emit STRING("hello")
current at ; -> emit SEMICOLON
end of file -> emit EOF
```
这个流程是本章的真正教训。解释器通过逐步添加结构来处理程序。

## 最终检查点

扫描器不理解程序含义。它只创建源码的第一个可靠表示：
```text
raw text -> token stream
```
如果没有这个边界，解析器就没有稳定的单元可以使用。

| 术语 | 含义 |
| --- | --- |
| 扫描器/词法分析器 | 将字符变成 token |
| token | 一种语言单元 |
| lexeme | token 对应的精确源码片段 |
| literal | token 表示的运行时值 |
| lookahead | 在做决定前查看后面的字符 |
|关键词 |标识符扫描后识别的保留字 |
| EOF |显式文件结束 token |
