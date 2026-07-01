---
name: digest-skills
description: Use when generating, editing, or publishing the site's recurring Digest briefings from X, liked posts, blogs, YouTube, RSS, or other watched sources.
---

# Digest Skills

## Overview

Use this project-local skill to turn watched-source updates into publishable `/digest/` briefings. Keep raw collection data in the private news workspace; publish only curated summaries, source links, and public media.

## Workflow

1. Read `references/editorial-sop.md` before writing or revising any public digest.
2. Update sources in the news workspace: X following, liked posts, account priority files, source-specific raw runs, and comment/reply context for selected core posts.
3. Generate a draft MDX file with `yarn digest:generate -- --date YYYY-MM-DD --lang zh`.
4. Edit the draft into a self-contained public briefing: remove collection logs, promote core items, demote noise, mark unverified claims, and rewrite important posts with the two-paragraph post template.
5. Build the site with `yarn build` before publishing.

## Resources

- Read `references/source-policy.md` before adding or changing data sources.
- Read `references/editorial-sop.md` for the full collection-to-writing SOP and per-post template.
- Read `references/brief-quality.md` before finalizing a public digest.
- Use `scripts/generate-digest.ts` for deterministic MDX draft generation from `/Users/luna-mac/Projects/news`.

## Output Contract

Generated digests live in `src/content/digests/`. The public routes are `/digest/`, `/digest/<slug>/`, `/zh/digest/`, and `/zh/digest/<slug>/`. The existing `/news/` route is reserved for personal status updates and announcements.
