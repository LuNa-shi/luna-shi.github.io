---
title: "Crafting Interpreters (III): Resolving a Name Before It Runs"
subtitle: "How the resolver gives each variable use a stable route"
series: "Crafting Interpreters: Following Lox from Source to Heap"
episode: 3
lang: en
translationKey: crafting-interpreters-iii-resolving-a-name-before-it-runs
canonicalSlug: crafting-interpreters-iii-resolving-a-name-before-it-runs
book_scope: "Chapter 11"
figures: 4
date: 2026-07-01
overview: >-
  Resolver freezes variable identity before execution: each variable-use node gets either a fixed local depth or a
  deliberate global lookup, so mutable closure environments can change without changing lexical binding.
description: "How the resolver gives each variable use a stable route."
image: /assets/img/blog/crafting-interpreters-iii-resolving-a-name-before-it-runs/fig1-one-use-one-binding.png
tags: [crafting-interpreters, interpreters, resolver, lexical-scope]
categories: [learning, systems]
toc: true
relatedPosts: true
---

# Crafting Interpreters (III): Resolving a Name Before It Runs

## How the resolver gives each variable use a stable route

TLDR: Resolver freezes variable identity before execution. Each variable-use node gets either a fixed local depth or a deliberate global lookup, so mutable closure environments can keep changing without changing what the source-level binding means.

Episode II made the tree run. Expressions produced values, statements made effects, environments stored names, function calls created fresh environments, and closures let one of those environments survive after the call that created it had returned.

That solved a lifetime question. It did not yet solve a binding question.

Start with a program that is small enough to distrust:

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

There is only one `print a;` in the source. The variable `a` is never assigned. Under Lox's lexical rule, that one variable use should keep the same declaration throughout execution, so the expected output is:

```text
global
global
```

But the interpreter we had after closures can print:

```text
global
block
```

Give the variable expression inside `showA()` a label:

```text
U_a = the Expr.Variable("a") node inside print a
```

The same AST node ran twice and changed its mind. That is the bug.

Technical promise: by the end of this episode, you should be able to follow one variable expression from source text to `Resolver.scopes`, from there to `Interpreter.locals`, and finally to `getAt()` or `globals.get()`, explaining why the repaired interpreter prints `global` twice without making environments immutable.

![Figure 1. One variable-use node keeps one declaration.](/assets/img/blog/crafting-interpreters-iii-resolving-a-name-before-it-runs/fig1-one-use-one-binding.png)

_Figure 1. The source-level binding of `U_a` is decided before execution. The later block declaration is visible in runtime time, but not in the source position where `U_a` appears._

<!--
Figure prompt: Create a 1600×900 editorial diagram with English labels and a clean technical-blog style. Use the series color system: blue for source/syntax, purple for resolver/compiler state, green for runtime state, orange for the tracked variable use/value, red for invalid late binding, navy for headings and arrows. Title: "Resolving a name before it runs". Left half: a blue source-code card showing the Lox snippet with three highlighted rows: `var a = "global";` labeled `D_global`, `print a;` labeled `U_a`, and `var a = "block";` labeled `D_block`. Right half: a white decision panel labeled "lexical binding decision". Draw an orange node `U_a / Expr.Variable("a")`, a blue node `D_global / var a = "global"`, and a red node `D_block / later var a`. Draw a solid navy arrow from `U_a` to `D_global` labeled "preceding / innermost / enclosing". Draw a dashed red arrow from `U_a` to `D_block` with a large red X and the label "not preceding when U_a is written". Bottom-right note: "The resolver records this decision before execution. The same AST node can run twice without changing meaning." Keep spacing generous; avoid overlapping code labels with code text.
-->

## 1. The rule belongs to the text, not to time

Lox uses lexical scope. A variable use can be resolved by looking at the program text, not by waiting to see how execution happens.

The rule from Chapter 11 is the one sentence this entire episode depends on:

> A variable usage refers to the preceding declaration with the same name in the innermost scope that encloses the expression where the variable is used.

Three words do the work.

**Preceding** means the declaration must appear before the use in the source text. In the opening program, the global declaration is before `U_a`:

```lox
var a = "global"; // D_global
```

The block declaration is after the function body containing `U_a`:

```lox
fun showA() {
  print a; // U_a
}

var a = "block"; // D_block
```

The function body executes later, but its text is already written. Runtime delay does not move the source position of `print a;`.

**Innermost** handles shadowing:

```lox
var a = "outer";
{
  var a = "inner";
  print a; // inner
}
```

Both declarations precede the use, but the block declaration is in the innermost enclosing scope, so it wins.

**Enclosing** limits the search to scopes that wrap the expression. A declaration somewhere else in the file is not a candidate just because it has the same spelling.

This rule is static. It does not mention environments, function calls, hash tables, or mutation. A variable expression can execute many times, but its declaration should not be re-chosen each time.

Our interpreter currently performs name lookup dynamically. Most of the time, the dynamic search happens to agree with the static rule. Closures expose the gap.

## 2. The closure remembered a mutable environment

At runtime, the opening program passes through three important states.

First, the global declaration creates a global entry:

```text
global env
  a = "global"
```

Then the block begins, creating a block environment. When the interpreter executes the function declaration, it creates a `LoxFunction`. That function stores the declaration node and the current environment as its closure.

```text
block env  # object B
  showA = <fn showA, closure → object B>
  enclosing → global env

global env
  a = "global"
```

The phrase `object B` matters. The closure does not store a frozen copy of the block. It stores a reference to the same mutable `Environment` object used by the block.

Now the first call runs:

```lox
showA();
```

Calling `showA` creates a fresh call environment whose parent is the function's closure:

```text
showA call env
  enclosing → object B

object B
  showA = <fn showA>
  enclosing → global env

global env
  a = "global"
```

The old interpreter looks up `a` by walking the current environment chain:

```text
call env: no a
object B: no a
global: a = "global"
```

So the first call prints:

```text
global
```

Then this declaration executes:

```lox
var a = "block";
```

It does not create a second block environment. It inserts a new entry into the same object B:

```text
object B
  showA = <fn showA, closure → object B>
  a = "block"
  enclosing → global env
```

The second call creates another empty call environment, again enclosing object B. If lookup asks the runtime chain, “Who is `a` today?”, it now gets a different answer:

```text
call env: no a
object B: a = "block"
```

The closure did not forget anything. The environment it remembered grew a new entry.

![Figure 2. The captured block environment changes after the closure is created.](/assets/img/blog/crafting-interpreters-iii-resolving-a-name-before-it-runs/fig2-mutable-closure-environment.png)

_Figure 2. The bug is not that `showA` failed to capture an environment. It captured a mutable environment object that later received a new binding._

<!--
Figure prompt: Create a 1600×900 editorial diagram with English labels and the same color system: blue source/syntax, purple resolver state, green runtime environments, orange captured function/variable marker, red invalid lookup, navy headings/arrows. Title: "The captured environment mutates under the closure". Use three side-by-side columns labeled `T1 declaration`, `T2 first call`, and `T3 second call`. T1: draw a green `global env` box containing `a = "global"`; above it a green `block env object B` containing `showA = <fn showA>`; above that an orange `<fn showA>` box with an orange arrow labeled `closure → B` pointing to block env. Show a green `enclosing` arrow from block env to global env. T2: draw `showA call env <empty>` above `block env object B { showA = <fn showA> }` above `global env { a = "global" }`; show green enclosing arrows and a navy lookup route that skips the first two boxes and lands on the global `a`; label it "naive lookup: no a, no a, then global a" and "prints global". T3: draw the same call env and same block env object B, but now the block box contains both `showA = <fn showA>` and orange-highlighted `a = "block"`; draw a red lookup route that stops at the new block entry, labeled "old dynamic lookup stops at new entry" and "buggy output: block". Bottom note: "The closure did not forget. The environment it remembered grew a new entry." Keep arrows outside text areas and avoid crossing labels.
-->

The fix could have been persistent, immutable environments. Each declaration would create a new environment object, and a closure would keep the old one. That would work, but it would rewrite a lot of `jlox`.

The book chooses the smaller and more useful fix: keep environments as they are, but stop re-solving local names by searching mutable runtime chains.

## 3. The resolver is a notebook, not an environment

The new mechanism is a pass between parsing and interpretation:

```java
Resolver resolver = new Resolver(interpreter);
resolver.resolve(statements);

interpreter.interpret(statements);
```

The resolver walks the AST once before execution. It does not run user code. It does not print. It does not call functions. It does not execute loops repeatedly. It visits the structure of the program to answer one static question:

```text
For this variable use, which declaration does the source text choose?
```

A useful way to keep the moving parts separate:

| Name | Stores | Exists when | Answers |
| --- | --- | --- | --- |
| AST | statements and expressions | after parsing | where does this use appear? |
| `Resolver.scopes` | `name → declared/defined` | during resolution | is this name visible here in the source? |
| `Environment.values` | `name → runtime value` | during interpretation | what value does this name have now? |
| `Interpreter.locals` | `Expr node → depth` | after resolution, used at runtime | how many environment links should this use follow? |

The resolver's scope stack is not a runtime environment. It does not store runtime values like `"global"`, `"block"`, `40`, or `true`. It stores whether a name is visible at the current source position.

In `jlox`, the field is:

```java
private final Stack<Map<String, Boolean>> scopes = new Stack<>();
```

The Boolean distinguishes two declaration states:

```text
false  declared, but not ready to read
true   defined, ready to read
```

That split catches a confusing initializer:

```lox
var a = "outer";

{
  var a = a;
}
```

For a local variable, the resolver first declares the name, then resolves the initializer, then defines the name:

```java
declare(stmt.name);
resolve(stmt.initializer);
define(stmt.name);
```

During the initializer, the local `a` exists in the resolver map but is marked `false`. If the initializer tries to read that same local variable, the resolver reports an error. This is declaration state, not runtime state. No Lox value is needed to detect the problem.

Now trace the opening program through the resolver.

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

At top level, global variables are not recorded in `Resolver.scopes`, so after `var a = "global";` the local scope stack is still empty.

Entering the block pushes one local scope:

```text
scopes = [
  {}
]
```

Resolving the function declaration adds `showA` to that block scope:

```text
scopes = [
  { showA: true }
]
```

Then the resolver enters the function body. It pushes a function scope for parameters and locals:

```text
scopes = [
  { showA: true },
  {}
]
```

Now it reaches the important node:

```lox
print a; // U_a
```

The resolver searches from the innermost local scope outward:

```text
function scope: no a
block scope:    no a
```

No local declaration is found. Since globals are not tracked in the local stack, the resolver leaves this expression absent from `Interpreter.locals`.

```text
Interpreter.locals[U_a] = absent
```

Absent does not mean forgotten. It means:

```text
At runtime, look in globals.
```

Only after resolving `U_a` does the resolver later reach:

```lox
var a = "block";
```

Then the block scope becomes:

```text
scopes = [
  { showA: true, a: true }
]
```

Source time has already passed `U_a`. The later block `a` cannot retroactively become the declaration for a variable expression that appeared earlier in the function body.

![Figure 3. The resolver records the route for each expression node.](/assets/img/blog/crafting-interpreters-iii-resolving-a-name-before-it-runs/fig3-resolver-notebook.png)

_Figure 3. While resolving `U_a`, the resolver can see `showA` in the block scope, but not the later block `a`. No local depth is recorded, so runtime global lookup is intentional._

<!--
Figure prompt: Create a 1600×900 editorial diagram with English labels. Use blue for source, purple for resolver state, orange for `U_a`, red for invalid retroactive binding, navy for arrows and headings. Title: "Resolver notebook: scopes are not environments". Left: blue source-code card showing the opening snippet; highlight `print a;` as `U_a` in orange and the later `var a = "block";` as `D_block later` in red. Middle: purple panel labeled `Resolver.scopes at U_a` with a vertical stack: top `function scope { }`, below `block scope { showA: true }`, below muted `global scope / not tracked here`. Draw an orange arrow from the highlighted source `U_a` into the stack labeled `resolve U_a`. Draw a dashed red arrow from the later `D_block` toward the resolver stack, crossed out, labeled `later declaration cannot rewrite U_a`. Right: white panel labeled `Interpreter.locals`; include rows `U_a → absent / means: globals.get("a")`, `showA call #1 → depth 0`, `showA call #2 → depth 0`, and an inset `Control case: Expr.Variable(b) → depth 1`. Keep the diagram calm, with clear card spacing and no overlapping text.
-->

## 4. Depth turns a binding into a route

The opening bug is the global case, so `U_a` has no local depth. To see the positive case, use a local that really is found:

```lox
{
  var b = "outer";

  fun f() {
    print b;
  }

  f();
}
```

When the resolver reaches `print b`, the scope stack looks like this:

```text
scopes = [
  { b: true, f: true },
  {}
]
```

The top scope is the function body. The next one is the surrounding block.

The resolver searches from inside out:

```text
function scope: no b
block scope:    b found
```

The declaration is one scope outside the current one, so the resolver records:

```text
Interpreter.locals[U_b] = 1
```

The implementation is compact:

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

The distance is the number of enclosing-scope hops from the current innermost scope to the scope where the name was found. Current scope is depth `0`. Immediately enclosing scope is depth `1`. One more level out is depth `2`.

The resolver hands that number to the interpreter:

```java
void resolve(Expr expr, int depth) {
  locals.put(expr, depth);
}
```

The interpreter stores it in a side table:

```java
private final Map<Expr, Integer> locals = new HashMap<>();
```

The key is the expression node, not the variable name string.

That matters here:

```lox
var a = "global";

{
  var a = "block";
  print a; // U_inner
}

print a;   // U_global
```

Both variable expressions use the lexeme `"a"`. They do not have the same binding.

The table is not:

```text
"a" → one answer
```

It is:

```text
U_inner  → depth 0
U_global → absent, global
```

Each `Expr.Variable` object has identity. The side table attaches resolved data to that exact node.

## 5. Runtime lookup follows the route instead of searching

Before the resolver, variable lookup treated the environment chain as a search problem:

```text
environment.get(name)
  try current
  try enclosing
  try enclosing.enclosing
  ...
```

After resolution, local lookup becomes indexed access:

```text
lookUpVariable(name, expr)
  find this expression's distance
  if distance exists:
      getAt(distance, name)
  else:
      globals.get(name)
```

The interpreter code becomes:

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

For local variables, `Environment` gets a fixed-hop accessor:

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

Assignments use the same route:

```java
void assignAt(int distance, Token name, Object value) {
  ancestor(distance).values.put(name.lexeme, value);
}
```

This does not replace environments. The runtime still uses a chain of `Environment` objects. The difference is that a resolved local no longer asks, “Where is the nearest matching name today?” It already knows which link to jump to.

Now replay the second `showA()` call after the block declaration has executed:

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

The tempting block `a` exists at runtime. But the variable expression inside `showA` has this resolution:

```text
locals.get(U_a) = null
```

So the interpreter does not call:

```text
environment.get("a")
```

It calls:

```text
globals.get("a")
```

The result is:

```text
global
```

The block environment still mutates. The closure still points to it. The fix is that `U_a` no longer asks that environment whether it has an `a`.

The resolver does not freeze environments. It freezes lookup decisions.

## 6. Return to `makeCounter`: identity meets lifetime

Now return to the series program:

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

Episode II explained why `n` can survive. When `tick` is declared, the `LoxFunction` for `tick` captures the current environment: the call environment for `makeCounter`. When `makeCounter` returns, the Java call is gone, but the returned function still points to that environment.

That is lifetime.

Episode III explains identity.

During resolution, the resolver enters `makeCounter`'s function scope and binds the parameter:

```text
makeCounter scope:
  start: true
```

Then it resolves:

```lox
var n = start;
```

`n` is declared, the initializer `start` resolves to depth `0`, and then `n` is defined:

```text
makeCounter scope:
  start: true
  n: true
```

Then the resolver reaches the nested function:

```lox
fun tick() {
  n = n + 1;
  return n;
}
```

It declares and defines `tick` in the `makeCounter` scope, then enters a new function scope for the body of `tick`:

```text
scopes = [
  { start: true, n: true, tick: true },
  {}
]
```

Inside `tick`, every use of `n` searches outward:

```text
tick scope:        no n
makeCounter scope: n found
```

So each `n` inside `tick` receives depth `1`:

```text
Expr.Assign(n in n = ...)       → 1
Expr.Variable(n in n + 1)       → 1
Expr.Variable(n in return n)    → 1
```

At runtime, after `makeCounter(40)` returns, the retained environment looks like:

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

When `counter()` runs, the call environment for `tick` encloses the captured `makeCounter` environment:

```text
tick call env
  enclosing → makeCounter call env
                  n = 40
```

The assignment uses the resolved route:

```text
getAt(1, "n")      → 40
assignAt(1, "n")   → 41
getAt(1, "n")      → 41
```

Then `return n;` returns `41`.

![Figure 4. Resolver identity and closure lifetime meet in makeCounter.](/assets/img/blog/crafting-interpreters-iii-resolving-a-name-before-it-runs/fig4-counter-identity-lifetime.png)

_Figure 4. The resolver gives each `n` inside `tick` a depth of 1. The closure keeps the environment at that depth reachable after `makeCounter` returns._

<!--
Figure prompt: Create a 1600×900 editorial diagram with English labels. Use blue for source/syntax, purple for resolver routes, green for runtime environments, orange for the tracked `n`, navy for headings/arrows. Title: "makeCounter: identity meets lifetime". Left panel: blue source-code card for `makeCounter(start)` with orange highlights on `var n = start`, `n = n + 1`, and `return n`; label the declaration `D_n` and the uses/assignment `U_n`. Middle panel: purple `Resolver routes` table with rows `Assign n → depth 1`, `Variable n in n + 1 → depth 1`, `Variable n in return → depth 1`, plus an orange note `same declaration: var n`. Right panel: green runtime state with `tick call env <empty>` above `makeCounter call env { start = 40, n = 40 → 41, tick = <fn tick> }`, plus `global counter → <fn tick, closure → makeCounter env>` below. Draw green closure/enclosing arrows, and navy arrows labeled `getAt(1, "n")` and `assignAt(1, "n")` from the resolver routes to the orange `n` entry. Bottom banner: "Resolver freezes identity. Closure preserves lifetime." Keep `n` visually orange and recognizable.
-->

So where is `n` now?

```text
source text        var n = start;
variable uses      each n inside tick
lexical binding    those uses refer to makeCounter's n
resolver route     Expr → depth 1
runtime storage    makeCounter call environment
lifetime reason    tick's closure keeps that environment reachable
```

The resolver answers:

```text
Which declaration is this n?
```

The closure answers:

```text
Why is that declaration's storage still alive?
```

Keeping those questions separate makes closures much less magical.

## 7. Static errors are a bonus, not the main fix

Once the interpreter has a semantic pass, it can also reject some impossible states before runtime.

We already saw one:

```lox
var a = "outer";

{
  var a = a;
}
```

Inside the initializer, the local `a` exists in the resolver's current scope map but is marked `false`, so the resolver reports:

```text
Can't read local variable in its own initializer.
```

Another example is duplicate local declarations:

```lox
fun bad() {
  var a = "first";
  var a = "second";
}
```

The resolver can see that the current local scope already contains `a`, so it reports a static error.

A third example is top-level `return`:

```lox
return "at top level";
```

The runtime `Return` exception only makes sense inside a function call. The resolver tracks whether it is currently inside a function and rejects a return statement outside one.

These checks are useful, but they are not the core of this episode. The central job is still name identity: each variable use should carry a stable route from source meaning to runtime storage.

That same idea will matter again when `this` appears. `this` looks like a variable expression, but it is only meaningful inside methods. The resolver is the right place to know that.

## 8. Re-run the bug: the binding edge is fixed

Return to the opening program:

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

After resolution, the interesting table is:

```text
U_a inside showA       → absent from locals → global
first showA callee     → depth 0
second showA callee    → depth 0
```

When the first call runs:

```text
U_a:
  locals.get(U_a) = null
  globals.get("a") = "global"
```

When the block-local declaration runs, the block environment becomes:

```text
block env
  showA = <fn showA>
  a = "block"
```

When the second call runs:

```text
U_a:
  locals.get(U_a) = null
  globals.get("a") = "global"
```

So the output is:

```text
global
global
```

The same AST node executed twice. The runtime environment changed between the two executions. The binding did not.

Checkpoint:

```text
Environment stores values.
Closure preserves environments.
Resolver records name identity.
Interpreter.locals stores routes.
getAt() and assignAt() follow those routes.
```

The broader lesson is small but durable:

> Runtime containers are allowed to change. Source-level relationships that must not change need their own representation.

### Source map

Primary source:

- Robert Nystrom, *Crafting Interpreters*, Chapter 11, ["Resolving and Binding"](https://craftinginterpreters.com/resolving-and-binding.html): static scope, the `showA()` closure-scope bug, mutable environments, the resolver pass, `Resolver.scopes`, `declare()` / `define()`, `resolveLocal()`, `Interpreter.locals`, `lookUpVariable()`, `getAt()`, `assignAt()`, and running the resolver before interpretation.
- Robert Nystrom, *Crafting Interpreters*, Chapter 12, ["Classes"](https://craftinginterpreters.com/classes.html): the next episode's bridge to `this`, methods, and `LoxFunction.bind()`.

Implementation entry points:

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

Previous episode:

- [Crafting Interpreters (II): The Tree Begins to Run](/blog/crafting-interpreters-ii-tree-begins-to-run/): runtime values, environments, function call environments, closure capture, and the leftover binding mystery.

### Bridge to Episode IV

Episode III fixed ordinary variable identity. A variable expression now carries a stable route from source meaning to runtime storage.

Episode IV moves that pressure into objects:

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

Now `n` is no longer a lexical local variable. It is a field reached through `this`.

That changes the question. The receiver `this` is lexical, but the field name `n` is looked up on an instance at runtime. When a method is pulled off an object and called later, the method still needs to remember which instance supplied `this`.

So Episode IV asks a new version of the same question:

> A local variable needed a stable declaration. What does a method need so that `this.n` still finds the right object later?
