---
title: 'CS336: Lecture 1 - Language Modeling as Engineering'
date: '2026-05-18'
overview: >-
  TLDR: Modern LM work is easiest to understand by building the stack yourself, because tokenization, data, compute, and
  evaluation are all leaky engineering choices.
description: >-
  TLDR: Modern LM work is easiest to understand by building the stack yourself, because tokenization, data, compute, and
  evaluation are all leaky engineering choices.
math: true
toc: true
relatedPosts: true
tags:
  - cs336
  - language-modeling
categories:
  - learning
  - systems
---

<!-- notion-sync: 3644e07a-a023-80eb-8d38-ec6298187d83 parent=CS336 url=https://app.notion.com/p/3644e07aa02380eb8d38ec6298187d83 -->

**Takeaways**

This lecture frames language modeling as an engineering problem under resource constraints. The main message is: to understand modern LMs, you need to build the stack yourself, because high-level APIs hide leaky, still-evolving abstractions.

The big ideas:

- Frontier models are industrial-scale, expensive, and mostly opaque, so small models will not reproduce everything about frontier behavior.

- What transfers from small-scale work is mostly **mechanics** and **mindset**: how Transformers, training, hardware, data, and scaling interact.

- The “bitter lesson” is not “scale is all that matters.” It is: **algorithms that scale matter**. A useful framing is `accuracy = efficiency x resources`.

- Modern LM design is driven by efficiency: avoid wasting compute on bad data, overly long token sequences, inefficient architectures, bad hyperparameters, or poor hardware utilization.

**Tokenization**

The technical center of the lecture is tokenization: converting strings into integer token sequences and back.

Key tradeoff: tokenizers balance **vocabulary size** against **sequence length**.

- Character tokenization round-trips cleanly, but Unicode has around 150K characters, many rare.

- Byte tokenization has a tiny fixed vocabulary of 256, but produces long sequences, which is bad for Transformers because attention cost grows roughly quadratically with sequence length.

- Word tokenization is intuitive, but vocabularies become huge and open-ended; unseen words require awkward `UNK` handling.

- BPE is the practical compromise: start from bytes, repeatedly merge the most frequent adjacent token pairs, and learn a vocabulary from corpus statistics.

The lecture’s BPE intuition: common strings should become short token sequences; rare strings can remain decomposed into smaller pieces. Tokenization is described as a “necessary evil”: useful for today’s compute constraints, but maybe eventually replaced by scalable byte-level models.
