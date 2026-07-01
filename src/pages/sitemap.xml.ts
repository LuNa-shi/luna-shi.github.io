/**
 * Custom sitemap endpoint — generates /sitemap.xml at build time.
 *
 * <lastmod> strategy (SEO best practice: omit rather than fake):
 *   - Blog posts:  data.lastmod (frontmatter) → git commit date → data.date (publish)
 *   - Projects:    git commit date → omit
 *   - Static pages: git commit date of page file → today (homepage only) → omit
 *
 * When git is unavailable (no repo / CI without git history), gitLastmod() returns
 * undefined and each URL falls back gracefully without emitting a stale date.
 *
 * Replaces @astrojs/sitemap which cannot access content-layer dates.
 */

import { spawnSync } from 'node:child_process';

import { site } from '@config/site';
import { contentSlug, isEntryInLocale, type Locale, localizedPath } from '@utils/i18n';
import type { APIContext } from 'astro';
import { getCollection } from 'astro:content';

const siteUrl = site.url.replace(/\/$/, '');

function loc(path: string, locale: Locale): string {
  return `${siteUrl}${localizedPath(path, locale)}`;
}

/**
 * Returns the last git commit date (YYYY-MM-DD) for a file, or undefined
 * when git is unavailable or the file has no commits yet.
 *
 * Uses spawnSync (not exec/execSync) so file paths are passed as arguments,
 * not interpolated into a shell command — no shell injection risk.
 */
function gitLastmod(filePath: string): string | undefined {
  const result = spawnSync('git', ['log', '-1', '--format=%ci', '--', filePath], {
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  if (result.status !== 0 || !result.stdout?.trim()) return undefined;
  // Output: "2025-03-20 14:30:00 +0700" → "2025-03-20"
  return result.stdout.trim().split(' ')[0] || undefined;
}

interface UrlEntry {
  url: string;
  lastmod?: string;
  changefreq?: string;
  priority?: number;
}

function urlEntry({ url, lastmod, changefreq, priority }: UrlEntry): string {
  return [
    '  <url>',
    `    <loc>${url}</loc>`,
    lastmod ? `    <lastmod>${lastmod}</lastmod>` : '',
    changefreq ? `    <changefreq>${changefreq}</changefreq>` : '',
    priority !== undefined ? `    <priority>${priority.toFixed(1)}</priority>` : '',
    '  </url>',
  ]
    .filter(Boolean)
    .join('\n');
}

export async function GET(_ctx: APIContext): Promise<Response> {
  const [posts, projects, digests] = await Promise.all([
    getCollection('posts', (p) => !p.data.draft && !p.data.hidden),
    getCollection('projects', (p) => !p.data.redirect),
    getCollection('digests', (d) => !d.data.draft && !d.data.hidden),
  ]);

  const today = new Date().toISOString().split('T')[0];

  // Static pages: git date of their source file.
  // Homepage falls back to today (it aggregates live content so build-date is legitimate).
  // Other static pages omit <lastmod> when git is unavailable.
  const staticPages = [
    {
      path: '/',
      lastmod: gitLastmod('src/pages/index.astro') ?? today,
      changefreq: 'weekly',
      priority: 1.0,
    },
    {
      path: '/blog/',
      lastmod: gitLastmod('src/pages/blog/index.astro'),
      changefreq: 'weekly',
      priority: 0.9,
    },
    {
      path: '/digest/',
      lastmod: gitLastmod('src/pages/digest/index.astro'),
      changefreq: 'weekly',
      priority: 0.8,
    },
    {
      path: '/projects/',
      lastmod: gitLastmod('src/pages/projects/index.astro'),
      changefreq: 'monthly',
      priority: 0.8,
    },
    {
      path: '/research/',
      lastmod: gitLastmod('src/pages/research.astro'),
      changefreq: 'monthly',
      priority: 0.8,
    },
    {
      path: '/news/',
      lastmod: gitLastmod('src/pages/news.astro'),
      changefreq: 'monthly',
      priority: 0.6,
    },
    {
      path: '/publications/',
      lastmod: gitLastmod('src/pages/publications/index.astro'),
      changefreq: 'monthly',
      priority: 0.6,
    },
  ];

  const staticUrls: UrlEntry[] = (['en', 'zh'] as Locale[]).flatMap((locale) =>
    staticPages.map(({ path, ...entry }) => ({
      ...entry,
      url: loc(path, locale),
    })),
  );

  const postUrls: UrlEntry[] = posts
    .sort((a, b) => b.data.date.getTime() - a.data.date.getTime())
    .map((p) => {
      const locale = isEntryInLocale(p, 'zh') ? 'zh' : 'en';
      return {
        url: loc(`/blog/${contentSlug(p)}/`, locale),
        // Priority: explicit lastmod frontmatter → git commit date → publish date
        lastmod:
          p.data.lastmod?.toISOString().split('T')[0] ??
          (p.filePath ? gitLastmod(p.filePath) : undefined) ??
          p.data.date.toISOString().split('T')[0],
        changefreq: 'monthly',
        priority: 0.7,
      };
    });

  const projectUrls: UrlEntry[] = projects.map((p) => {
    const locale = isEntryInLocale(p, 'zh') ? 'zh' : 'en';
    return {
      url: loc(`/projects/${contentSlug(p)}/`, locale),
      // Only emit lastmod when git can provide a real date; omit otherwise
      lastmod: p.filePath ? gitLastmod(p.filePath) : undefined,
      changefreq: 'monthly',
      priority: 0.7,
    };
  });

  const digestUrls: UrlEntry[] = digests
    .sort((a, b) => b.data.date.getTime() - a.data.date.getTime())
    .map((d) => {
      const locale = isEntryInLocale(d, 'zh') ? 'zh' : 'en';
      return {
        url: loc(`/digest/${contentSlug(d)}/`, locale),
        lastmod: d.filePath ? gitLastmod(d.filePath) : d.data.date.toISOString().split('T')[0],
        changefreq: 'weekly',
        priority: 0.7,
      };
    });

  const allUrls = [...staticUrls, ...postUrls, ...projectUrls, ...digestUrls];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allUrls.map(urlEntry).join('\n')}
</urlset>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
