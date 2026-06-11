---
title: 'Talk with Shunyu Yao: feedback is the center of AI research'
date: '2026-05-14'
overview: >-
  TLDR: The conversation is useful because it frames AI research as system-driven experimental work: define verifiable
  problems, build feedback loops, debug carefully, and choose directions where scaling paths are still being shaped.
description: >-
  TLDR: The conversation is useful because it frames AI research as system-driven experimental work: define verifiable
  problems, build feedback loops, debug carefully, and choose directions where scaling paths are still being shaped.
tags:
  - readings
categories:
  - reading
  - research
math: true
toc: true
relatedPosts: false
---

<!-- notion-sync: 3604e07a-a023-80f2-b561-c32ec5d703d7 parent=Readings url=https://app.notion.com/p/3604e07aa02380f2b561c32ec5d703d7 -->

The conversation is long, but the main line is simple:

```text
AI research is becoming system-driven experimental science.
```

That does not mean ideas stop mattering. It means ideas increasingly need to survive data, infrastructure, evaluation, debugging, and long feedback loops. A beautiful story is not enough if the system cannot tell whether it is working.

## From theory to feedback

One useful thread is the contrast between fields with weak feedback and fields with strong feedback.

In areas where experiments are slow, scarce, or socially mediated, taste and internal consensus can dominate for a long time. In AI, the feedback is not perfect, but it is often much faster. You can run experiments, inspect failures, change data, adjust evaluation, and learn from the result.

That speed is part of the attraction. It also changes the researcher profile. The valuable researcher is not only the person with a clever idea. It is the person who can make the idea testable.

## Why coding moved early

Coding is one of the first AI-native applications to become broadly useful because it has unusually good feedback:

- code can be executed;
- tests can be run;
- diffs can be reviewed;
- failures can be reproduced;
- tasks can be decomposed into concrete artifacts.

That does not make coding easy. It makes the feedback loop legible.

Many harder domains, such as robotics, product taste, personalization, or long-horizon agents, have weaker feedback. The reward is delayed, ambiguous, or entangled with the environment. Progress there depends on building better evaluation loops, not only larger models.

## The end of solo heroics

Another strong thread is that frontier AI research has become more organizational.

Transformer-era breakthroughs still leave room for individual taste and judgment, but modern frontier systems depend on:

- data pipelines;
- training infrastructure;
- evaluation suites;
- debugging culture;
- product feedback;
- safety and reliability processes;
- clear division of labor.

The individual researcher still matters, but more like someone surfing a large system than someone creating the whole wave alone.

This is not a romantic view, but it is useful. If the field is system-driven, then being reliable, careful, and able to close loops becomes a research advantage.

## What young researchers should train

The practical advice I take from the conversation is not "chase the hottest model direction." It is to build the ability to turn vague questions into experimental systems.

Useful questions include:

```text
What exactly is the task?
Where does the data come from?
What feedback signal is trustworthy?
What would count as failure?
Can the first experiment run this week?
How will I know whether a result is real or a bug?
What should be automated, and what still needs judgment?
```

This is less glamorous than naming a new paradigm, but it is how research compounds.

## Working with AI as part of research

The next shift is that AI will increasingly help with AI research itself: coding, reading, experiment setup, debugging, result analysis, hypothesis generation, and literature search.

The important distinction is between using AI and collaborating with AI. Collaboration means the researcher still owns the problem framing, evidence standard, and final judgment. The model can accelerate work, but it should also be used as a critic, assistant, and executor inside a controlled loop.

For long-horizon work, this becomes a systems problem again. The researcher needs tools, memory, evals, and review points so that AI assistance improves the research loop instead of adding untrusted output.

## Where opportunity remains

The conversation also cautions against assuming that the main language-model track is the only place to work.

Some directions are crowded and resource-heavy. Others are under-defined but potentially important:

- long-horizon agents;
- reliable tool use;
- personal memory;
- AI for science;
- robotics and grounded interaction;
- multimodal generation and understanding;
- ML coding and automated experimentation.

The attractive direction is not necessarily the loudest one. It is the one where feedback can be built and scaled.

## My takeaway

The strongest lesson is that modern AI research rewards feedback discipline.

Good researchers will still need taste, courage, and theory. But the daily advantage may come from something less dramatic: making problems measurable, building clean loops, debugging honestly, using AI well, and staying responsible for the result.
