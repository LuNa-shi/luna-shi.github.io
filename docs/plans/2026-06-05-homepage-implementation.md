# Personal Homepage Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a light-only Astro/as-folio personal homepage focused on blogs, projects, and research interests.

**Architecture:** Start from the upstream as-folio template, then personalize configuration, navigation, content collections, and deployment defaults. Keep content local in Astro collections, with Notion-derived examples converted into safe MDX seed posts.

**Tech Stack:** Astro 6, TypeScript, MDX, Tailwind CSS v4, Pagefind, Vitest, GitHub Pages.

---

### Task 1: Scaffold As-Folio

**Files:**

- Create: as-folio project files under repository root.
- Preserve: local untracked `EOF` file.

**Steps:**

1. Fetch `dadangnh/as-folio`.
2. Copy template files into the repository without copying `.git`.
3. Confirm `git status` shows template files and the original `EOF` remains untracked.

### Task 2: Personalize Site Configuration

**Files:**

- Modify: `src/config/site.ts`
- Modify: `src/layouts/Base.astro`
- Modify: `src/components/Navbar.astro`
- Modify: `astro.config.mjs`
- Modify: `.github/workflows/deploy.yml`

**Steps:**

1. Set author, title, description, GitHub username, navigation, blog metadata, and project-page copy.
2. Disable dark mode and force `data-theme="light"` at runtime.
3. Remove theme-toggle rendering from the navbar.
4. Set GitHub Pages defaults to `https://luna-shi.github.io/personal-homepage/`.

### Task 3: Replace Demo Content

**Files:**

- Modify: `src/data/about.mdx`
- Create: `src/content/posts/*.mdx`
- Create: `src/content/projects/*.md`
- Create: `src/content/announcements/*.md`
- Create: `src/data/*.yml`
- Create: `src/data/resume.json`

**Steps:**

1. Remove as-folio demo personas, books, teaching, and sample posts.
2. Add public-safe Notion-seeded blog examples.
3. Add selected GitHub projects.
4. Add minimal CV, repository, publication, citation, and coauthor data files so all existing routes build.

### Task 4: Add Research Page

**Files:**

- Create: `src/pages/research.astro`

**Steps:**

1. Add a compact research-interest page.
2. Put multi-agent systems and agent-system format first, with embodied agents as prior work.
3. Add light-only styling consistent with the rest of the site.

### Task 5: Verify

**Commands:**

- `yarn install` or `npm install`
- `yarn test:types` or `npm run test:types`
- `yarn test` or `npm test`
- `yarn build` or `npm run build`

**Expected:**

- Type checks pass.
- Unit tests pass.
- Production build emits `dist/`.
- Blog posts render without fake screenshots or temporary Notion image URLs.
