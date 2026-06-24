---
title: 'LeanMarathon: long-horizon formalization as agent engineering'
date: '2026-06-07'
overview: >-
  LeanMarathon turns paper-level Lean formalization into a recoverable multi-agent engineering system: blueprint,
  proof DAG, scoped workers, reviewer issues, and CI gates keep long tasks from drifting.
description: >-
  A reading note on LeanMarathon as a durable harness for AI-assisted Lean autoformalization, with lessons for
  long-horizon agent systems.
math: true
toc: true
relatedPosts: false
tags:
  - formal-methods
  - agent-systems
categories:
  - reading
  - agents
---

<!-- notion-sync: 3784e07a-a023-807c-a90f-def705e178e6 parent=Readings url=https://app.notion.com/p/3784e07aa023807ca90fdef705e178e6 -->

> Paper: _LeanMarathon: Toward Reliable AI Co-Mathematicians through Long-Horizon Lean Autoformalization_
>
> arXiv: `2606.05400`
>
> Code: `YuanheZ/LeanMarathon`

## The one-line read

LeanMarathon is not mainly a stronger theorem prover. It is a durable harness for turning a whole research paper into Lean.

The system shape is:

```text
research paper
    -> evolving Lean blueprint
    -> proof DAG
    -> contract-scoped agents
    -> local PRs
    -> CI-gated merges
    -> sorry-free formalization
```

The key idea is that long-horizon formalization is an engineering problem, not only a model-capability problem.

## Why paper-level Lean is hard

Formalizing one lemma is not the same as formalizing a paper.

A paper contains definitions, lemmas, theorem statements, proof sketches, omitted steps, implicit dependencies, and sometimes mistakes. If the formal statement drifts away from the source proof, the system may still prove something - just not the intended theorem.

LeanMarathon calls this family of failures **formalization shift** or **goal drift**.

The problem is especially dangerous because local success can hide global failure:

```text
one node compiles
but the proof graph has drifted
so later work builds on the wrong substrate
```

## The blueprint as system of record

LeanMarathon's central abstraction is the blueprint: a Lean file that carries both formal declarations and natural-language proof intent.

A node roughly contains:

```lean
@[blueprint "lem:weighted-tail-bound"
  (statement := /-- LaTeX statement text -/)
  (proof := /-- LaTeX proof prose with dependency references -/)
  (title := /-- one-line title -/)
  (latexEnv := "lemma")]
lemma weighted_tail_bound ... : ... := by
  sorry
```

This makes one file serve three roles:

| Role | What it keeps |
| --- | --- |
| Formal skeleton | Lean declarations, types, proof bodies |
| Human proof graph | LaTeX statements, prose, dependency references |
| Shared state | The artifact every agent edits and CI checks |

The important move is to prevent the natural-language proof graph and the Lean dependency graph from drifting apart silently.

## Four agent roles

LeanMarathon uses role separation to contain failure.

| Agent | Job | Boundary |
| --- | --- | --- |
| Blueprinter | Build the initial proof skeleton | Decomposition, not proof discharge |
| Target-Reviewer | Check whether target statements are faithful | Read-only; files issues |
| Worker | Prove one dynamic leaf node | Edits only its scoped region |
| Refiner | Repair blueprint-level defects | Works on the affected sub-DAG |

This is the most transferable design lesson. The system does not trust a monolithic agent to read, formalize, prove, review, and repair everything.

It gives each agent a contract.

## The worker transaction

A Worker is assigned a dynamic leaf: a node whose dependencies are ready but whose proof is still open.

The workflow is disciplined:

| Phase | Purpose |
| --- | --- |
| Misformalization audit | First ask whether the Lean statement is faithful |
| Cheap falsification | Try boundary cases before proving |
| Statement polish | Align prose and formal statement |
| Formalization | Fill the Lean proof under the frozen statement |

The Worker can add local helper lemmas, but it cannot freely edit the whole file. That keeps parallel work from becoming merge-conflict soup.

## Refiner and illness areas

The Refiner handles issues from reviewers or workers. It identifies the smallest connected sub-DAG affected by the problem, which the paper calls an illness area.

Two cases must be separated:

| Issue | Meaning |
| --- | --- |
| Blueprint drift | The formalization no longer matches the source proof |
| Source gap | The source proof itself is missing steps or has an error |

The discipline I like: if an upstream statement changes and breaks a completed proof, the system does not patch the proof body casually. It downgrades the affected proof back to a placeholder and lets later work re-prove it.

That sacrifices some compute to protect correctness.

## CI as merge authority

LeanMarathon's CI is not just "run Lean." It checks the blueprint contract.

| Check | Why it matters |
| --- | --- |
| Lean compilation | The file must elaborate |
| Node well-formedness | Blueprint metadata must be complete |
| `latexEnv` consistency | Prose environment should match Lean declaration kind |
| Label/name normalization | Labels and Lean names stay aligned |
| Unique labels | The proof graph has stable identities |
| Dependency parity | Prose dependencies and Lean dependencies agree |
| Lemma closeness | Helper lemmas should connect to later goals |

The lemma-closeness check is subtle. A drifting agent often proves irrelevant machinery. Graph checks can catch some of that without understanding all the math.

## Results worth remembering

The paper reports completed formalizations for research-level math targets with no remaining `sorry`.

| Run | Targets | Lean lines | Proof nodes | Remaining `sorry` |
| --- | ---: | ---: | ---: | ---: |
| Erdos-Graham | 4 | 8,513 | 111 | 0 |
| ESS #1196 | 1 | 3,988 | 44 | 0 |
| #164 and #1217 | 2 | 14,592 | 147 | 0 |

The orchestration cost is high:

| Run | Rounds | Workers | Refiners | Merged PRs |
| --- | ---: | ---: | ---: | ---: |
| Erdos-Graham | 19 | 58 | 7 | 53 |
| ESS #1196 | 17 | 33 | 6 | 32 |
| #164 and #1217 | 40 | 111 | 25 | 93 |

This cost is part of the point. The system spends orchestration to buy recoverability and correctness.

## Formalization as debugging

One of the best parts of the paper is that Lean feedback exposes hidden mathematical structure.

The paper reports recurring issues such as:

- false statements under concrete instantiation;
- hidden boundedness or summability assumptions;
- missing library facts;
- compressed proof phrases that expand into many explicit lemmas.

That means the proof assistant is not only a checker. It is a source of ground-truth signal for the agent system.

## Why the baseline comparison matters

The comparison with a commercial single-agent baseline is not interesting because "one model lost." It is interesting because it shows where monolithic agents struggle:

```text
long proof graph
moving dependencies
statement fidelity
repair after drift
merge discipline
global consistency
```

LeanMarathon's answer is not "make the agent smarter." It is "turn work into scoped transactions and let CI decide what enters the shared state."

## Limits

Harness design cannot replace missing mathematics.

The paper reports a failure case where the prerequisite library support was too thin. In that situation, the system can expose the gap, but it cannot magically build a large missing theory for free.

The boundary is useful:

```text
if the proof is near available library support:
    orchestration can help decompose, verify, and repair

if the proof needs a large missing library:
    orchestration reveals the missing substrate
```

## My takeaway

LeanMarathon is a strong example of agent-system engineering:

| MAS problem | LeanMarathon answer |
| --- | --- |
| Shared memory gets polluted | Use the blueprint, issues, PRs, and CI as durable state |
| Agents self-evaluate poorly | Give acceptance authority to CI and reviewers |
| Parallel workers conflict | Freeze substrates and scope editable regions |
| Long tasks drift | Check target fidelity, dependency parity, and graph closeness |
| Repairs widen damage | Restrict edits to illness sub-DAGs |

The reusable lesson:

> Long-horizon agents need a substrate they cannot casually corrupt.

For my own agent work, I would treat LeanMarathon as a template for any task where local progress is easy to fake and global consistency is hard to recover.
