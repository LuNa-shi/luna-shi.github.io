---
title: 'Paper reading skills: read for the argument, not the inventory'
date: '2026-06-08'
overview: >-
  TLDR: A good paper-reading prompt should force the reader to recover the argument: problem, insight, method, evidence,
  and weakness. It should not reward section-by-section summarization.
description: >-
  TLDR: A good paper-reading prompt should force the reader to recover the argument: problem, insight, method, evidence,
  and weakness. It should not reward section-by-section summarization.
math: true
toc: true
relatedPosts: false
tags:
  - paper-reading
  - research-methods
categories:
  - reading
---

<!-- notion-sync: 3794e07a-a023-8028-84b9-e1898636a741 parent=Readings url=https://app.notion.com/p/3794e07aa023802884b9e1898636a741 -->

Bad paper notes often look complete. They mention every module, every dataset, every table, and every limitation. The problem is that they do not tell me what the paper is actually doing.

The reading skill I want is different: recover the argument.

Not the outline. Not the PDF structure. The argument.

## The five questions

When reading a paper deeply, I want the note to answer five questions.

| Question | What I am testing |
| --- | --- |
| Motivation | Is the pain real, or is it mostly packaging? |
| Contribution | If only one idea survives, what is it? |
| Method | What is the key insight that makes the method work? |
| Evidence | Which result actually supports the claim? |
| Limitation | What weakness could change the conclusion? |

These questions keep the note from becoming a polite abstract.

## The prompt

Here is the reusable prompt shape:

```text
Read this paper as a critical research note.

Do not summarize section by section.
Do not list every module, formula, and experiment.

Recover the core argument:

1. Motivation:
   What pain is the paper really trying to solve?
   Is this a real problem or a packaged problem?

2. Contribution:
   What is the core contribution?
   If only one contribution survives, which one is it and why?

3. Method:
   What is the key insight?
   Why might it solve something previous methods could not?

4. Result:
   What evidence best supports the main claim?
   Does the result prove effectiveness, or only look numerically better?

5. Limitation:
   What is the most serious weakness?
   Does it weaken the core conclusion?

End with three sentences:

- The most useful idea to learn from this paper.
- The most important reason to doubt it.
- The research direction it opens.
```

## What this prevents

This prompt is mainly defensive. It prevents three common reading failures.

First, it prevents module worship. A paper may have many components, but the note should identify the component that actually carries the claim.

Second, it prevents benchmark hypnosis. A better number is not automatically a better idea. I want to know which experiment makes the causal story plausible.

Third, it prevents fake balance. A limitation section is only useful if it says whether the weakness threatens the conclusion or merely marks future work.

## What a good answer feels like

A good answer should be sharp enough that I can disagree with it.

It should have this shape:

```text
The paper matters because ...
The central move is ...
The strongest evidence is ...
The weakness is ...
I would reuse ...
I would not yet trust ...
```

That is much more useful than a neutral summary, because it gives the reader a position.

## My takeaway

The goal of paper reading is not to remember every detail. The goal is to extract the argument and decide what to trust.

For agent-assisted reading, this matters even more. Models are good at exhaustive summaries. The skill is to force judgment: what problem is real, what idea is new, what evidence matters, and what weakness could break the claim.
