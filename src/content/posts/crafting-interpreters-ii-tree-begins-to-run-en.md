---
title: >-
  Crafting Interpreters (II): The Tree Begins to Run
date: '2026-06-30'
overview: >-
  An AST becomes a run when the interpreter walks it: expressions produce values, statements create effects, environments hold state, control flow chooses subtrees, and closures preserve captured scope.
description: >-
  A Crafting Interpreters note on how ASTs become runtime values, effects, environments, control flow, calls, and closures.
image: /assets/img/blog/crafting-interpreters-ii-tree-begins-to-run-en/ci-ii-figure-1-ast-to-run.png
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
lang: en
translationKey: crafting-interpreters-ii-tree-begins-to-run
canonicalSlug: crafting-interpreters-ii-tree-begins-to-run
---

# Crafting Interpreters (II): The Tree Begins to Run

## How executable structure becomes values, effects, state, control flow, calls, and closures

TL;DR: An AST does not run itself. The interpreter walks the tree, turns expression nodes into runtime values, uses statements to create effects, stores names in chained environments, changes traversal through control flow, and lets functions carry environments as closures.

[Episode I](https://luna-shi.github.io/blog/crafting-interpreters-1-when-source-text-becomes-structure/) stopped with source text turned into executable structure. The parser had chosen a tree, but the tree was still inert. `Literal(2)` was syntax that could produce a value later; it was not yet a value moving through a program.

Episode II begins at that boundary. The question is no longer:

> How does source text become a tree?

The question is:

> How does that tree become a run?

We will trace one small report program. It is deliberately plain: Lox does not automatically concatenate strings and numbers, so labels and numeric values print on separate lines.

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

The output is:

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

The whole runtime question is hidden in one line:

```text
total = running(row(day, amount));
```

When this line runs, which expression produces which value, which statement changes which state, which environment stores each name, which nodes run next, and why does the hidden `sum` survive after `makeTotal()` has returned?

The complete journey is compact enough to write as a chain:

```text
AST → values → effects → environments → control flow → calls → closures
```

Each arrow resolves a different uncertainty. Expressions produce values. Statements make those values observable or durable. Environments give names a runtime home. Control flow changes which subtrees are visited. Function calls create new execution boundaries. Closures let some of those boundaries outlive the call that created them.

The same questions appear in larger languages. C and Rust have expression order, block scopes, function call frames, and returns. JavaScript and Python make closures part of daily programming. Lox keeps the model small enough that we can watch each piece move.

Technical promise: by the end of this article, you should be able to trace `total = running(row(day, amount));` through expression evaluation, argument evaluation, function calls, parameter binding, return unwinding, assignment, environment lookup, loop desugaring, and closure capture.

![AST to runtime report: source code becomes an AST, then the interpreter produces values, output, environment changes, control-flow choices, return values, and captured state.](/assets/img/blog/crafting-interpreters-ii-tree-begins-to-run-en/ci-ii-figure-1-ast-to-run.png)

Figure 1. Episode I produced the tree. Episode II asks how the interpreter turns that tree into a runtime report.

## 1. The AST remembers ownership; the interpreter creates time

At the top level, a Lox program is a list of statements. Our report begins with two function declarations, then two variable declarations, then a loop, a branch, and two final prints.

That gives one simple rule:

```text
Top-level statements execute in order unless control flow changes the path.
```

Inside those statements, the interpreter keeps switching between two verbs:

```java
private Object evaluate(Expr expr) {
  return expr.accept(this);
}

private void execute(Stmt stmt) {
  stmt.accept(this);
}
```

`evaluate(expr)` runs an expression and returns a Lox value. `execute(stmt)` runs a statement and performs an effect. The distinction matters because the tree contains both kinds of nodes. A binary expression asks, "What value do I produce?" A `print` statement asks, "What action do I perform?"

Now focus on the loop body:

```text
var amount = day * 10;
total = running(row(day, amount));
```

The second line is an expression statement whose expression is an assignment. The assignment cannot change `total` until the right-hand side has produced a value. The right-hand side is a call:

```text
running(row(day, amount))
```

That call contains another call as its argument:

```text
Call running
  argument:
    Call row
      argument: day
      argument: amount
```

So the tree fixes ownership: `row(day, amount)` is an argument to `running(...)`; `running(...)` is the right-hand side of `total = ...`; the assignment is inside the loop body.

The interpreter supplies time:

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

This is the runtime equivalent of Episode I's parsing trace. In the first episode, the parser's call stack temporarily remembered which grammar rule was waiting for which subtree. Here, the interpreter's Java call stack temporarily remembers which runtime operation is waiting for which value.

The tree is static. The traversal happens at runtime.

![Core line trace: `total = running(row(day, amount));` as an AST fragment beside the evaluation and execution timeline.](/assets/img/blog/crafting-interpreters-ii-tree-begins-to-run-en/ci-ii-figure-2-core-line-trace.png)

Figure 2. The AST says which expression owns which child. The interpreter decides when those children are evaluated and when side effects happen.

For the rest of the article, we will keep returning to this line. Each section adds one missing piece of its execution.

## 2. Expressions produce runtime values

When a child expression returns, it does not return syntax. It returns a runtime value.

In `jlox`, the first user-visible values are represented with ordinary Java objects:

```text
Lox number  -> Java Double
Lox string  -> Java String
Lox bool    -> Java Boolean
Lox nil     -> Java null
```

The loop creates `amount` with a binary expression:

```text
var amount = day * 10;
```

The parser has already built a `Binary` node. The interpreter now evaluates the left child, evaluates the right child, and applies the operator rule:

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

For `day * 10`, the left side is the current value of `day`, and the right side is the numeric literal `10`. `*` requires two numbers, so the three iterations produce:

```text
day = 1 -> amount = 10
day = 2 -> amount = 20
day = 3 -> amount = 30
```

That is runtime semantics. The AST says, "This is a binary expression with a `STAR` token." The interpreter says, "Evaluate both operands. Check that both values are numbers. Multiply them."

The same pattern handles `+`, but Lox gives `+` two legal meanings:

```text
print 1 + 2;     // 3
print "a" + "b"; // ab
print "1" + 2;   // runtime error
```

The third line matters. Lox does not convert the number into a string. In the book implementation, `+` accepts either two numbers or two strings. Mixed operands are a runtime error, and the error carries the operator token so the interpreter can report the source location of the bad operation.

Comparison operators are stricter. `<`, `<=`, `>`, and `>=` require numbers and produce Booleans:

```text
print 3 < 4;     // true
print "a" < "b"; // runtime error
```

Equality is looser in a different way. Different kinds of values can be compared, but Lox does not implicitly convert between them:

```text
print nil == nil;   // true
print 3 == "3";     // false
print false != nil; // true
```

Truthiness is another runtime law. It appears in `!`, `if`, `while`, `and`, and `or`:

```text
Only false and nil are falsey.
Everything else is truthy.
```

So both `0` and `""` are truthy in Lox.

This directly affects the report status check:

```text
if (total >= 60 and total < 100) {
  print "status";
  print "ok";
} else {
  print "status";
  print "review";
}
```

After the loop, `total >= 60` evaluates to `true`. Because the operator is `and`, the interpreter then evaluates `total < 100`, which also evaluates to `true`. The condition is truthy, so the then branch runs.

A variable expression is syntax. A number, string, Boolean, `nil`, or function object is runtime data. The interpreter's first job is to turn the former into the latter.

## 3. Statements turn values into effects

A report needs more than one value. It has output, and it has state that changes over time.

The first two top-level statements are function declarations:

```text
fun row(day, amount) { ... }
fun makeTotal(start) { ... }
```

Executing a function declaration does not run the function body. It creates a callable runtime object and stores it under the function name:

```text
global
  row       -> <fn row>
  makeTotal -> <fn makeTotal>
```

Then the program declares variables:

```text
var running = makeTotal(0);
var total = 0;
```

A variable declaration evaluates its initializer first, then defines the name in the current environment. `makeTotal(0)` returns the inner `add` function, so the global environment becomes:

```text
global
  row       -> <fn row>
  makeTotal -> <fn makeTotal>
  running  -> <fn add>
  total    -> 0
```

The AST represents source structure, so it should not store the current value of `total`. Runtime state belongs in environments.

Inside the loop, assignment changes that state:

```text
total = running(row(day, amount));
```

Assignment is an expression. It evaluates the right-hand side, then stores the resulting value in an existing variable.

Across the three iterations, the effect is:

```text
day 1: row returns 10, running returns 10, total becomes 10
day 2: row returns 20, running returns 30, total becomes 30
day 3: row returns 30, running returns 60, total becomes 60
```

The line does not merely compute `60`. It makes `total` remember `60` so later statements can use it.

A compact summary:

```text
expression statement: evaluate, then discard the result
print statement:      evaluate, then expose the result
var declaration:      evaluate initializer, then define a name
assignment:           evaluate new value, then mutate an existing name
```

The core idea is:

> Expressions produce values. Statements turn values into effects. Environments let those effects persist across statements.

That is the beginning of the runtime model. Names and values do not live inside the syntax tree. They live in a changing store that the interpreter carries while it walks the tree.

## 4. Environments give state a boundary

One global environment fails as soon as local variables appear. The report loop has one:

```text
for (var day = 1; day <= 3; day = day + 1) {
  var amount = day * 10;
  total = running(row(day, amount));
}
```

`amount` should exist only inside the loop body. It should not become global or survive after that body finishes. Blocks create those temporary worlds.

A block environment points to the environment that was current before the block began:

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

Lookup starts in the current environment and walks outward. Assignment walks the same chain, but mutates the environment where the name was found:

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

That rule explains the loop body. `amount` is defined in the body block. `day` is found one environment outward. `total` is found in global and mutated there.

The interpreter enters a block by temporarily swapping the current environment:

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

The `finally` is essential. A block may finish normally, or a runtime error may escape it, or a `return` signal may pass through it. In every case, the interpreter must restore the previous environment. Otherwise, a local scope would leak into the rest of the program.

This is the runtime counterpart of block scope in languages with `{ ... }`. A local world can see outward, but when control leaves that world, its local names stop being current.

The report now has layered state:

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

State is no longer one flat map. It has boundaries, and those boundaries are part of execution.

![Environment chain: global state, for-block state, loop-body state, call environments, and a captured closure environment.](/assets/img/blog/crafting-interpreters-ii-tree-begins-to-run-en/ci-ii-figure-3-environments-lifetime.png)

Figure 3. Declarations write into the current environment. Lookup walks outward. Closures can keep an older environment reachable.

## 5. Control flow changes which subtree runs next

If the interpreter visited every child node exactly once, it could evaluate arithmetic and execute straight-line statements. It could not run a report that loops and branches.

Control flow changes the traversal path.

An `if` statement evaluates its condition first. If the condition is truthy, the then branch runs. Otherwise, the else branch runs, if present.

Logical operators do the same kind of selection inside expressions. For `and`, the interpreter evaluates the left operand first. If that value is falsey, the right operand is skipped. For `or`, if the left operand is truthy, the right operand is skipped.

So the AST may contain a child that does not run.

A `while` loop repeats a child subtree:

```text
while condition is truthy:
  execute body
```

The condition is evaluated before every iteration, including the first. The body may run zero times, one time, or many times.

The most revealing control-flow feature here is `for`, because `jlox` does not add a new runtime visitor for it. The parser lowers `for` into older nodes.

Our source loop is:

```text
for (var day = 1; day <= 3; day = day + 1) {
  var amount = day * 10;
  total = running(row(day, amount));
}
```

The parser separates four pieces:

```text
initializer: var day = 1
condition:   day <= 3
increment:   day = day + 1
body:        the block that computes amount and updates total
```

Then it constructs an equivalent tree:

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

The order matters:

```text
1. Append the increment after the original body.
2. Use the condition as the while condition.
3. Put the initializer before the while.
4. Wrap initializer and while in an outer block.
```

That outer block gives `day` the right lifetime. It is visible to the condition, the body, and the increment, but it does not leak outside the loop.

The execution becomes:

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

The parser does more than recognize a `for` loop. It chooses a smaller runtime vocabulary for the interpreter. This is desugaring: a surface feature borrows existing runtime semantics.

![For desugaring: initializer becomes the first statement in an outer block; condition becomes while condition; increment is appended after the body.](/assets/img/blog/crafting-interpreters-ii-tree-begins-to-run-en/ci-ii-figure-4-for-desugaring.png)

Figure 4. `for` reuses block, while, and expression-statement execution instead of adding a separate runtime mechanism.

## 6. Function calls create new execution boundaries

A function declaration stores code for later. A function call creates a new runtime world now.

Both `row` and `makeTotal` are declared at top level, so each function object is stored in global. But their bodies do not run at declaration time.

A callable answers two runtime questions:

```text
arity(): how many arguments do you expect?
call():  what happens when those arguments arrive?
```

For a user-defined function, `call()` creates an environment, binds parameters, executes the body, and returns a value:

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

When the loop evaluates:

```text
row(day, amount)
```

it first evaluates the callee, then evaluates the arguments left to right, then calls the function. The call environment looks like:

```text
row call
  day    -> 1
  amount -> 10
  ↓ enclosing
global
  row -> <fn row>
```

Then the body runs:

```text
print "day";
print day;
print "amount";
print amount;
return amount;
```

The first four statements produce output. The final statement returns the number that will become the argument to `running(...)`.

Each call gets a fresh environment:

```text
row call #1: day -> 1, amount -> 10
row call #2: day -> 2, amount -> 20
row call #3: day -> 3, amount -> 30
```

That is why parameters are local to one call. The declaration is shared, but the parameter environment is not.

`return` is the first construct in this episode that deliberately crosses several visitor calls. A return may appear inside blocks, branches, or loops. When it runs, the interpreter must jump back to the function-call boundary, skipping whatever nested execution is still active.

`jlox` implements that jump with a small internal exception:

```java
class Return extends RuntimeException {
  final Object value;

  Return(Object value) {
    super(null, null, false, false);
    this.value = value;
  }
}
```

Users never see this as a runtime error. Inside the interpreter, it is a control signal. Executing `return amount;` evaluates `amount`, wraps the value in `Return`, and throws it. `LoxFunction.call()` catches the signal and turns the stored value into the value of the call expression.

In the report line, this lets `row(day, amount)` behave as both an effect and a value: it prints the row, then returns the numeric amount to the surrounding call.

## 7. Closures let an environment outlive its call

Now focus on the accumulator:

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

At top level, `makeTotal` is stored as a function whose closure is global:

```text
global
  makeTotal -> <fn makeTotal, closure = global>
```

Calling `makeTotal(0)` creates a fresh call environment:

```text
makeTotal call
  start -> 0
  ↓ enclosing
global
```

Then `var sum = start;` defines `sum` in that call environment:

```text
makeTotal call
  start -> 0
  sum   -> 0
  ↓ enclosing
global
```

Now the nested declaration runs:

```text
fun add(amount) {
  sum = sum + amount;
  return sum;
}
```

A function object stores more than code. It stores the environment that was current when the function was declared.

So `add` stores:

```text
declaration: the add function body
closure:     the makeTotal call environment
```

The call environment now contains:

```text
makeTotal call
  start -> 0
  sum   -> 0
  add   -> <fn add, closure = this environment>
  ↓ enclosing
global
```

Finally, `return add;` sends that function object back to the top level, and `running` stores it:

```text
global
  running -> <fn add>
```

The Java call stack no longer contains `makeTotal(0)`. The function body has finished. The interpreter's current environment is global again.

But the `makeTotal` call environment is not gone:

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

This is the first time a runtime environment outlives the call that created it.

A block environment usually stops being current when the block finishes. A function call environment usually stops being current when the call returns. But a closure can keep a function call environment reachable.

That is the lifetime twist of Chapter 10.

Now compare the two functions in the report:

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

Both are `LoxFunction` objects. The difference is the closure stored in the function object. A function call environment's enclosing pointer is initialized from the function object's closure.

That one detail explains the running total:

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

The global variable `total` stores the latest returned value. The closure stored in `running` keeps the hidden `sum` alive between calls.

## 8. The line has become a run

Return to the concrete question:

```text
total = running(row(day, amount));
```

We can now answer it precisely.

The AST says `row(day, amount)` is an argument to `running(...)`. The interpreter evaluates that argument before calling `running`.

Calling `row` creates a fresh call environment. Its parameters receive the current `day` and `amount`. Its body prints the row and returns `amount`.

Calling `running` creates another fresh call environment. But `running` is the returned `add` function, so this call environment encloses the captured `makeTotal` environment, not the loop body. Inside that captured environment, `sum` is found and updated.

The return value from `running` becomes the right-hand-side value of the assignment. Assignment then walks outward from the current environment until it finds `total` in global, and mutates that entry.

The same line runs three times because the parser lowered the `for` loop into a block plus a `while`, and the while condition remains truthy for `day = 1`, `2`, and `3`.

After the loop, the branch condition runs:

```text
total >= 60 and total < 100
```

The left comparison is true. `and` therefore evaluates the right comparison. That is true too, so the then branch prints:

```text
status
ok
```

Finally, the last two print statements expose the stored result:

```text
total
60
```

The whole program output is therefore:

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

What began as a tree has become a report.

The interpreter did not do this in one leap. It added runtime meaning layer by layer:

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

That is the spine of Chapters 7-10.

## Runtime model checkpoint

By this point, the reader should be able to explain the runtime model in five groups.

Values:

```text
1. Expression nodes produce runtime values.
2. Binary expressions evaluate children before applying an operator.
3. Lox's + accepts two numbers or two strings, but not a mixed pair.
4. Only false and nil are falsey.
```

Effects and state:

```text
5. Statements create visible or persistent effects.
6. Environments store names and values outside the AST.
7. Assignment mutates the environment where a name is found.
```

Boundaries:

```text
8. Blocks create temporary environments.
9. Function calls create fresh parameter environments.
10. executeBlock() restores the previous environment even when control exits early.
```

Control:

```text
11. if, while, and short-circuit logic change which subtrees run.
12. for reuses block and while through parser-side desugaring.
13. return is an internal non-local control signal.
```

Lifetime:

```text
14. A function object stores a declaration plus a closure environment.
15. A returned function can keep a local environment alive.
16. Captured state can be updated across later calls.
```

These small pieces are the moving parts behind familiar language features: expressions, variables, scopes, loops, calls, returns, and closures.

Lox keeps the machinery small enough that we can watch every moving part.

### Source map

The book remains the primary source for this episode:

- Chapter 7, "Evaluating Expressions": runtime values, expression visitors, arithmetic, comparison, equality, truthiness, and runtime errors.
- Chapter 8, "Statements and State": statements, `print`, variable declarations, assignment, environments, and blocks.
- Chapter 9, "Control Flow": `if`, logical operators, `while`, and `for` desugaring.
- Chapter 10, "Functions": callable objects, arity, function declarations, call environments, `return`, and closures.

Useful implementation entry points:

- `Interpreter.java`: `evaluate()`, `execute()`, expression visitors, statement visitors, `executeBlock()`, `visitCallExpr()`, `visitLogicalExpr()`, and `visitReturnStmt()`.
- `Environment.java`: `define()`, `get()`, `assign()`, and the `enclosing` link.
- `Parser.java`: the `forStatement()` desugaring into block and `while` nodes.
- `LoxCallable.java`: the `arity()` and `call()` protocol.
- `LoxFunction.java`: function objects, parameter binding, call environments, closure capture, and return handling.
- `Return.java`: the internal control signal used to leave a function body.

### Bridge to Episode III

At the end of this episode, `running` keeps a `sum` alive:

```text
global
  running -> <fn add>
               closure
                 ↓
              makeTotal call
                sum -> 60
```

That solves the lifetime mystery:

> How can a local variable survive after its function returns?

It survives because the returned function still points to the environment where the variable was declared.

But it opens a binding mystery:

> When the interpreter later sees the name `sum`, how does it know which declaration that name is supposed to mean?

So far, lookup walks environment chains at runtime. That works for the report program. But closures make one uncomfortable fact visible: environments are mutable objects, and the program can keep references to them.

Episode III begins there. The tree now runs. Next, each variable expression needs a stable binding.
