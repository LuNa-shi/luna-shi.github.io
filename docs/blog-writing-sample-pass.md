# Blog Writing Sample Pass

Date: 2026-06-11

This is a first editorial experiment on 10 representative posts. The goal is to test an English-first blog style and a small set of repeatable post templates before turning the approach into a personal Codex writing skill.

## Principles Used

- Start with the reader's question, not with a full source summary.
- Keep the conclusion close to the top.
- Use headings that pass the skim test.
- Use tables for comparisons and dimensions.
- Use code blocks only for algorithms, workflows, commands, or compact mental models.
- For math posts, use proper LaTeX and keep formulas visually separated from prose.
- For agent-system posts, emphasize system shape, failure modes, verification, and reusable patterns.
- For book notes, add more first-person judgment and fewer generic chapter-summary beats.

External references that informed the pass:

- [Nielsen Norman Group: Concise, Scannable, and Objective](https://www.nngroup.com/articles/concise-scannable-and-objective-how-to-write-for-the-web/)
- [Google Developer Documentation Style Guide](https://developers.google.com/style)
- [Google style guide highlights](https://developers.google.com/style/highlights)
- [Diataxis](https://diataxis.fr/)

## Selected Posts

| Post | Why it was selected | Template tested |
| --- | --- | --- |
| `readings-life-framework-multi-agent-systems` | User flagged poor formatting; long survey note with too many headings | Long paper/survey reading note |
| `readings-mythical-man-month-ch1-6` | User flagged AI-like tone | Book reflection with first-person judgment |
| `readings-dynamic-workflows-agent-runtime` | User liked its length, rhythm, and layout | Preferred baseline / agent-runtime note |
| `sutton-rl-day-3-dp` | User flagged formula rendering issues | Math learning note |
| `cs336-lecture-2-resource-accounting` | Code/math/engineering lecture note | Lecture engineering note |
| `crafting-interpreters-chapter-4-scanning` | Code-heavy learning post | Code tutorial note |
| `selfish-gene-chapter-11-meme` | Reading series with reflective content | Science/book reflection |
| `leibo-concordia` | Agent/social-simulation research note | Research lens short note |
| `pi-agent-containerization-compaction` | Personal systems/tooling note | Systems note |
| `readings-leanmarathon` | Agent-harness paper with empirical results | Paper/runtime reading note |

## Quantitative Before/After

Chinese-character counts ignore frontmatter and HTML comments.

| Post | Before words | After words | Chinese chars | Headings | Code blocks | Math blocks |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `readings-life-framework-multi-agent-systems` | 2973 | 1703 | 4293 -> 0 | 68 -> 17 | 10 -> 10 | 0 -> 0 |
| `readings-mythical-man-month-ch1-6` | 280 | 1071 | 1733 -> 0 | 25 -> 8 | 1 -> 7 | 0 -> 0 |
| `readings-dynamic-workflows-agent-runtime` | 863 | 1228 | 3045 -> 0 | 10 -> 14 | 0 -> 4 | 0 -> 0 |
| `sutton-rl-day-3-dp` | 1248 | 1298 | 766 -> 0 | 39 -> 14 | 31 -> 11 | 19 -> 16 |
| `cs336-lecture-2-resource-accounting` | 2851 | 1442 | 2363 -> 0 | 57 -> 16 | 65 -> 22 | 0 -> 5 |
| `crafting-interpreters-chapter-4-scanning` | 670 | 871 | 982 -> 0 | 12 -> 11 | 58 -> 27 | 0 -> 0 |
| `selfish-gene-chapter-11-meme` | 718 | 845 | 4213 -> 0 | 37 -> 10 | 0 -> 4 | 0 -> 0 |
| `leibo-concordia` | 170 | 619 | 1573 -> 0 | 5 -> 7 | 0 -> 5 | 0 -> 0 |
| `pi-agent-containerization-compaction` | 1006 | 758 | 771 -> 0 | 18 -> 9 | 54 -> 10 | 0 -> 0 |
| `readings-leanmarathon` | 1711 | 1296 | 2615 -> 0 | 28 -> 12 | 17 -> 5 | 0 -> 0 |

## QA Results

- Built the site successfully with Astro and Pagefind.
- Desktop browser QA passed for all 10 sample pages: no visible Chinese text in the article, no page-level horizontal overflow, and all referenced images loaded.
- Mobile QA at a 390px-wide viewport passed for all 10 sample pages after adding responsive prose rules for tables and KaTeX display math.
- `sutton-rl-day-3-dp` renders 36 KaTeX nodes after the formula cleanup.
- Related-post sections are temporarily disabled on the 10 samples so pages do not surface untranslated older post titles during this experiment.

## Template Candidates

### Paper / Runtime Reading

Use for `readings`, agent papers, system papers, and runtime design posts.

```text
Source block
Why this matters
Core frame
System shape
Failure modes
Reusable patterns
Limits
My takeaway
References
```

Good examples after this pass:

- `readings-dynamic-workflows-agent-runtime`
- `readings-leanmarathon`
- `readings-life-framework-multi-agent-systems`

### Book Reflection

Use for book chapters and idea essays.

```text
Question
Short answer
Chapter argument
What still matters now
Personal/system analogy
Final takeaway
```

Good examples after this pass:

- `readings-mythical-man-month-ch1-6`
- `selfish-gene-chapter-11-meme`

### Math Learning Note

Use for Sutton RL and formula-heavy series.

```text
Source and purpose
One-sentence model
Assumptions / notation
Core equations
Algorithms
Worked example
Comparison table
Interview / recall answers
Final takeaway
```

Good example after this pass:

- `sutton-rl-day-3-dp`

### Lecture Engineering Note

Use for CS336-style technical lectures.

```text
Lecture frame
Main resource/accounting lens
Key formulas
Code probes
Gotchas
Checklist
What to remember
```

Good example after this pass:

- `cs336-lecture-2-resource-accounting`

### Code Tutorial Note

Use for implementation-heavy learning posts.

```text
Problem boundary
Minimal input/output example
Core loop
Implementation slices
Edge cases
Why the layer exists
Checkpoint table
```

Good example after this pass:

- `crafting-interpreters-chapter-4-scanning`

### Research Lens Short Note

Use for short research notes where the point is a lens, not a full paper summary.

```text
One-line read
Mechanism
What this enables
Limits
My takeaway
```

Good example after this pass:

- `leibo-concordia`

### Systems Note

Use for personal tooling, agent infra, and workflow notes.

```text
System shape
The two or three boundaries
Patterns
Failure modes
Operational checklist
My takeaway
```

Good example after this pass:

- `pi-agent-containerization-compaction`

## Visual / Creative Production Note

The Creative Production plugin could help later, but it is not necessary for this text pass. It would be useful for:

- per-tag cover-image direction;
- social cards for posts;
- visual mood boards for `agents`, `rl`, `systems`, and `reading`;
- consistent diagrams or article hero imagery.

I would do that after the written templates feel right.

## Next Skill Draft

If this sample pass feels right, the next step is to create a personal blog-writing skill with:

- tag detection rules;
- template selection rules;
- English-first style rules;
- code-block usage rules;
- math-formatting rules;
- before/after QA checklist;
- optional visual-asset prompt rules.

## Skill And Rollout Update

The personal Codex skill has now been created at `/Users/luna/.codex/skills/blog-writing`.

The skill keeps the templates flexible. Its core rule is to find the post's through-line before editing sections. It also preserves the lesson from the Codex Goal runtime example:

```text
misleading shallow interpretation
  -> stronger abstraction
  -> one concrete running example
  -> components, events, or boundaries
  -> why the design matters
  -> reusable lesson
```

A second rollout pass rewrote 15 additional posts:

- `readings-cc-auto-mode-ai-safety`
- `readings-claude-code-source`
- `readings-anthropic-blogs`
- `readings-building-c-compiler-agent-teams`
- `readings-mythical-man-month-ch7-12`
- `readings-the-end-of-software-engineering`
- `readings-skillopt`
- `readings-graph-of-agents`
- `readings-compression-is-all-you-need`
- `readings-lego-work-method`
- `readings-paper-reading-skills`
- `readings-yuandong-tian`
- `readings-amp-automatic-mixed-precision`
- `readings-heuristic-learning`
- `readings-talk-with-shunyu-yao`

QA for the rollout pass:

- no Chinese characters remain in the 15 rollout posts;
- Astro build succeeded with 94 generated pages;
- Pagefind indexed 94 pages as English;
- Browser QA passed on all 15 posts at desktop width and 390px mobile width, with no page-level horizontal overflow and no broken images.
