---
title: 'Crafting Interpreters: Chapter 4 - Scanning'
date: '2026-05-25'
overview: >-
  Scanning is the first structural boundary in an interpreter: raw characters become tokens, so the parser can work with
  language units instead of individual bytes.
description: >-
  A tutorial-style note on scanner design in Crafting Interpreters, including tokens, lexemes, lookahead, strings,
  numbers, identifiers, and keyword recognition.
tags:
  - crafting-interpreters
categories:
  - learning
  - systems
math: true
toc: true
relatedPosts: false
---

<!-- notion-sync: 36b4e07a-a023-807a-8d48-ee3feeb2275d parent=Crafting interpreters url=https://app.notion.com/p/36b4e07aa023807a8d48ee3feeb2275d -->

> Question: how does an interpreter turn source-code characters into tokens?

Chapter 4 is where the interpreter stops being an idea and starts becoming a pipeline.

```text
characters -> tokens -> parser -> AST -> interpreter
```

The scanner owns the first arrow.

## The job of a scanner

Given this source:

```text
var language = "lox";
print language + 1;
```

the scanner turns a character stream into a token stream:

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

The parser should not have to care about raw characters. It wants language units.

## What is a token?

A token is a small record that captures one meaningful piece of source code.

| Field | Meaning |
| --- | --- |
| `type` | The token category |
| `lexeme` | The exact source substring |
| `literal` | The runtime value, if any |
| `line` | The source line for errors |

For the source text:

```text
"hello"
```

the token is roughly:

```text
type    = STRING
lexeme  = "\"hello\""
literal = "hello"
```

The distinction between `lexeme` and `literal` is useful. The source includes quote marks; the runtime string value does not.

## The scanner loop

The central loop is small:

```java
while (!isAtEnd()) {
  start = current;
  scanToken();
}
```

The scanner repeatedly:

```text
marks the start of a token
reads enough characters to classify it
emits a token
moves on
```

Most of the chapter is about what "enough characters" means.

## Single-character tokens

Some tokens are exactly one character:

```text
( ) { } , . - + ; * /
```

A `switch` is enough:

```java
case '(':
  addToken(LEFT_PAREN);
  break;
case '+':
  addToken(PLUS);
  break;
```

These are the easy cases because one character gives complete information.

## Lookahead

Other tokens share a prefix:

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

When the scanner sees `!`, it does not yet know whether the token is `!` or `!=`. It needs one-character lookahead:

```java
case '!':
  addToken(match('=') ? BANG_EQUAL : BANG);
  break;
```

This is the first important scanner pattern:

```text
consume the current character
peek at the next character
conditionally consume it too
```

## Strings

Strings are the first token that can span many characters:

```text
print "hello world";
```

The scanner sees the opening quote, then advances until the closing quote.

```java
while (peek() != '"' && !isAtEnd()) {
  if (peek() == '\n') line++;
  advance();
}
```

Two details matter:

- Lox allows multiline strings, so line numbers must be updated inside the string scanner.
- Unterminated strings should report an error and let scanning continue where possible.

This is a recurring interpreter habit: report the error, preserve enough state, and keep going so the user can see more than one problem.

## Numbers

Numbers look simple until decimals arrive.

```text
123
123.456
123.
```

The scanner should treat `123.456` as one number, but `123.` as `NUMBER(123)` followed by `DOT`.

That is why the decimal case checks both the dot and the next character:

```java
if (peek() == '.' && isDigit(peekNext())) {
  advance();
  while (isDigit(peek())) advance();
}
```

The boundary rule is precise:

```text
a dot belongs to a number only if a digit follows it
```

## Identifiers and keywords

Identifiers include user-defined names:

```text
breakfast
language
someVariable
```

Keywords look like identifiers at first:

```text
class
while
for
```

The scanner uses a two-step process:

```text
scan the full identifier-like word
look it up in the keyword table
```

In code, that table is a map:

```java
private static final Map<String, TokenType> keywords;

static {
  keywords.put("class", CLASS);
  keywords.put("while", WHILE);
  keywords.put("for", FOR);
}
```

So `class` becomes `CLASS`, while `breakfast` stays `IDENTIFIER`.

## Why not parse immediately?

The scanner is already reading the source, so why not parse syntax at the same time?

Because separation keeps each stage simple.

```text
scanner: characters -> tokens
parser:  tokens -> syntax tree
```

For this source:

```text
if (a + b > c)
```

the scanner only needs to output:

```text
IF LEFT_PAREN IDENTIFIER PLUS IDENTIFIER GREATER IDENTIFIER RIGHT_PAREN
```

Whether that sequence forms a complete statement is the parser's problem.

## The example to internalize

For:

```text
print "hello";
```

the scanner's movement is:

```text
current at p  -> scan print  -> emit PRINT
current at "  -> scan string -> emit STRING("hello")
current at ;  -> emit SEMICOLON
end of file   -> emit EOF
```

That flow is the real lesson of the chapter. Interpreters process a program by progressively adding structure.

## Final checkpoint

The scanner does not understand program meaning. It creates the first reliable representation of the source:

```text
raw text -> token stream
```

Without that boundary, the parser has no stable units to work with.

| Term | Meaning |
| --- | --- |
| Scanner / lexer | Turns characters into tokens |
| Token | One language unit |
| Lexeme | Exact source text for the token |
| Literal | Runtime value represented by the token |
| Lookahead | Inspecting upcoming characters before deciding |
| Keyword | Reserved word recognized after identifier scanning |
| EOF | Explicit end-of-file token |
