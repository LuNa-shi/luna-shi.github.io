#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { buildDigestDraft, renderDigestMdx } from '../../src/utils/digest.ts';

type Lang = 'en' | 'zh';

interface CliOptions {
  date: string;
  lang: Lang;
  newsWorkspace: string;
  siteRoot: string;
  dryRun: boolean;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const draft = await buildDigestDraft({
    newsWorkspace: options.newsWorkspace,
    date: options.date,
    lang: options.lang,
  });
  const mdx = renderDigestMdx(draft);
  const suffix = options.lang === 'zh' ? '-zh' : '';
  const outputDir = path.join(options.siteRoot, 'src', 'content', 'digests');
  const outputPath = path.join(outputDir, `${draft.frontmatter.canonicalSlug}${suffix}.mdx`);

  if (options.dryRun) {
    console.log(mdx);
    return;
  }

  await mkdir(outputDir, { recursive: true });
  await writeFile(outputPath, mdx);
  console.log(`Wrote ${path.relative(options.siteRoot, outputPath)}`);
}

function parseArgs(args: string[]): CliOptions {
  const siteRoot = process.cwd();
  const date = valueFor(args, '--date') ?? new Date().toISOString().slice(0, 10);
  const lang = (valueFor(args, '--lang') ?? 'zh') as Lang;
  if (lang !== 'en' && lang !== 'zh') {
    throw new Error(`Unsupported --lang "${lang}". Use "en" or "zh".`);
  }

  return {
    date,
    lang,
    newsWorkspace:
      valueFor(args, '--news-workspace') ??
      process.env.NEWS_WORKSPACE ??
      path.resolve(siteRoot, '../news'),
    siteRoot: valueFor(args, '--site-root') ?? siteRoot,
    dryRun: args.includes('--dry-run'),
  };
}

function valueFor(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for ${name}`);
  }
  return value;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
