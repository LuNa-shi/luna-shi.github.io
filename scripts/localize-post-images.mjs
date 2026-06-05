#!/usr/bin/env node

import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const postsDir = join(root, 'src/content/posts');
const outputDir = join(root, 'public/assets/img/notion');
const maxWidth = 1200;

let notionSession;
const pageImageCache = new Map();

await mkdir(outputDir, { recursive: true });

const files = (await readdir(postsDir)).filter((file) => file.endsWith('.md') || file.endsWith('.mdx'));
let updatedPosts = 0;
let localizedImages = 0;
const warnings = [];

for (const file of files) {
  const filePath = join(postsDir, file);
  const slug = basename(file).replace(/\.(md|mdx)$/, '');
  const source = await readFile(filePath, 'utf8');
  const notionId = source.match(/<!-- notion-sync:\s*([a-f0-9-]+)/i)?.[1];
  const images = [...source.matchAll(/!\[([^\]]*)]\(([^)]+)\)/g)];
  if (!images.length) continue;

  let next = source;
  let imageIndex = 0;

  for (const match of images) {
    const src = match[2].trim();
    if (shouldSkip(src)) continue;

    imageIndex += 1;
    const outName = `${slug}-${String(imageIndex).padStart(2, '0')}.webp`;
    const outPath = join(outputDir, outName);
    const publicPath = `/assets/img/notion/${outName}`;

    try {
      const buffer = src.startsWith('attachment:')
        ? await fetchNotionAttachment(src, notionId)
        : await fetchImage(src);
      await sharp(buffer)
        .rotate()
        .resize({ width: maxWidth, withoutEnlargement: true })
        .webp({ quality: 78, effort: 5 })
        .toFile(outPath);

      next = next.replace(match[0], `![${match[1]}](${publicPath})`);
      localizedImages += 1;
    } catch (error) {
      warnings.push(`${file}: ${src} (${error.message})`);
    }
  }

  if (next !== source) {
    await writeFile(filePath, next, 'utf8');
    updatedPosts += 1;
  }
}

console.log(`Localized ${localizedImages} image(s) across ${updatedPosts} post(s).`);
for (const warning of warnings) console.warn(`Warning: ${warning}`);
process.exit(0);

function shouldSkip(src) {
  return (
    src.startsWith('/assets/') ||
    src.startsWith('data:') ||
    src.startsWith('#') ||
    src.startsWith('mailto:') ||
    src.startsWith('tel:')
  );
}

async function fetchNotionAttachment(src, notionId) {
  if (!notionId) throw new Error('missing notion-sync page id');
  const session = getNotionSession();
  const images = await getPageImages(notionId);
  const block = images.find((item) => item.source === src || item.displaySource === src);
  if (!block) throw new Error('attachment block not found in Notion page');

  const proxyUrl = new URL(`https://www.notion.so/image/${encodeURIComponent(src)}`);
  proxyUrl.searchParams.set('table', 'block');
  proxyUrl.searchParams.set('id', block.id);
  proxyUrl.searchParams.set('spaceId', block.spaceId);
  proxyUrl.searchParams.set('width', String(maxWidth));
  proxyUrl.searchParams.set('userId', session.userId);
  proxyUrl.searchParams.set('cache', 'v2');

  return fetchImage(proxyUrl.toString(), { Cookie: session.cookie });
}

async function fetchImage(url, headers = {}) {
  const response = await fetch(url, {
    headers: {
      Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      'User-Agent': 'Mozilla/5.0',
      ...headers,
    },
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  try {
    await sharp(buffer).metadata();
  } catch {
    const contentType = response.headers.get('content-type') ?? 'unknown content type';
    throw new Error(`not an image: ${contentType}`);
  }
  return buffer;
}

async function getPageImages(pageId) {
  const normalized = normalizeId(pageId);
  if (pageImageCache.has(normalized)) return pageImageCache.get(normalized);

  const blocks = await loadInternalPageBlocks(normalized);
  const images = [];
  for (const block of blocks.values()) {
    if (block.type !== 'image') continue;
    const source = block.properties?.source?.[0]?.[0] ?? '';
    const displaySource = block.format?.display_source ?? block.format?.source ?? '';
    images.push({
      id: block.id,
      spaceId: block.space_id,
      source,
      displaySource,
    });
  }

  pageImageCache.set(normalized, images);
  return images;
}

async function loadInternalPageBlocks(pageId) {
  const blocks = new Map();
  let cursor = { stack: [[{ table: 'block', id: normalizeId(pageId), index: 0 }]] };

  for (let chunkNumber = 0; chunkNumber < 50; chunkNumber += 1) {
    const json = await fetchInternalJson({
      pageId: normalizeId(pageId),
      limit: 100,
      cursor,
      chunkNumber,
      verticalColumns: false,
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

async function fetchInternalJson(body) {
  const session = getNotionSession();
  const response = await fetch('https://www.notion.so/api/v3/loadPageChunk', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0',
      Cookie: session.cookie,
    },
    body: JSON.stringify(body),
  });
  const json = await response.json();
  if (!response.ok) throw new Error(json.message ?? `${response.status} ${response.statusText}`);
  return json;
}

function getNotionSession() {
  notionSession ??= readNotionWebSession();
  return notionSession;
}

function readNotionWebSession() {
  const cookieDb = resolve(
    join(process.env.HOME ?? '', 'Library/Application Support/Notion/Partitions/notion/Cookies'),
  );
  const safeStoragePassword = execFileSync(
    'security',
    ['find-generic-password', '-s', 'Notion Safe Storage', '-a', 'Notion', '-w'],
    { encoding: 'utf8', timeout: 5000 },
  ).trim();

  const token = decryptNotionCookie(cookieDb, safeStoragePassword, 'token_v2');
  const userId = decryptNotionCookie(cookieDb, safeStoragePassword, 'notion_user_id');
  const browserId = decryptNotionCookie(cookieDb, safeStoragePassword, 'notion_browser_id');

  return {
    userId,
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
  const key = crypto.pbkdf2Sync(safeStoragePassword, Buffer.from('saltysalt'), 1003, 16, 'sha1');
  const decipher = crypto.createDecipheriv('aes-128-cbc', key, Buffer.alloc(16, ' '));
  const decrypted = Buffer.concat([decipher.update(encrypted.subarray(3)), decipher.final()]);
  return decrypted.length > 32 ? decrypted.subarray(32).toString('utf8') : decrypted.toString('utf8');
}

function normalizeId(id) {
  const compact = String(id ?? '').replace(/-/g, '').trim();
  if (compact.length !== 32) return compact;
  return `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(
    16,
    20,
  )}-${compact.slice(20)}`;
}
