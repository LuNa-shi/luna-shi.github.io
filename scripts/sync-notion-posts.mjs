#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_CONFIG = join(PROJECT_ROOT, 'notion.sync.config.json');
const DEFAULT_CACHE_ROOT = join(
  process.env.HOME ?? '',
  'Library/Application Support/Notion/Partitions/notion/File System',
);

const args = parseArgs(process.argv.slice(2));
const dryRun = Boolean(args['dry-run']);
const source = String(args.source ?? 'api');
const configPath = resolve(PROJECT_ROOT, String(args.config ?? DEFAULT_CONFIG));
const allowPartial = Boolean(args['allow-partial']);
const internalDelayMs = Number(args.delay ?? 500);

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

async function main() {
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  const outputDir = resolve(PROJECT_ROOT, config.outputDir ?? 'src/content/posts');
  const assetDir = resolve(PROJECT_ROOT, config.assetDir ?? 'public/assets/img/notion');
  await mkdir(outputDir, { recursive: true });
  await mkdir(assetDir, { recursive: true });

  const plannedPages = config.parents.flatMap((parent) =>
    (parent.children ?? []).map((child) => ({
      ...child,
      id: normalizeId(child.id),
      parent,
      category: child.category ?? parent.category,
      categories: child.categories ?? parent.categories ?? (child.category ?? parent.category),
      tags: child.tags ?? parent.tags ?? [],
    })),
  );
  const filteredPages = filterPlannedPages(plannedPages);

  if (source === 'cache') {
    await syncFromDesktopCache({ config, outputDir, plannedPages: filteredPages });
    return;
  }

  if (source === 'internal') {
    await syncFromInternalApi({ outputDir, plannedPages: filteredPages });
    return;
  }

  await syncFromOfficialApi({ config, outputDir, assetDir, plannedPages: filteredPages });
}

function filterPlannedPages(pages) {
  const only = String(args.only ?? '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  if (!only.length) return pages;

  return pages.filter((page) =>
    only.some((needle) =>
      [page.id, compactId(page.id), page.slug, page.title, page.parent?.key, page.parent?.title]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle)),
    ),
  );
}

async function syncFromOfficialApi({ config, outputDir, assetDir, plannedPages }) {
  const token = await readNotionToken();
  if (!token) {
    throw new Error(
      'Missing Notion API token. Set NOTION_API_KEY / NOTION_TOKEN or save it to ~/.config/notion/api_key.',
    );
  }

  const exported = [];
  const skipped = [];
  const pageQueue = plannedPages.length ? plannedPages : await discoverConfiguredChildren(config, token);

  for (const page of pageQueue) {
    try {
      const pageMeta = await notionRequest(token, `/pages/${normalizeId(page.id)}`);
      const blocks = await notionChildren(token, page.id);
      const markdown = await renderApiBlocks(blocks, { token, assetDir, slug: page.slug });
      const title = page.title ?? titleFromApiPage(pageMeta);
      const date = isoDate(pageMeta.last_edited_time ?? pageMeta.created_time);
      const overview = summarizeMarkdown(markdown);
      const filePath = join(outputDir, `${page.slug ?? slugify(title, page.id)}.md`);

      if (!dryRun) {
        await writeFile(
          filePath,
          buildPost({
            title,
            date,
            overview,
            categories: page.categories ?? page.category,
            tags: page.tags,
            notionId: page.id,
            notionParent: page.parent?.title,
            notionUrl: notionUrl(page.id),
            markdown,
          }),
          'utf8',
        );
      }

      exported.push({ title, file: filePath });
    } catch (error) {
      skipped.push({ title: page.title, id: page.id, reason: error.message });
    }
  }

  printSummary({ exported, skipped, source: 'official Notion API' });
}

async function discoverConfiguredChildren(config, token) {
  const pages = [];
  for (const parent of config.parents) {
    const children = await discoverApiChildPages(token, parent.id);
    for (const child of children) {
      pages.push({
        ...child,
        parent,
        category: parent.category,
        categories: parent.categories ?? parent.category,
        tags: parent.tags ?? [],
        slug: slugify(child.title, child.id, parent.key),
      });
    }
  }
  return pages;
}

async function discoverApiChildPages(token, parentId) {
  const blocks = await notionChildren(token, parentId);
  const pages = [];
  for (const block of blocks) {
    if (block.type === 'child_page') {
      pages.push({
        id: normalizeId(block.id),
        title: block.child_page?.title ?? 'Untitled',
      });
    }
  }
  return pages;
}

async function syncFromDesktopCache({ outputDir, plannedPages }) {
  const cacheRoot = resolve(String(args.cache ?? DEFAULT_CACHE_ROOT));
  const blocks = loadDesktopCache(cacheRoot);
  const exported = [];
  const skipped = [];

  for (const page of plannedPages) {
    const block = blocks.get(normalizeId(page.id));
    if (!block) {
      skipped.push({ title: page.title, id: page.id, reason: 'not found in Notion desktop cache' });
      continue;
    }

    const missing = findMissingDescendants(block, blocks);
    if (missing.length && !allowPartial) {
      skipped.push({
        title: page.title,
        id: page.id,
        reason: `${missing.length} child blocks missing from desktop cache`,
      });
      continue;
    }

    const markdown = renderCachePage(block, blocks);
    const title = cleanTitle(page.title ?? richTextToMarkdown(block.properties?.title) ?? 'Untitled');
    const date = isoDate(block.last_edited_time ?? block.created_time);
    const overview = summarizeMarkdown(markdown);
    const filePath = join(outputDir, `${page.slug ?? slugify(title, page.id)}.md`);

    if (!dryRun) {
      await writeFile(
        filePath,
        buildPost({
          title,
          date,
          overview,
          categories: page.categories ?? page.category,
          tags: page.tags,
          notionId: page.id,
          notionParent: page.parent?.title,
          notionUrl: notionUrl(page.id),
          markdown,
        }),
        'utf8',
      );
    }

    exported.push({ title, file: filePath });
  }

  printSummary({ exported, skipped, source: 'Notion desktop cache' });
}

function loadDesktopCache(root) {
  if (!existsSync(root)) {
    throw new Error(`Notion desktop cache not found at ${root}`);
  }

  const blocks = new Map();
  walkFiles(root, (filePath) => {
    const stats = statSync(filePath);
    if (stats.size > 30_000_000) return;

    let text;
    try {
      text = readFileSync(filePath, 'utf8');
    } catch {
      return;
    }

    for (const line of text.split(/\n+/)) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('{')) continue;

      try {
        const data = JSON.parse(trimmed);
        for (const [id, record] of Object.entries(data.block ?? {})) {
          const value = record?.value?.value;
          if (value?.id) blocks.set(normalizeId(id), value);
        }
      } catch {
        // Cache files can contain binary-ish fragments; ignore non-JSON lines.
      }
    }
  });

  return blocks;
}

async function syncFromInternalApi({ outputDir, plannedPages }) {
  const session = readNotionWebSession();
  const exported = [];
  const skipped = [];

  for (const page of plannedPages) {
    try {
      if (exported.length || skipped.length) await sleep(internalDelayMs);
      const blocks = await loadInternalPageBlocks(session, page.id);
      const block = blocks.get(normalizeId(page.id));
      if (!block) {
        skipped.push({ title: page.title, id: page.id, reason: 'page not returned by Notion internal API' });
        continue;
      }

      const missing = findMissingDescendants(block, blocks);
      if (missing.length && !allowPartial) {
        skipped.push({
          title: page.title,
          id: page.id,
          reason: `${missing.length} child blocks missing after internal API load`,
        });
        continue;
      }

      const markdown = renderCachePage(block, blocks);
      const title = cleanTitle(page.title ?? richTextToMarkdown(block.properties?.title) ?? 'Untitled');
      const date = isoDate(block.last_edited_time ?? block.created_time);
      const overview = summarizeMarkdown(markdown);
      const filePath = join(outputDir, `${page.slug ?? slugify(title, page.id)}.md`);

      if (!dryRun) {
        await writeFile(
          filePath,
          buildPost({
            title,
            date,
            overview,
            categories: page.categories ?? page.category,
            tags: page.tags,
            notionId: page.id,
            notionParent: page.parent?.title,
            notionUrl: notionUrl(page.id),
            markdown,
          }),
          'utf8',
        );
      }

      exported.push({ title, file: filePath });
    } catch (error) {
      skipped.push({ title: page.title, id: page.id, reason: error.message });
    }
  }

  printSummary({ exported, skipped, source: 'Notion internal web API' });
}

function readNotionWebSession() {
  const cookieDb = resolve(
    String(
      args['cookie-db'] ??
        join(process.env.HOME ?? '', 'Library/Application Support/Notion/Partitions/notion/Cookies'),
    ),
  );

  if (!existsSync(cookieDb)) {
    throw new Error(`Notion cookie database not found at ${cookieDb}`);
  }

  const safeStoragePassword = execFileSync(
    'security',
    ['find-generic-password', '-s', 'Notion Safe Storage', '-a', 'Notion', '-w'],
    { encoding: 'utf8', timeout: 5000 },
  ).trim();

  const token = decryptNotionCookie(cookieDb, safeStoragePassword, 'token_v2');
  const userId = decryptNotionCookie(cookieDb, safeStoragePassword, 'notion_user_id');
  const browserId = decryptNotionCookie(cookieDb, safeStoragePassword, 'notion_browser_id');

  return {
    cookie: `token_v2=${token}; notion_user_id=${userId}; notion_browser_id=${browserId}`,
  };
}

function decryptNotionCookie(cookieDb, safeStoragePassword, name) {
  const hex = execFileSync(
    'sqlite3',
    [
      cookieDb,
      `select hex(encrypted_value) from cookies where host_key='.www.notion.so' and name='${name}' limit 1;`,
    ],
    { encoding: 'utf8' },
  ).trim();

  if (!hex) throw new Error(`Missing Notion cookie: ${name}`);

  const encrypted = Buffer.from(hex, 'hex');
  if (!encrypted.subarray(0, 3).equals(Buffer.from('v10'))) {
    throw new Error(`Unsupported encrypted cookie format for ${name}`);
  }

  const key = crypto.pbkdf2Sync(safeStoragePassword, Buffer.from('saltysalt'), 1003, 16, 'sha1');
  const decipher = crypto.createDecipheriv('aes-128-cbc', key, Buffer.alloc(16, ' '));
  const decrypted = Buffer.concat([decipher.update(encrypted.subarray(3)), decipher.final()]);

  // Chromium stores a SHA-256 host digest before the value in newer cookie DBs.
  return decrypted.length > 32 ? decrypted.subarray(32).toString('utf8') : decrypted.toString('utf8');
}

async function loadInternalPageBlocks(session, pageId) {
  const blocks = new Map();
  let cursor = { stack: [[{ table: 'block', id: normalizeId(pageId), index: 0 }]] };

  for (let chunkNumber = 0; chunkNumber < 50; chunkNumber += 1) {
    const json = await fetchInternalJson({
      cookie: session.cookie,
      body: {
        pageId: normalizeId(pageId),
        limit: 100,
        cursor,
        chunkNumber,
        verticalColumns: false,
      },
    });

    let newBlocks = 0;
    for (const [id, record] of Object.entries(json.recordMap?.block ?? {})) {
      const value = record?.value?.value;
      if (value?.id && !blocks.has(normalizeId(id))) newBlocks += 1;
      if (value?.id) blocks.set(normalizeId(id), value);
    }

    if (!json.cursor || (chunkNumber > 0 && newBlocks === 0)) break;
    cursor = json.cursor;
  }

  return blocks;
}

async function fetchInternalJson({ cookie, body }) {
  let lastError = '';

  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (attempt) await sleep(1000 * attempt);

    const response = await fetch('https://www.notion.so/api/v3/loadPageChunk', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0',
        Cookie: cookie,
      },
      body: JSON.stringify(body),
    });

    const text = await response.text();
    try {
      const json = JSON.parse(text);
      if (!response.ok) throw new Error(json.message ?? `${response.status} ${response.statusText}`);
      return json;
    } catch (error) {
      lastError =
        text.trim().startsWith('<')
          ? `${response.status} ${response.statusText}: Notion returned HTML instead of JSON`
          : error.message;
    }
  }

  throw new Error(lastError || 'Notion internal API request failed');
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function walkFiles(dir, visitor) {
  for (const name of readdirSync(dir)) {
    const filePath = join(dir, name);
    let stats;
    try {
      stats = statSync(filePath);
    } catch {
      continue;
    }

    if (stats.isDirectory()) walkFiles(filePath, visitor);
    if (stats.isFile()) visitor(filePath);
  }
}

function findMissingDescendants(block, blocks, seen = new Set()) {
  if (!block?.content?.length || seen.has(block.id)) return [];
  seen.add(block.id);

  const missing = [];
  for (const childId of block.content) {
    const child = blocks.get(normalizeId(childId));
    if (!child) {
      missing.push(childId);
      continue;
    }

    if (child.type !== 'page') {
      missing.push(...findMissingDescendants(child, blocks, seen));
    }
  }
  return missing;
}

async function renderApiBlocks(blocks, context, depth = 0) {
  const lines = [];
  for (const block of blocks) {
    lines.push(await renderApiBlock(block, context, depth));
  }
  return compactBlankLines(lines.join('\n\n'));
}

async function renderApiBlock(block, context, depth) {
  const type = block.type;
  const data = block[type] ?? {};
  const text = richTextToMarkdown(data.rich_text);
  const children =
    block.has_children && type !== 'child_page'
      ? await renderApiBlocks(await notionChildren(context.token, block.id), context, depth + 1)
      : '';

  if (type === 'paragraph') return joinBlock(text, children);
  if (type === 'heading_1') return `# ${text}`;
  if (type === 'heading_2') return `## ${text}`;
  if (type === 'heading_3') return `### ${text}`;
  if (type === 'quote') return quoteBlock(joinBlock(text, children));
  if (type === 'bulleted_list_item') return `${'  '.repeat(depth)}- ${joinBlock(text, children)}`;
  if (type === 'numbered_list_item') return `${'  '.repeat(depth)}1. ${joinBlock(text, children)}`;
  if (type === 'to_do') return `${'  '.repeat(depth)}- [${data.checked ? 'x' : ' '}] ${joinBlock(text, children)}`;
  if (type === 'code') return fencedCode(data.language, data.rich_text);
  if (type === 'equation') return `$$\n${data.expression ?? ''}\n$$`;
  if (type === 'divider') return '---';
  if (type === 'child_page') return `- [${data.title ?? 'Untitled'}](${notionUrl(block.id)})`;
  if (type === 'image') return renderApiImage(block, context);
  if (type === 'bookmark' || type === 'embed' || type === 'link_preview') return data.url ? `<${data.url}>` : '';
  if (type === 'callout') return quoteBlock(joinBlock(text, children));

  return joinBlock(text, children);
}

async function renderApiImage(block, context) {
  const image = block.image;
  const src = image?.type === 'external' ? image.external?.url : image?.file?.url;
  if (!src) return '';
  const caption = richTextToMarkdown(image.caption) || 'Notion image';
  if (image.type === 'external') return `![${escapeAlt(caption)}](${src})`;

  try {
    const ext = extensionFromUrl(src) || '.png';
    const fileName = `${context.slug}-${block.id.slice(0, 8)}${ext}`;
    const outputPath = join(context.assetDir, fileName);
    if (!dryRun) {
      const response = await fetch(src);
      const buffer = Buffer.from(await response.arrayBuffer());
      await writeFile(outputPath, buffer);
    }
    return `![${escapeAlt(caption)}](/assets/img/notion/${fileName})`;
  } catch {
    return `![${escapeAlt(caption)}](${src})`;
  }
}

function renderCachePage(page, blocks) {
  const lines = [];
  for (const childId of page.content ?? []) {
    const child = blocks.get(normalizeId(childId));
    if (!child) continue;
    lines.push(renderCacheBlock(child, blocks, 0));
  }
  return compactBlankLines(lines.join('\n\n'));
}

function renderCacheBlock(block, blocks, depth) {
  const text = richTextToMarkdown(block.properties?.title);
  const children = (block.content ?? [])
    .map((childId) => blocks.get(normalizeId(childId)))
    .filter(Boolean);

  if (block.type === 'text') return joinBlock(text, renderCacheChildren(children, blocks, depth));
  if (block.type === 'header') return `# ${text}`;
  if (block.type === 'sub_header') return `## ${text}`;
  if (block.type === 'sub_sub_header') return `### ${text}`;
  if (block.type === 'quote') return quoteBlock(joinBlock(text, renderCacheChildren(children, blocks, depth)));
  if (block.type === 'bulleted_list') return `${'  '.repeat(depth)}- ${joinBlock(text, renderCacheChildren(children, blocks, depth + 1))}`;
  if (block.type === 'numbered_list') return `${'  '.repeat(depth)}1. ${joinBlock(text, renderCacheChildren(children, blocks, depth + 1))}`;
  if (block.type === 'to_do') return `${'  '.repeat(depth)}- [${block.properties?.checked ? 'x' : ' '}] ${joinBlock(text, renderCacheChildren(children, blocks, depth + 1))}`;
  if (block.type === 'code') return fencedCode(richTextToPlain(block.properties?.language), block.properties?.title);
  if (block.type === 'equation') return `$$\n${richTextToPlain(block.properties?.title)}\n$$`;
  if (block.type === 'divider') return '---';
  if (block.type === 'page') return `- [${text || 'Untitled'}](${notionUrl(block.id)})`;
  if (block.type === 'image') return renderCacheImage(block);
  if (block.type === 'bookmark' || block.type === 'embed' || block.type === 'tweet') {
    const source = richTextToPlain(block.properties?.source);
    return source ? `<${source}>` : '';
  }
  if (block.type === 'table') return renderCacheTable(block, blocks);
  if (block.type === 'column_list' || block.type === 'column') return renderCacheChildren(children, blocks, depth);

  return joinBlock(text, renderCacheChildren(children, blocks, depth));
}

function renderCacheChildren(children, blocks, depth) {
  return compactBlankLines(children.map((child) => renderCacheBlock(child, blocks, depth)).join('\n\n'));
}

function renderCacheImage(block) {
  const src =
    richTextToPlain(block.properties?.source) ||
    block.format?.display_source ||
    block.format?.source ||
    '';
  if (!src) return '';

  const caption = richTextToMarkdown(block.properties?.caption) || 'Notion image';
  return `![${escapeAlt(caption)}](${src})`;
}

function renderCacheTable(block, blocks) {
  const rows = (block.content ?? [])
    .map((childId) => blocks.get(normalizeId(childId)))
    .filter((child) => child?.type === 'table_row')
    .map((row) => {
      const order = block.format?.table_block_column_order ?? Object.keys(row.properties ?? {});
      return order.map((column) => richTextToMarkdown(row.properties?.[column]) || ' ');
    });

  if (!rows.length) return '';
  const header = rows[0];
  const body = rows.slice(1);
  const separator = header.map(() => '---');
  return [header, separator, ...body].map((row) => `| ${row.join(' | ')} |`).join('\n');
}

function buildPost({ title, date, overview, categories, tags, notionId, notionParent, notionUrl, markdown }) {
  const cleanOverview = cleanPreview(overview);
  return `---\n${yamlLine('title', title)}\n${yamlLine('date', date)}\n${yamlLine('overview', cleanOverview)}\n${yamlLine('description', cleanOverview)}\n${yamlList('tags', tags)}\n${yamlList('categories', normalizeList(categories))}\nmath: true\ntoc: true\nrelatedPosts: true\n---\n\n<!-- notion-sync: ${normalizeId(notionId)} parent=${notionParent ?? ''} url=${notionUrl} -->\n\n${markdown.trim()}\n`;
}

function printSummary({ exported, skipped, source }) {
  console.log(`Notion sync source: ${source}`);
  console.log(`Exported: ${exported.length}`);
  for (const item of exported) console.log(`  + ${item.title} -> ${basename(item.file)}`);
  if (skipped.length) {
    console.log(`Skipped: ${skipped.length}`);
    for (const item of skipped) console.log(`  - ${item.title} (${item.id}): ${item.reason}`);
  }
}

async function readNotionToken() {
  if (process.env.NOTION_API_KEY) return process.env.NOTION_API_KEY.trim();
  if (process.env.NOTION_TOKEN) return process.env.NOTION_TOKEN.trim();

  const tokenPath = join(process.env.HOME ?? '', '.config/notion/api_key');
  if (!existsSync(tokenPath)) return '';
  return (await readFile(tokenPath, 'utf8')).trim();
}

async function notionRequest(token, path, options = {}) {
  const response = await fetch(`https://api.notion.com/v1${path}`, {
    method: options.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': process.env.NOTION_VERSION ?? '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const json = await response.json();
  if (!response.ok) {
    throw new Error(json.message ?? `${response.status} ${response.statusText}`);
  }
  return json;
}

async function notionChildren(token, blockId) {
  const blocks = [];
  let cursor;
  do {
    const query = new URLSearchParams({ page_size: '100' });
    if (cursor) query.set('start_cursor', cursor);
    const page = await notionRequest(token, `/blocks/${normalizeId(blockId)}/children?${query.toString()}`);
    blocks.push(...(page.results ?? []));
    cursor = page.has_more ? page.next_cursor : undefined;
  } while (cursor);
  return blocks;
}

function titleFromApiPage(page) {
  for (const value of Object.values(page.properties ?? {})) {
    if (value?.type === 'title') return richTextToMarkdown(value.title);
  }
  return 'Untitled';
}

function richTextToMarkdown(value) {
  if (!Array.isArray(value)) return '';
  return value
    .map((part) => {
      if (typeof part === 'string') return part;
      if (Array.isArray(part)) return formatLegacyRichTextPart(part);
      if (part.type === 'equation') return `$${part.equation?.expression ?? ''}$`;

      let text = part.plain_text ?? '';
      const annotations = part.annotations ?? {};
      if (part.href) text = `[${text}](${part.href})`;
      if (annotations.code) text = `\`${text}\``;
      if (annotations.bold) text = `**${text}**`;
      if (annotations.italic) text = `*${text}*`;
      if (annotations.strikethrough) text = `~~${text}~~`;
      return text;
    })
    .join('');
}

function formatLegacyRichTextPart(part) {
  let text = String(part[0] ?? '');
  const marks = Array.isArray(part[1]) ? part[1] : [];
  for (const mark of marks) {
    const kind = Array.isArray(mark) ? mark[0] : mark;
    const value = Array.isArray(mark) ? mark[1] : undefined;
    if (kind === 'a' && value) text = `[${text}](${value})`;
    if (kind === 'c') text = `\`${text}\``;
    if (kind === 'b') text = `**${text}**`;
    if (kind === 'i') text = `*${text}*`;
    if (kind === 's') text = `~~${text}~~`;
  }
  return text;
}

function richTextToPlain(value) {
  return richTextToMarkdown(value)
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_~`]/g, '');
}

function fencedCode(language, richText) {
  const text = richTextToPlain(richText);
  const lang = normalizeLanguage(language);
  return `\`\`\`${lang}\n${text}\n\`\`\``;
}

function normalizeLanguage(language) {
  const value = String(language ?? '').trim().toLowerCase();
  if (!value || value === 'plain text') return '';
  if (value === 'javascript') return 'js';
  if (value === 'typescript') return 'ts';
  return value.replace(/\s+/g, '-');
}

function joinBlock(text, children) {
  return [text, children].filter((part) => part && part.trim()).join('\n\n');
}

function quoteBlock(text) {
  return text
    .split('\n')
    .map((line) => (line ? `> ${line}` : '>'))
    .join('\n');
}

function compactBlankLines(markdown) {
  return markdown.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function summarizeMarkdown(markdown) {
  const text = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*]\([^)]+\)/g, ' ')
    .split('\n')
    .map((line) => cleanPreviewLine(line))
    .filter((line) => line && !line.startsWith('Source:') && !line.startsWith('|'))
    .join(' ')
    .replace(/\s+/g, ' ');

  return cleanPreview(text) || 'A synced Notion note.';
}

function cleanPreviewLine(line) {
  return String(line)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^#+\s*/, '')
    .replace(/^[-*>0-9. [\]x]+/, '')
    .replace(/\[([^\]]+)]\([^)]+\)/g, '$1')
    .replace(/[*_~`$]/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanPreview(value) {
  const text = String(value ?? '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.!?;:，。！？；：])/g, '$1')
    .trim();

  return text.length > 180 ? `${text.slice(0, 177).trim()}...` : text;
}

function normalizeList(value) {
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
}

function isoDate(value) {
  const date = typeof value === 'number' ? new Date(value) : new Date(value ?? Date.now());
  return Number.isNaN(date.getTime()) ? new Date().toISOString().slice(0, 10) : date.toISOString().slice(0, 10);
}

function yamlLine(key, value) {
  return `${key}: ${JSON.stringify(String(value ?? ''))}`;
}

function yamlList(key, values) {
  const list = [...new Set((values ?? []).filter(Boolean))];
  if (!list.length) return `${key}: []`;
  return `${key}:\n${list.map((value) => `  - ${JSON.stringify(String(value))}`).join('\n')}`;
}

function cleanTitle(title) {
  return String(title ?? '').replace(/\*\*/g, '').trim();
}

function escapeAlt(value) {
  return String(value).replace(/]/g, '\\]');
}

function extensionFromUrl(url) {
  try {
    const ext = new URL(url).pathname.match(/\.(png|jpe?g|gif|webp|svg)$/i)?.[0];
    return ext?.toLowerCase() ?? '';
  } catch {
    return '';
  }
}

function normalizeId(id) {
  const hex = String(id ?? '').replace(/[^a-f0-9]/gi, '').toLowerCase();
  if (hex.length !== 32) return String(id ?? '');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function compactId(id) {
  return normalizeId(id).replace(/-/g, '');
}

function notionUrl(id) {
  return `https://app.notion.com/p/${compactId(id)}`;
}

function slugify(title, id, prefix = '') {
  const slug = String(title)
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  const base = slug || [prefix, compactId(id).slice(0, 8)].filter(Boolean).join('-');
  return base.slice(0, 90).replace(/-$/g, '');
}

function parseArgs(argv) {
  const parsed = {};
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue;
    const [key, value] = arg.slice(2).split('=');
    parsed[key] = value ?? true;
  }
  return parsed;
}
