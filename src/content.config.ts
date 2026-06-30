import { glob } from 'astro/loaders';
import { defineCollection, z } from 'astro:content';

// ─── Posts ─────────────────────────────────────────────────────────────────

const posts = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/posts' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    /** Short human-readable preview used in blog cards. */
    overview: z.string().optional(),
    description: z.string().optional(),
    /** Language of this content entry. Defaults to English for legacy content. */
    lang: z.enum(['en', 'zh']).optional().default('en'),
    /** Legacy language field from imported posts. Prefer `lang` for new content. */
    language: z.enum(['en', 'zh']).optional(),
    /** Stable key shared by translated versions of the same post. */
    translationKey: z.string().optional(),
    /** URL slug used for localized routes when the filename carries a language suffix. */
    canonicalSlug: z.string().optional(),
    /** Hashtag-style series or topic labels, e.g. 'codex-source-dive' or 'sutton-rl'. */
    tags: z.array(z.string()).optional().default([]),
    /** Broad blog shelves, e.g. 'agents', 'systems', 'learning', 'reading', or 'research'. */
    categories: z.array(z.string()).optional().default([]),
    /** Enable KaTeX math rendering. */
    math: z.boolean().optional().default(false),
    /** Show table of contents sidebar. */
    toc: z.boolean().optional().default(true),
    /** Show related posts section. */
    relatedPosts: z.boolean().optional().default(false),
    /** Pin to top of blog listing. */
    pinned: z.boolean().optional().default(false),
    /** Hide from blog listing (but accessible via direct URL). */
    hidden: z.boolean().optional().default(false),
    /** Draft post — hidden from all listings and the search index until published. */
    draft: z.boolean().optional().default(false),
    /** Override the robots meta tag (e.g. 'noindex, nofollow'). Useful for sensitive posts. */
    robots: z.string().optional(),
    /** Last modified date — displayed in the post header and used in JSON-LD dateModified. */
    lastmod: z.coerce.date().optional(),
    /** Redirect to external URL instead of rendering content. */
    redirect: z.string().url().optional(),
    /** Hero/thumbnail image path. */
    image: z.string().optional(),
    /** Load Mermaid diagram rendering on this post. */
    mermaid: z.boolean().optional().default(false),
    /** Load Chart.js on this post. */
    chart_js: z.boolean().optional().default(false),
    /** Load Apache ECharts on this post. */
    echarts: z.boolean().optional().default(false),
    /** Load Vega/Vega-Lite on this post. */
    vega: z.boolean().optional().default(false),
    /** Load Plotly.js on this post. */
    plotly: z.boolean().optional().default(false),
    /** Load pseudocode.js on this post. */
    pseudocode: z.boolean().optional().default(false),
    /** Load Typograms on this post. */
    typograms: z.boolean().optional().default(false),
    /** Load TikzJax on this post. */
    tikzjax: z.boolean().optional().default(false),
    /** Load Leaflet maps on this post. */
    map: z.boolean().optional().default(false),
    /** Load img-comparison-slider on this post. */
    img_comparison: z.boolean().optional().default(false),
    /** Load Diff2Html on this post. */
    code_diff: z.boolean().optional().default(false),
    /** Load PhotoSwipe gallery on this post. */
    gallery: z.boolean().optional().default(false),
    /** Enable Disqus comments on this post. */
    disqus: z.boolean().optional().default(false),
  }),
});

// ─── Projects ──────────────────────────────────────────────────────────────

const projects = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/projects' }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    /** Language of this content entry. Defaults to English for legacy content. */
    lang: z.enum(['en', 'zh']).optional().default('en'),
    /** Stable key shared by translated versions of the same project. */
    translationKey: z.string().optional(),
    /** URL slug used for localized routes when the filename carries a language suffix. */
    canonicalSlug: z.string().optional(),
    /** Thumbnail image path. */
    img: z.string().optional(),
    /** Alt text for image. */
    img_alt: z.string().optional(),
    /** External URL (e.g. GitHub repo). */
    url: z.string().url().optional(),
    /** GitHub repo in format owner/repo — auto-links to repo. */
    github: z.string().optional(),
    /** GitHub repo path (owner/repo) for fetching live star count. */
    github_stars: z.string().optional(),
    /** Sort order (lower = shown first). */
    importance: z.number().optional().default(999),
    /** Badge label shown on card (e.g. 'open source'). */
    category: z.string().optional(),
    /** Show redirect to external url instead of project page. */
    redirect: z.string().url().optional(),
    /** Citation keys from papers.bib to show as References at the bottom of the project page. */
    related_publications: z.array(z.string()).optional(),
    /** Enable Giscus comments on the project page. */
    giscus_comments: z.boolean().optional().default(false),
  }),
});

// ─── Announcements ─────────────────────────────────────────────────────────

const announcements = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/announcements' }),
  schema: z.object({
    date: z.coerce.date(),
    /** Pin this announcement to the top. */
    pinned: z.boolean().optional().default(false),
    /** Language of this content entry. Defaults to English for legacy content. */
    lang: z.enum(['en', 'zh']).optional().default('en'),
    /** Stable key shared by translated versions of the same announcement. */
    translationKey: z.string().optional(),
    /** Hide from the announcements list. */
    hidden: z.boolean().optional().default(false),
  }),
});

export const collections = { posts, projects, announcements };
