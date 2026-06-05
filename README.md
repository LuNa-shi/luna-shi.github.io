# Personal Homepage

Astro personal homepage for LuNa Shi, adapted from [as-folio](https://github.com/dadangnh/as-folio).

The current version is intentionally blog-first and light-only. It keeps as-folio's MDX posts, project pages, RSS, sitemap, image zoom, and Pagefind search, while making the public surface feel more like a notebook than a formal academic homepage.

## Structure

- `src/content/posts/` - blog posts and Notion-seeded public notes.
- `src/content/projects/` - project cards and project detail pages.
- `src/pages/research.astro` - research-interest overview.
- `src/data/papers.bib` - optional paper records, kept off the main navigation for now.
- `public/assets/img/` - local image assets used by MDX posts and cards.

## Local Development

Node 24+ is expected.

```bash
yarn install
yarn dev
```

If Corepack is unavailable locally, use npm as a fallback:

```bash
npm install
npm run dev
```

## Writing Posts With Images

Standard Markdown images work:

```md
![Alt text](/assets/img/example.jpg)
```

MDX posts can also use the bundled figure component:

```mdx
import Figure from '@components/Figure.astro';

<Figure path="/assets/img/example.jpg" alt="Useful alt text" caption="A short caption." />
```

Put durable images under `public/assets/img/posts/`. Avoid publishing Notion's temporary signed image URLs directly.

## Deployment

The GitHub Pages workflow publishes the user site at:

- `ASTRO_SITE=https://luna-shi.github.io`
- root path, with no `ASTRO_BASE`

Set `ASTRO_BASE` only if this site is moved back to a project-page subpath.
