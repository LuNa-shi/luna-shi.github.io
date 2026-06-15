# AGENTS.md — as-folio

Guidelines for AI agents (Claude Code, Codex, Copilot Workspace, etc.) contributing to as-folio.

---

## Repository layout

```text
as-folio/
├── src/
│   ├── config/site.ts        ← single config file (start here)
│   ├── content/              ← collections: posts, projects, people, teaching, books, announcements
│   ├── data/
│   │   ├── papers.bib        ← BibTeX bibliography
│   │   ├── coauthors.yml     ← co-author profile links (LastName: { url, scholar, orcid })
│   │   ├── citations.yml     ← citation counts keyed by google_scholar_id (auto-updated)
│   │   ├── cv.yml            ← RenderCV format CV
│   │   ├── resume.json       ← JSONResume format CV
│   │   └── repositories.yml  ← GitHub repos config
│   ├── layouts/              ← Base.astro, Page.astro, Post.astro, Distill.astro
│   ├── components/           ← UI components
│   ├── pages/                ← Astro route pages
│   └── styles/               ← global.css, _colors.css, _typography.css
├── scripts/
│   └── update-citations.ts   ← fetches citation counts from OpenAlex API (run via yarn citations:update)
├── public/                   ← static assets (images, favicon, PDFs)
├── astro.config.mjs
├── package.json
├── CLAUDE.md                 ← coding conventions and architecture (read this first)
├── AGENTS.md                 ← this file
├── README.md
├── QUICKSTART.md
└── CUSTOMIZE.md
```

All paths in this file are relative to the repository root.

---

## Build command

```bash
yarn build        # must exit 0 before submitting any PR
```

Run this after every non-trivial change. If the build fails, fix it before proceeding.

---

## What to do first

1. **Read `CLAUDE.md`** — coding conventions, architecture, common pitfalls
2. **Read `src/config/site.ts`** — understand the config shape before touching features
3. **Read `src/content.config.ts`** — understand content schemas before adding fields
4. **Run `yarn build`** — confirm baseline passes

---

## Key rules

### Package manager

Use `yarn`. Never `npm` or `npx`. Never `yarn add --dev` — use `yarn add -D`.

### Content Layer API

Use Astro 6 API: `const { Content } = await render(entry)` — not `entry.render()`.

### CSS

- CSS custom properties for all theming (see `src/styles/_colors.css`)
- Dark mode via `[data-theme='dark']` selector — never Tailwind's `dark:` prefix
- No `innerHTML` with untrusted content — use `textContent`

### Config changes

Any new feature must have:

- A flag in `site.ts` with a JSDoc comment
- Documentation in `CUSTOMIZE.md`
- Build verified to exit 0

### No hardcoded persona strings

**Never embed persona names, demo values, or user-visible strings directly in components.**
All such values must originate in `src/config/site.ts` and be passed down as props.

Examples of what NOT to do:

```typescript
// ❌ Wrong — hardcoded persona
const PERSONA_LAST_NAME = 'einstein';

// ❌ Wrong — hardcoded UI label
<button>Abs</button>
```

Examples of what to do instead:

```typescript
// ✅ Correct — derived from config
const authorLastName = site.publications.authorLastName ?? site.author.name.split(' ').pop() ?? '';

// ✅ Correct — label from config
<button>{labels.abstract ?? 'Abs'}</button>
```

This applies to publication author highlighting, search placeholders, empty-state messages, page descriptions, and any other user-visible text.

### Schema changes

When adding BibTeX fields, frontmatter fields, or collection fields:

- Update `src/content.config.ts` with the Zod schema
- Use `z.coerce.string()` for fields that YAML may parse as numbers (ISBN, IDs)
- Add `optional()` with a default for fields that may not be present

---

## Patterns to follow

### Clickable card with inner link (avoid nested `<a>`)

```astro
<div class="card" data-href={url} role="link" tabindex="0">
  {/* inner GitHub link — real <a> */}
  <a href={githubUrl} class="github-link" onclick="event.stopPropagation()">...</a>
</div>

<script>
  document.querySelectorAll('[data-href]').forEach((card) => {
    card.addEventListener('click', (e) => {
      if (!(e.target as Element).closest('a')) {
        window.location.href = card.dataset.href!;
      }
    });
  });
</script>
```

### Per-post CDN widget (in Post.astro)

```astro
---
const { chart_js = false } = post.data;
---

{chart_js && <script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js" defer />}
```

### Analytics injection (in Base.astro)

```astro
---
const { pirsch } = site.analytics;
---

{pirsch && <script defer src="https://api.pirsch.io/pa.js" data-code={pirsch} />}
```

---

## Files you should NOT modify

- `yarn.lock` — managed by yarn automatically
- `dist/` — build output, not tracked in git
- `.husky/` — hooks managed by husky

---

## Files you will frequently modify

| File                          | Purpose                                              |
| ----------------------------- | ---------------------------------------------------- |
| `src/config/site.ts`          | Add feature flags, config options                    |
| `src/content.config.ts`       | Add collection fields                                |
| `src/layouts/Post.astro`      | Add per-post CDN widgets                             |
| `src/layouts/Base.astro`      | Add global scripts (analytics, consent)              |
| `src/components/*.astro`      | New UI components                                    |
| `src/pages/*.astro`           | New or modified pages                                |
| `src/content/**/*.md`         | Demo content                                         |
| `src/data/papers.bib`         | BibTeX demo entries                                  |
| `src/data/coauthors.yml`      | Co-author links (LastName → url/scholar/orcid)       |
| `src/data/citations.yml`      | Citation counts; auto-updated — rarely edit manually |
| `scripts/update-citations.ts` | Citation fetch script; edit to change API/options    |
| `CUSTOMIZE.md`                | Document new features                                |

---

## Markdown Vault Sync

When the user asks to sync or deploy the Markdown vault, use this source:

```text
/Users/luna/Projects/Blogs
```

Import rules:

- Copy vault posts from `blogs/*.md` into `src/content/posts/`, keeping the original Markdown filename unless the user asks for a rename. For language suffixes like `.en` or `.zh`, convert the destination filename suffix to `-en` or `-zh` so Astro generates readable routes.
- Do not sync Chinese posts by default. Skip `.zh.md` files and posts whose title/body is primarily Chinese unless the user explicitly asks for the Chinese version to be published.
- Copy only local image assets actually referenced by each post.
- Put imported post images under `public/assets/img/blog/<site-post-basename>/`.
- Rewrite vault image links from `../attachments/<blog-file-basename>/<asset-file>` to `/assets/img/blog/<site-post-basename>/<asset-file>`.
- Do not copy vault prompt files, drafts in the root, `.obsidian/`, unused attachments, package/source files from temporary exports, or generated build output.
- The posts schema requires `title` and `date`; if a vault post lacks `date`, add the sync date in frontmatter.
- Every synced post should include a TLDR:
  - add frontmatter `overview` for listing cards and search context;
  - add a visible `TLDR: ...` paragraph near the top of the post, after the H1/subtitle and before the main opening;
  - summarize only the post's existing core judgment; do not introduce claims not supported by the body.
- Preserve post prose, headings, code blocks, tables, external links, citations, and author intent. Only change frontmatter or image paths needed for this site.

Validation after sync:

```bash
rg -n 'attachments/|\\.\\./attachments' src/content/posts/<post-file>.md
NODE_OPTIONS="--use-system-ca" \
NODE_EXTRA_CA_CERTS="/Users/luna/.homebrew/etc/ca-certificates/cert.pem" \
yarn build
```

Commit and push only the intended imported posts, imported assets, and instruction updates. Deployment is handled by the GitHub Pages workflow after pushing to `main`; confirm the workflow finishes successfully.

---

## Testing

```bash
yarn test           # unit tests (Vitest)
yarn lint           # ESLint
yarn format         # Prettier (check only in CI)
yarn build          # full production build + pagefind index
```

The build is the primary acceptance test. All pages must generate without errors.

---

## Pull request checklist

- [ ] `yarn build` exits 0 with 0 TypeScript errors
- [ ] `yarn lint` passes
- [ ] New feature has a flag in `site.ts`
- [ ] New feature documented in `CUSTOMIZE.md`
- [ ] New collection fields added to `src/content.config.ts`
- [ ] Demo content updated if needed
