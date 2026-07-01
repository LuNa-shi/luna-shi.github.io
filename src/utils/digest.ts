import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

import yaml from 'js-yaml';

type DigestChannel = 'x' | 'youtube' | 'blog' | 'rss' | 'manual';
type DigestLang = 'en' | 'zh';

interface XPostMetrics {
  likes?: number;
  retweets?: number;
  replies?: number;
  quotes?: number;
  views?: number;
  bookmarks?: number;
}

interface XPost {
  id: string;
  watched_handle?: string;
  author_handle: string;
  author_name?: string;
  createdAtISO?: string;
  createdAtLocal?: string;
  text: string;
  metrics?: XPostMetrics;
  topics?: string[];
  watched_priority_base?: string;
  source_file?: string;
  score?: number;
}

interface RawTweet {
  id: string;
  author?: {
    name?: string;
    screenName?: string;
    profileImageUrl?: string;
  };
  media?: Array<{
    type?: string;
    url?: string;
    width?: number;
    height?: number;
  }>;
}

export interface DigestHighlightItem {
  title: string;
  source: string;
  channel: DigestChannel;
  url: string;
  image?: string;
  imageAlt?: string;
  priority?: string;
  note: string;
}

export interface DigestFrontmatter {
  title: string;
  date: string;
  lang: DigestLang;
  translationKey: string;
  canonicalSlug: string;
  summary: string;
  dateRange: {
    start: string;
    end: string;
  };
  channels: DigestChannel[];
  tags: string[];
  coverage: {
    accountsTotal: number;
    accountsChecked: number;
    posts: number;
    likes: number;
  };
  highlightItems: DigestHighlightItem[];
}

export interface DigestDraft {
  frontmatter: DigestFrontmatter;
  body: string;
}

interface BuildDigestDraftOptions {
  newsWorkspace: string;
  date: string;
  lang?: DigestLang;
  highlightLimit?: number;
}

interface MergedRun {
  since?: string;
  count?: number;
  items?: XPost[];
}

interface AccountStats {
  account_count?: number;
  accounts?: Array<{ handle?: string; recent_count?: number }>;
}

export function tweetUrl(handle: string, id: string): string {
  return `https://x.com/${handle.replace(/^@/, '')}/status/${id}`;
}

export async function buildDigestDraft({
  newsWorkspace,
  date,
  lang = 'zh',
  highlightLimit = 6,
}: BuildDigestDraftOptions): Promise<DigestDraft> {
  const merged = await readJson<MergedRun>(
    path.join(newsWorkspace, 'runs', `${date}-x-3day-merged.json`),
  );
  const items = Array.isArray(merged.items) ? merged.items : [];
  const highlights = await buildHighlights(newsWorkspace, items, highlightLimit);
  const accountStats = await readOptionalJson<AccountStats>(
    path.join(newsWorkspace, 'runs', `${date}-x-3day-account-stats.json`),
  );
  const sourceBrief = await readOptionalText(
    path.join(newsWorkspace, 'briefings', `${date}-x-3day-briefing.md`),
  );
  const accountsTotal = accountStats?.account_count ?? 0;
  const accountsChecked =
    accountStats?.accounts?.filter((account) => (account.recent_count ?? 0) > 0).length ??
    countUnique(items.map((item) => item.watched_handle ?? item.author_handle));
  const start = merged.since ?? shiftIsoDate(date, -3);
  const slug = `${date}-ai-agents-x-digest`;

  return {
    frontmatter: {
      title: lang === 'zh' ? `${date} AI 热点简报` : `${date} AI Digest`,
      date,
      lang,
      translationKey: slug,
      canonicalSlug: slug,
      summary:
        lang === 'zh'
          ? '围绕 agent workflow、机器人、推理基础设施和开源模型的三天高信号更新。'
          : 'A three-day scan of high-signal updates across agent workflows, robotics, inference infrastructure, and open models.',
      dateRange: {
        start,
        end: date,
      },
      channels: ['x'],
      tags: ['ai-agents', 'robotics', 'infra', 'open-models'],
      coverage: {
        accountsTotal,
        accountsChecked,
        posts: merged.count ?? items.length,
        likes: 0,
      },
      highlightItems: highlights,
    },
    body: sourceBrief
      ? prepareSourceBrief(sourceBrief, lang, highlights)
      : fallbackDigestBody(lang, highlights),
  };
}

export function renderDigestMdx(draft: DigestDraft): string {
  const frontmatter = yaml.dump(draft.frontmatter, {
    lineWidth: 100,
    noRefs: true,
    sortKeys: false,
  });
  return `---\n${frontmatter}---\n\n${draft.body.trim()}\n`;
}

async function buildHighlights(
  newsWorkspace: string,
  items: XPost[],
  limit: number,
): Promise<DigestHighlightItem[]> {
  const selected = [...items]
    .filter((item) => item.id && item.author_handle && item.text)
    .filter((item) => summarizeNote(item.text).length > 0)
    .filter((item) => isPublishablePriority(item.watched_priority_base))
    .sort((a, b) => itemScore(b) - itemScore(a))
    .slice(0, limit);

  return Promise.all(
    selected.map(async (item) => {
      const raw = await readRawTweet(newsWorkspace, item);
      const media = raw?.media?.find((asset) => asset.type === 'photo' && asset.url);
      const image = media?.url;

      return {
        title: summarizeTitle(item.text, item.author_name ?? item.author_handle),
        source: `@${item.author_handle.replace(/^@/, '')}`,
        channel: 'x' as const,
        url: tweetUrl(item.author_handle, item.id),
        ...(image
          ? { image, imageAlt: `${item.author_name ?? item.author_handle} X post image` }
          : {}),
        priority: item.watched_priority_base,
        note: summarizeNote(item.text),
      };
    }),
  );
}

async function readRawTweet(newsWorkspace: string, item: XPost): Promise<RawTweet | undefined> {
  if (!item.source_file) return undefined;
  const sourcePath = safeJoin(newsWorkspace, item.source_file);
  if (!sourcePath) return undefined;
  const raw = await readOptionalJson<{ data?: RawTweet[] }>(sourcePath);
  return raw?.data?.find((tweet) => tweet.id === item.id);
}

function isPublishablePriority(priority: string | undefined): boolean {
  return !priority || priority === 'core' || priority === 'high';
}

function itemScore(item: XPost): number {
  const metrics = item.metrics ?? {};
  const engagement =
    (metrics.likes ?? 0) +
    (metrics.bookmarks ?? 0) * 1.5 +
    (metrics.retweets ?? 0) * 2 +
    (metrics.quotes ?? 0) * 2 +
    (metrics.replies ?? 0);
  const forwardedPenalty =
    item.watched_handle && !sameHandle(item.watched_handle, item.author_handle) ? 25 : 0;
  return (item.score ?? 0) + Math.log10(engagement + 10) - forwardedPenalty;
}

function sameHandle(a: string, b: string): boolean {
  return a.replace(/^@/, '').toLowerCase() === b.replace(/^@/, '').toLowerCase();
}

function summarizeTitle(text: string, fallback: string): string {
  const firstLine = stripUrls(text)
    .split(/\n+/)
    .map((line) => line.trim())
    .find(Boolean);
  return truncate(firstLine ?? `${fallback} update`, 86);
}

function summarizeNote(text: string): string {
  return truncate(stripUrls(text).replace(/\s+/g, ' ').trim(), 180);
}

function stripUrls(text: string): string {
  return text.replace(/https?:\/\/\S+/g, '').trim();
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function stripFirstHeading(markdown: string): string {
  return markdown.replace(/^# .*(?:\r?\n){1,2}/, '').trim();
}

function prepareSourceBrief(
  markdown: string,
  lang: DigestLang,
  highlights: DigestHighlightItem[],
): string {
  const body = removeOperationalLead(stripFirstHeading(markdown));
  const publishable = removeOperationalSections(body).trim();
  return publishable || fallbackDigestBody(lang, highlights);
}

function removeOperationalLead(markdown: string): string {
  return markdown
    .split(/\r?\n/)
    .filter((line) => !isOperationalLeadLine(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function isOperationalLeadLine(line: string): boolean {
  return /^(窗口|来源|连接方式|window|source|connection)\s*[:：]/i.test(line.trim());
}

function removeOperationalSections(markdown: string): string {
  const lines = markdown.split(/\r?\n/);
  const kept: string[] = [];
  let droppedHeadingLevel = 0;

  for (const line of lines) {
    const heading = /^(#{2,6})\s+(.+?)\s*$/.exec(line);

    if (heading) {
      const level = heading[1].length;

      if (droppedHeadingLevel > 0 && level > droppedHeadingLevel) {
        continue;
      }

      droppedHeadingLevel = isOperationalSectionTitle(heading[2]) ? level : 0;
      if (droppedHeadingLevel > 0) continue;
    } else if (droppedHeadingLevel > 0) {
      continue;
    }

    kept.push(line);
  }

  return kept.join('\n').replace(/\n{3,}/g, '\n\n');
}

function isOperationalSectionTitle(title: string): boolean {
  const normalized = title.replace(/[`*_]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

  return [
    '覆盖情况',
    '账号分层',
    '推荐调整',
    '下次自动化建议',
    'coverage',
    'source coverage',
    'account tiers',
    'watchlist tiers',
    'recommended adjustments',
    'next automation',
    'automation notes',
  ].some((blocked) => normalized === blocked);
}

function fallbackDigestBody(lang: DigestLang, highlights: DigestHighlightItem[]): string {
  const title = lang === 'zh' ? '## 核心更新' : '## Core Updates';
  const bullets = highlights
    .map((item) => `- [${item.source}](${item.url}) ${item.note}`)
    .join('\n');
  return `${title}\n\n${bullets || (lang === 'zh' ? '暂无可发布条目。' : 'No publishable items yet.')}`;
}

function shiftIsoDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function countUnique(values: string[]): number {
  return new Set(values.filter(Boolean).map((value) => value.replace(/^@/, '').toLowerCase())).size;
}

function safeJoin(root: string, relativePath: string): string | undefined {
  if (path.isAbsolute(relativePath)) return undefined;
  const resolvedRoot = path.resolve(root);
  const resolvedPath = path.resolve(root, relativePath);
  return resolvedPath.startsWith(`${resolvedRoot}${path.sep}`) ? resolvedPath : undefined;
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, 'utf8')) as T;
}

async function readOptionalJson<T>(filePath: string): Promise<T | undefined> {
  if (!(await exists(filePath))) return undefined;
  return readJson<T>(filePath);
}

async function readOptionalText(filePath: string): Promise<string | undefined> {
  if (!(await exists(filePath))) return undefined;
  return readFile(filePath, 'utf8');
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
