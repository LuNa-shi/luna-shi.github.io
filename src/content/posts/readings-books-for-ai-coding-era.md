---
title: 'A reading stack for the AI-coding era'
date: '2026-06-10'
overview: >-
  TLDR: As code generation gets cheaper, the scarce skills move toward judgment: architecture, strategy, systems thinking,
  safety, measurement, customer truth, organization, and cooperation.
description: >-
  A curated reading note that turns several raw recommendation lists into one map of books for the AI-coding era, focused
  on the abilities that become more valuable when implementation cost falls.
tags:
  - readings
categories:
  - reading
math: false
toc: true
relatedPosts: false
---

<!-- notion-sync: 37a4e07a-a023-808e-889b-ca9be817fc40 parent=Readings url=https://app.notion.com/p/37a4e07aa023808e889bca9be817fc40 -->

The raw list had many books, but the through-line is smaller:

> When AI makes implementation cheaper, the scarce skill is no longer typing code. It is deciding what should exist, how it should be constrained, how it should be verified, and whether anyone should adopt it.

That changes what is worth reading.

The goal is not to collect inspirational books. The goal is to build a stack of durable abilities around AI-assisted software work: architecture taste, strategy, systems thinking, security, measurement, market truth, organization, and cooperation.

## 1. Architecture and design judgment

AI can generate implementations faster than it can decide which constraints should become the system's skeleton. That makes design judgment more valuable.

| Book | Why it belongs |
| --- | --- |
| [The Design of Design](https://www.oreilly.com/library/view/the-design-of/9780321702081/) by Frederick P. Brooks Jr. | The best follow-up to *The Mythical Man-Month*: design goals, constraints, conceptual integrity, and collaboration across complex systems. |
| [A Philosophy of Software Design](https://web.stanford.edu/~ouster/cgi-bin/aposd.php) by John Ousterhout | Short, dense, and useful for thinking about complexity, deep modules, and interface boundaries. |
| [The Design of Everyday Things](https://mitpress.mit.edu/9780262525671/the-design-of-everyday-things/) by Don Norman | A concrete way to think about affordances, feedback, constraints, and why good design reduces user mistakes. |
| [How Buildings Learn](https://www.penguinrandomhouse.com/books/320919/how-buildings-learn-by-stewart-brand/) by Stewart Brand | A strong analogy for software: good systems are not finished photographs; they can be repaired, extended, and adapted. |

My reason for starting here: agent-generated code can make bad abstractions arrive faster. Architecture taste is the defense against fast incoherence.

## 2. Strategy and bottlenecks

AI is very good at producing plans. That makes it easier to confuse a list of goals with a strategy.

| Book | Why it belongs |
| --- | --- |
| [Good Strategy / Bad Strategy](https://www.penguinrandomhouse.com/books/208668/good-strategy-bad-strategy-by-richard-rumelt/) by Richard Rumelt | A strategy is diagnosis, guiding policy, and coherent action, not a wishlist. |
| [The Goal](https://northriverpress.com/the-goal-a-process-of-ongoing-improvement/) by Eliyahu M. Goldratt | Local efficiency is not system throughput. Find the constraint before optimizing everything. |
| [High Output Management](https://www.penguinrandomhouse.com/books/116341/high-output-management-by-andrew-s-grove/) by Andrew Grove | Management output is organization output. Useful when AI changes execution leverage but not coordination reality. |
| [The Mom Test](https://www.momtestbook.com/) by Rob Fitzpatrick | When building gets cheaper, the expensive mistake is building what nobody truly wants. |

This lane is about resisting beautiful activity. A team can generate more code, more plans, and more experiments while still avoiding the hard diagnosis.

## 3. Systems thinking and failure

Agent systems are feedback systems. They have delays, hidden couplings, incentives, local optimizations, and drift. Linear thinking breaks quickly.

| Book | Why it belongs |
| --- | --- |
| [Thinking in Systems](https://www.chelseagreen.com/product/thinking-in-systems/) by Donella Meadows | Stocks, flows, feedback loops, delays, and leverage points in a readable form. |
| [Seeing Like a State](https://yalebooks.yale.edu/book/9780300078152/seeing-like-a-state/) by James C. Scott | A warning about making messy reality legible and then mistaking the abstraction for the world. |
| [Drift into Failure](https://www.routledge.com/Drift-into-Failure-From-Hunting-Broken-Components-to-Understanding-Complex-Systems/Dekker/p/book/9781409422218) by Sidney Dekker | Accidents often emerge from normal local decisions under pressure, not one obviously bad actor. |
| [The Checklist Manifesto](https://atulgawande.com/book/the-checklist-manifesto/) by Atul Gawande | The useful reading is not "make checklists"; it is how complex professional systems reduce omission and coordinate responsibility. |

This is the lane I would pair with agent evaluation. If the system keeps failing, do not only blame the model. Look at incentives, feedback, missing observability, and the normal path into bad states.

## 4. Security, measurement, and uncertainty

AI-assisted development expands the surface area of decisions. It also makes plausible explanations cheaper. That raises the value of adversarial thinking and calibrated measurement.

| Book | Why it belongs |
| --- | --- |
| [Threat Modeling](https://shostack.org/books/threat-modeling-book) by Adam Shostack | Security should enter during design: assets, attackers, entry points, mitigations, and worst paths. |
| [How to Measure Anything](https://hubbardresearch.com/shop/measure-anything-3-ed-signed-author/) by Douglas Hubbard | Many "immeasurable" questions can be reframed as uncertainty-reduction problems. |
| [Superforecasting](https://www.penguinrandomhouse.com/books/227815/superforecasting-by-philip-e-tetlock-and-dan-gardner/) by Philip Tetlock and Dan Gardner | AI gives answers; humans still need probability, evidence quality, and update conditions. |
| [The Art of Statistics](https://www.basicbooks.com/titles/david-spiegelhalter/the-art-of-statistics/9781541675704/) by David Spiegelhalter | A good bridge into uncertainty, risk, data, and evidence without drowning the reader in formulas. |

The theme is not pessimism. It is contact with reality. Good agent builders need to ask what would change their mind, what could be attacked, and what evidence actually supports a claim.

## 5. Technical foundations worth keeping

Even with AI, some foundations keep paying rent because they shape your mental model of real systems.

| Book | Why it belongs |
| --- | --- |
| [High Performance Browser Networking](https://hpbn.co/) by Ilya Grigorik | A practical way into latency, TCP, TLS, HTTP, browser APIs, and web-performance intuition. |
| [Database Internals](https://www.oreilly.com/library/view/database-internals/9781492040330/) by Alex Petrov | Storage engines, B-trees, LSM, WAL, transactions, and why databases are built the way they are. |
| [Understanding Distributed Systems](https://understandingdistributed.systems/) by Roberto Vitillo | A map of replication, partitioning, consensus, observability, and reliability. |
| [Understanding Computation](https://computationbook.com/) by Tom Stuart | Automata, semantics, and computability through runnable examples rather than theorem-first presentation. |
| [Street-Fighting Mathematics](https://mitpress.mit.edu/9780262514293/street-fighting-mathematics/) by Sanjoy Mahajan | Estimation, dimensional analysis, easy cases, approximation, and analogy as engineering tools. |

These books are not there to compete with AI-generated explanations. They give you a structure that helps you judge the explanations.

## 6. Markets, organizations, and cooperation

If building gets cheaper, adoption and coordination become larger fractions of the problem.

| Book | Why it belongs |
| --- | --- |
| [Crossing the Chasm](https://www.harperbusiness.com/book/9780062292988/crossing-the-chasm-geoffrey-a-moore/) by Geoffrey A. Moore | High-tech products often break between early adopters and mainstream markets. |
| [Competing Against Luck](https://www.harpercollins.com/products/competing-against-luck-clayton-m-christensentaddy-hallkaren-dillondavid-s-duncan) by Clayton Christensen, Taddy Hall, Karen Dillon, and David Duncan | Jobs-to-be-Done is a useful antidote to shallow user personas. |
| [The Innovator's Dilemma](https://www.harperbusiness.com/book/9780062060242/the-innovators-dilemma-clayton-m-christensen/) by Clayton Christensen | Good organizations can rationally miss new curves. |
| [Peopleware](https://www.oreilly.com/library/view/peopleware-productive-projects/9780133440706/) by Tom DeMarco and Tim Lister | Many software problems are environment, attention, team, and organization problems. |
| [The Evolution of Cooperation](https://www.basicbooks.com/titles/robert-axelrod/the-evolution-of-cooperation/9781541606845/) by Robert Axelrod | A natural extension for anyone reading multi-agent systems, social dilemmas, or repeated-game cooperation. |

This lane matters because AI lowers the cost of the wrong thing too. A technically impressive product can still fail if the market transition, organization, incentives, or cooperation pattern is wrong.

## My shortlist

If I had to cut this down to ten, I would start here:

| Order | Book | Scarce ability |
| --- | --- | --- |
| 1 | *The Design of Design* | Architectural judgment |
| 2 | *Good Strategy / Bad Strategy* | Diagnosis before planning |
| 3 | *The Goal* | Bottleneck and throughput thinking |
| 4 | *Thinking in Systems* | Feedback and leverage points |
| 5 | *Threat Modeling* | Adversarial design |
| 6 | *How to Measure Anything* | Turning uncertainty into measurement |
| 7 | *Superforecasting* | Probability and calibration |
| 8 | *The Mom Test* | Customer truth |
| 9 | *A Philosophy of Software Design* | Complexity and interfaces |
| 10 | *Peopleware* | Organization as part of engineering |

The connecting idea is simple: AI shifts leverage, but it does not remove judgment. The better the tools become, the more valuable it is to know what not to build, what to constrain, what to verify, and where the real bottleneck lives.
