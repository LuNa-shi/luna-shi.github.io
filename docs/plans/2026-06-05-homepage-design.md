# Personal Homepage Design

## Brief

Build a personal homepage in the `LuNa-shi/personal-homepage` repository using Astro and as-folio. The site should be less academic by default and more blog/life/research-notebook oriented. It should prioritize blog posts, personal projects, and research interests.

## Decisions

- Use as-folio as the framework base because it already supports Astro 6, MDX blog posts, image zoom, project pages, RSS, sitemap, and Pagefind search.
- Disable dark mode and force the site to render light-only.
- Keep content local at build time. Use Notion only as a seed source for public examples, not as a runtime CMS.
- Avoid publishing private Notion URLs or temporary signed Notion image URLs.
- Add a standalone research page so the site can describe current interests before formal papers exist.

## Information Architecture

- About: short personal introduction and current threads.
- Blog: primary writing surface for Notion-migrated notes, reading logs, and technical posts.
- Projects: selected code and research-adjacent projects.
- Research: overview of longer-term interests.

## Visual Direction

Keep as-folio's compact reading layout, but tune copy and navigation to feel like a living notebook. Use a teal accent, local images, plain sectioning, and no dark-mode toggle.

## Content Seeds

Initial posts are public-safe condensed versions of Notion material:

- agent containerization and compaction
- Sutton RL child-page notes
- Crafting Interpreters child-page notes
- CS336 child-page notes
- multi-agent systems reading synthesis
- homepage growth note

## Verification

Run dependency install, type checks, unit tests, production build, and a local browser smoke test.
