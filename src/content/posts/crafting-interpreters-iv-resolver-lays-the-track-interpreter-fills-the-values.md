---
title: "Crafting Interpreters (IV): Resolver Lays the Track, Interpreter Fills the Values"
subtitle: "How jlox runs class, this, inheritance, and super without inventing a second runtime"
series: "Crafting Interpreters: Following Lox from Source to Heap"
episode: 4
lang: en
translationKey: crafting-interpreters-iv-resolver-lays-the-track-interpreter-fills-the-values
canonicalSlug: crafting-interpreters-iv-resolver-lays-the-track-interpreter-fills-the-values
book_scope: "Chapters 12-13"
figures: 5
date: 2026-07-01
overview: >-
  jlox's object system stays inside the same runtime model: classes, instances, methods, this,
  inheritance, and super are built from LoxClass, LoxInstance, LoxFunction, environments, closures,
  and resolver distances.
description: "How jlox runs class, this, inheritance, and super without inventing a second runtime."
image: /assets/img/blog/crafting-interpreters-iv-resolver-lays-the-track-interpreter-fills-the-values/01-cover-track-values.png
tags: [crafting-interpreters, interpreters, lox, classes, inheritance, resolver]
categories: [learning, systems]
toc: true
relatedPosts: true
---

# Crafting Interpreters (IV): Resolver Lays the Track, Interpreter Fills the Values

## How jlox runs `class`, `this`, inheritance, and `super` without inventing a second runtime

TL;DR: jlox's object system is not a separate OOP universe. A class becomes a `LoxClass`. An instance becomes a `LoxInstance`. A method is still a `LoxFunction`. `this` and `super` are still names in environments. The resolver records where those names will be; the interpreter later puts the real values there.

The previous post stopped at the moment when a tree could run: expressions became values, statements became effects, environments held names, calls created local worlds, and closures let those worlds survive.

At first, classes look like a new continent. Objects, fields, methods, constructors, inheritance, `this`, `super`—surely this needs a whole new machine?

The surprise in jlox is that it mostly does not.

The object system is built out of the old pieces:

```text
source syntax
  → parser shape
  → resolver distances
  → interpreter values
  → environment lookup
  → closure capture
```

That is the main thread for this article:

> Start from Lox class syntax, then watch resolver and interpreter cooperate to make class / instance / this / inheritance / super actually run.

![jlox object system overview](/assets/img/blog/crafting-interpreters-iv-resolver-lays-the-track-interpreter-fills-the-values/01-cover-track-values.png)

Figure 1. The class feature looks large, but the implementation keeps returning to the same two verbs: resolver records where names live; interpreter creates the real runtime values.

## 1. What a Lox class looks like from the outside

Before implementation, look at the surface language:

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

This looks familiar if you have used JavaScript, Python, Java, or Ruby, but Lox makes a few deliberately small choices.

First, there is no `new` keyword. A class is called directly:

```lox
Person("Luna")
```

At runtime, the class object behaves like a callable. Calling it creates an instance.

Second, fields are not declared in the class body. The field appears when code writes it:

```lox
this.name = name;
```

That line puts a `name` field on the current instance. The class declaration does not contain a field list.

Third, methods do not use `fun` inside the class body:

```lox
sayHi() {
  print this.name;
}
```

The parser already has a function-declaration structure, so methods reuse that structure, but the syntax is lighter.

Fourth, the initializer is called `init`, not `Person`:

```lox
init(name) {
  this.name = name;
}
```

That means every class uses the same initializer name, and the class name remains just the class name.

Fifth, inheritance uses `<`:

```lox
class B < A {
  test() {
    super.method();
  }
}
```

The `<` reads as “B is below A” or “B derives from A”. When `B` cannot find a method, lookup continues in `A`. When `B` wants to intentionally start lookup in `A`, it uses `super.method()`.

That is the full story from the user's side. The interesting part is that each surface feature maps cleanly onto the runtime model we already have.

## 2. Parser: make the shape, but do not run it

The parser's job is not to know who `this` is. It is not to know what class `super` points to. It only has to recognize the structure.

This source:

```lox
class B < A {
  test() {
    super.method();
  }
}
```

becomes a statement-shaped AST node:

```text
ClassStmt
  name: B
  superclass: Variable(A)
  methods:
    FunctionStmt test(...)
      body:
        Super(method)
```

A class declaration is a statement because it introduces a name into the current environment. The methods inside the class reuse the existing function statement node, because a method has the same basic pieces as a function: a name, parameters, and a body.

The parser also adds expression nodes for the object syntax:

```text
this                 → This expression
super.method          → Super expression
object.field          → Get expression
object.field = value  → Set expression
```

The important boundary is this:

> Parser recognizes shape. It does not attach runtime meaning.

When the parser sees `this.name`, it can produce a `Get(This, name)` shape. But it does not know which object `this` will be. When it sees `super.method`, it can produce a `Super(method)` shape. But it does not know the actual superclass object yet.

That missing information is split between the next two phases.

The resolver will decide where the names should be looked up. The interpreter will later create the objects stored at those locations.

![Class syntax to runtime objects](/assets/img/blog/crafting-interpreters-iv-resolver-lays-the-track-interpreter-fills-the-values/02-class-to-runtime.png)

Figure 2. The parser and resolver prepare the map. The interpreter fills the map with `LoxClass`, `LoxInstance`, fields, methods, and environments.

## 3. Resolver: lay the track, but do not put trains on it

The resolver does not execute code. It does not create an instance. It does not assign `this` to `p`. It performs static analysis before interpretation.

For classes, the resolver's work is mostly about legality and position:

```text
1. Are we inside a class?
2. Is this allowed here?
3. Is super allowed here?
4. How many environment hops will this need?
5. How many environment hops will super need?
6. Are method bodies' variable references resolved?
```

A useful metaphor is that the resolver lays railroad tracks. It decides which direction lookup should travel later. But no train is on the track yet.

Take a simple method:

```lox
class Person {
  sayHi() {
    print this.name;
  }
}
```

When the resolver enters `sayHi`, it creates a temporary scope containing a name:

```text
scope:
  this
```

This is not a real runtime environment. It does not contain a real object. It is only a scope used by static analysis.

Then, when the resolver sees `this`, it can record:

```text
this is N environments away from the future call environment
```

The interpreter stores that number in its `locals` map, keyed by the expression node. Later, when that exact `this` expression is evaluated, the interpreter does not need to search dynamically. It can jump directly to the right environment distance.

The key sentence is:

> Resolver records positions, not values.

That sentence also explains several class-related errors. `this` outside a class is illegal because the resolver would have no class scope to attach it to. `super` inside a class with no superclass is illegal because there will be no `super` environment to look up at runtime. A class inheriting from itself is rejected because the superclass reference would point back to the same class name.

The resolver is not being clever about objects. It is being disciplined about names.

## 4. Interpreter: turn class syntax into runtime objects

Now execution begins.

When jlox executes a class declaration like this:

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

it creates a `LoxClass` object and stores it in the current environment:

```text
global environment
  Person → LoxClass("Person")
```

Inside that `LoxClass`, methods are stored by name:

```text
LoxClass("Person")
  methods:
    init  → LoxFunction
    sayHi → LoxFunction
```

Then this line runs:

```lox
var p = Person("Luna");
```

Because a class implements the callable interface, calling `Person` creates a `LoxInstance`:

```text
global environment
  Person → LoxClass("Person")
  p      → Person instance
```

The instance has its own field map:

```text
Person instance
  fields:
    name → "Luna"
```

This gives us the most important object-system split:

```text
class    stores methods
instance stores fields
```

That split is why methods can be shared across all instances, while each instance can still have its own state.

It also explains property access. When jlox evaluates:

```lox
p.name
```

it looks in the instance's field map. But when it evaluates:

```lox
p.sayHi
```

there probably is no field named `sayHi`, so it asks the instance's class to find a method with that name. If the method exists, the interpreter does not return the raw function unchanged. It binds the method to the instance first.

That is where `this` becomes real.

## 5. `this`: resolver wrote the address; interpreter puts the object there

Look again at the call:

```lox
var p = Person("Luna");
p.sayHi();
```

The interesting operation is not the final pair of parentheses. It is the property access before the call:

```lox
p.sayHi
```

When the interpreter gets that method from the class, it performs:

```text
sayHi.bind(p)
```

Binding creates a new environment whose parent is the method's original closure:

```text
this environment
  this → p
```

Then the bound function is called. The call creates the usual call environment for parameters and locals, and that call environment points back to the `this` environment.

In shape, the chain looks like this:

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

That means `this` is not magic in the interpreter. It is a name in an environment.

Here is the essence of method binding:

```java
LoxFunction bind(LoxInstance instance) {
  Environment environment = new Environment(closure);
  environment.define("this", instance);
  return new LoxFunction(declaration, environment, isInitializer);
}
```

The resolver already recorded how far the `this` expression should look. The interpreter now ensures the expected environment exists and contains the current instance.

So this expression:

```lox
this.name
```

means:

```text
1. Use the resolver distance to get the value of this.
2. That value is p.
3. Read the name field from p's field map.
```

![this binding in jlox](/assets/img/blog/crafting-interpreters-iv-resolver-lays-the-track-interpreter-fills-the-values/03-this-binding.png)

Figure 3. `this` becomes a normal environment binding created by `bind(instance)`. The resolver records where to look; the interpreter creates the environment that makes the lookup succeed.

This is the heart of Chapter 12. jlox does not implement `this` as a hidden global variable or a special slot on the interpreter. It implements it as a captured environment binding.

The method is still a function. The object is supplied by binding that function to an instance.

## 6. `init`: a constructor is a special method call made by the class

Now the initializer is easy to understand.

When this runs:

```lox
var p = Person("Luna");
```

jlox does roughly this:

```text
1. Create a new Person instance.
2. Look for a method named init.
3. Bind init to the new instance.
4. Call init("Luna").
5. Return the new instance.
```

The initializer body:

```lox
init(name) {
  this.name = name;
}
```

uses the same `this` mechanism as every other method. There is no separate constructor binding rule.

`init` is special in two places:

```text
class call automatically looks for init
initializer returns the new instance
```

The second point matters. Even if an initializer body falls off the end, the class call returns the instance. Even if `init` is called directly later, jlox treats initializer methods as returning `this`. And to avoid confusing programs, the resolver rejects returning a value from an initializer.

But the main model stays the same:

```text
init is a method
method binding creates this
class call chooses to invoke init automatically
```

## 7. Inheritance begins as method lookup

Now move from Chapter 12 into Chapter 13.

Do not start with `super`. Start with the simplest inherited method:

```lox
class A {
  method() {
    print "A method";
  }
}

class B < A {}

B().method();
```

The runtime rule is small:

```text
B.findMethod("method")
  if B has method: return it
  otherwise ask A.findMethod("method")
```

Inheritance first changes method lookup. A subclass keeps a reference to its superclass, and `findMethod()` walks that chain when the method is missing on the subclass.

The instance is still a `B` instance:

```text
B() → B instance
```

If `method` is found in `A`, that does not turn the object into an `A` instance. The method is merely found in `A`. When called, it still binds to the original `B` instance.

That detail becomes crucial for `super`.

## 8. `super`: change where lookup starts, not what `this` means

Here is the example that reveals the whole trick:

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

It prints:

```text
B instance
```

Why?

A tempting but wrong explanation is: “`super` is the parent object.”

Lox does not have a parent object here. There is no separate `A` instance hiding inside the `B` instance. There is only one receiver:

```text
b → B instance
```

The correct explanation is:

```text
super decides where method lookup starts.
this decides which object the method runs on.
```

In the example:

```text
super → A class
this  → b
```

So:

```lox
super.method();
```

is approximately:

```text
superclass.findMethod("method").bind(this)()
```

That means:

```text
1. Start lookup in A, not B.
2. Find A.method.
3. Bind A.method to b.
4. Run A.method with this → b.
5. Inside A.method, this.name reads b.name.
```

The lookup starts in the superclass, but the receiver remains the current instance.

![super method lookup and this binding](/assets/img/blog/crafting-interpreters-iv-resolver-lays-the-track-interpreter-fills-the-values/04-super-method.png)

Figure 4. `super` and `this` cooperate. `super` points to the class where method search begins. `this` points to the instance that receives the method.

This is the most important sentence in Chapter 13:

> `super` is not a different object. It is a different lookup starting point.

Once that clicks, the rest of the implementation becomes a problem of environment layout.

## 9. How resolver and interpreter make `super` work together

`super` is more subtle than `this` because it needs two values at once:

```text
superclass: where should lookup start?
object:     what should this be bound to?
```

The resolver cannot store either actual value. It still only records positions.

When resolving a subclass:

```lox
class B < A {
  test() {
    super.method();
  }
}
```

it creates two temporary scopes around the methods:

```text
super scope
  super

this scope
  this

method local scope
  ...
```

From inside `test`, the distances look like this:

```text
method local scope  distance 0
this scope          distance 1
super scope         distance 2
```

So the resolver records the distance for the `super` expression. It also relies on a layout rule: the `this` environment is always one hop inside the `super` environment.

At runtime, the interpreter mirrors that fake scope layout with real environments.

When executing the class declaration `class B < A`, it evaluates `A` and creates a superclass environment:

```text
super environment
  super → A class
```

Then it creates the methods of `B`. Those `LoxFunction` objects capture the environment where `super` is stored.

Later, when `b.test` is accessed, method binding creates the `this` environment:

```text
this environment
  this → b
  ↓ enclosing
super environment
  super → A class
```

Finally, when `super.method()` is evaluated, the interpreter uses the resolver's distance:

```java
int distance = locals.get(expr);
LoxClass superclass = (LoxClass) environment.getAt(distance, "super");
LoxInstance object = (LoxInstance) environment.getAt(distance - 1, "this");
LoxFunction method = superclass.findMethod(expr.method.lexeme);
return method.bind(object);
```

That little `distance - 1` is the whole trick. The resolver recorded where `super` lives. Because jlox controls the environment layout, the current `this` is one environment closer.

So the full `super.method()` story is:

```text
Resolver:
  record where super will be
  arrange this one hop inside super

Interpreter at class declaration:
  create super → A class
  let B's methods capture it

Interpreter at method access:
  bind this → b

Interpreter at super expression:
  get superclass using distance
  get this using distance - 1
  find method starting at superclass
  bind found method to current this
```

No separate OOP runtime is needed.

## 10. The compact mental model

By the end, the class system can be summarized as a table.

![jlox object system mental model table](/assets/img/blog/crafting-interpreters-iv-resolver-lays-the-track-interpreter-fills-the-values/05-mental-model-table.png)

Figure 5. Every object-oriented feature maps back to the same implementation vocabulary: environments, closures, and resolver distances.

The whole story fits into two lines:

```text
Resolver:   precompute where names will be found.
Interpreter: put the real values in those places at runtime.
```

For `this`, the resolver says where `this` will be. The interpreter later binds `this` to the current instance.

For `super`, the resolver says where `super` will be. The interpreter later stores the superclass there, then binds the found method to the current instance.

For methods, the class stores the reusable function. The instance supplies the receiver.

For fields, the instance stores the data. The class does not declare it in advance.

That is why the object system feels surprisingly small once the pieces are connected.

jlox did not stop using the environment model when classes arrived. It leaned harder on that model.

## Closing thought

Classes often feel like a language feature with their own private rules. In jlox, they become less mysterious when viewed as a continuation of functions and closures.

A method is a function with a receiver-shaped environment.

An initializer is a method the class calls automatically.

Inheritance is recursive method lookup.

`super` is a captured superclass plus the current `this`.

The resolver lays the track. The interpreter fills the values. And the same small runtime machine carries the language from functions to objects.

## References

- [Crafting Interpreters, Chapter 12: Classes](https://craftinginterpreters.com/classes.html)
- [Crafting Interpreters, Chapter 13: Inheritance](https://craftinginterpreters.com/inheritance.html)
- [Previous post: Crafting Interpreters (II): The Tree Begins to Run](https://luna-shi.github.io/blog/crafting-interpreters-ii-tree-begins-to-run/)
