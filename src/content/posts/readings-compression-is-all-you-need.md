---
title: 'Compression Is All You Need: measuring mathematical progress'
date: '2026-05-21'
overview: >-
  TLDR: A mathematical abstraction is valuable when it compresses downstream work: proofs become shorter, repeated
  patterns disappear, and the library becomes easier to extend.
description: >-
  TLDR: A mathematical abstraction is valuable when it compresses downstream work: proofs become shorter, repeated
  patterns disappear, and the library becomes easier to extend.
tags:
  - readings
categories:
  - reading
  - systems
math: true
toc: true
relatedPosts: false
---

<!-- notion-sync: 3674e07a-a023-80e7-bb86-f340766fef05 parent=Readings url=https://app.notion.com/p/3674e07aa02380e7bb86f340766fef05 -->

The phrase "good abstraction" is usually treated as taste. Mathematicians can often feel when a definition is right, but that feeling is hard to operationalize.

The useful move in this paper is to treat mathematical progress as compression. A new abstraction is not just elegant. It should make a region of proof work shorter, more reusable, or easier to maintain.

That turns taste into a measurable engineering signal.

## The compression test

For a candidate abstraction, ask:

```text
After adding it, how many proofs get shorter?
How many repeated proof patterns disappear?
How many downstream theorems become easier to prove?
Does it become a high-reuse dependency node?
Does it reduce proof depth or wrapped proof length?
Does it make future maintenance simpler?
```

The key is not any single metric. The key is that a valuable abstraction should leave a trace in the proof library. It should compress work beyond the theorem that introduced it.

## Why this is a good AI problem

This is a surprisingly natural task for AI systems around Lean or similar formal libraries.

A team does not need the model to become a fully autonomous mathematician on day one. The first useful system can be an abstraction recommender:

1. Search the library for repeated proof terms, tactic patterns, and local lemmas.
2. Propose candidate definitions or lemmas that factor out the repetition.
3. Rewrite a batch of existing proofs using the candidate abstraction.
4. Verify all rewritten proofs with Lean.
5. Rank candidates by compression, reuse, breakage, and naming cost.
6. Send only the best candidates to human maintainers.

That changes the maintainer's job from "manually discover every abstraction" to "review high-evidence candidates."

## Three levels of contribution

I would split AI-for-formal-math work into three layers.

| Layer | What the system does | Why it matters |
| --- | --- | --- |
| Proof generation | Prove one theorem in a fixed library | Important, but easy to turn into benchmark chasing |
| Library-aware engineering | Suggest lemmas that shorten many proofs | Starts shaping the mathematical codebase |
| Abstraction discovery | Find a shared structure and propose a new concept | Closest to the work of mathematical taste |

The second and third layers are the interesting ones for long-term leverage. They are not only about solving today's theorem. They are about making tomorrow's theorems easier.

## The maintenance angle

Compression can also fail. A new abstraction might shorten proofs but make names confusing. It might become a brittle dependency. It might hide structure that should remain explicit. It might help one area while making another harder to understand.

So I would not rank candidates by length reduction alone. A useful score should include:

```text
compression
reuse
proof stability
dependency centrality
name clarity
review cost
future extensibility
```

The system should look less like a theorem prover and more like a library engineer.

## My takeaway

The deepest idea here is that abstraction has evidence.

If a definition is genuinely good, it should compress a neighborhood of mathematical work. That gives AI systems a foothold: propose, rewrite, verify, measure, and then ask humans to judge the candidates with the strongest evidence.

For me, the most promising research direction is not only "generate more Lean proofs." It is "maintain a proof library so that the next hundred proofs become simpler."
