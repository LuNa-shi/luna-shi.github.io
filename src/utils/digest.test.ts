import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildDigestDraft, renderDigestMdx, tweetUrl } from './digest';

describe('digest generation', () => {
  it('builds stable X links and enriches highlights with raw media', async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), 'digest-workspace-'));
    await mkdir(path.join(workspace, 'runs', 'x-recent-2026-07-01'), { recursive: true });
    await mkdir(path.join(workspace, 'briefings'), { recursive: true });

    await writeFile(
      path.join(workspace, 'runs', '2026-07-01-x-3day-merged.json'),
      JSON.stringify({
        since: '2026-06-28',
        count: 2,
        items: [
          {
            id: '2071988145667928442',
            author_handle: 'AndrewYNg',
            author_name: 'Andrew Ng',
            createdAtISO: '2026-06-30T16:04:04+00:00',
            createdAtLocal: '2026-07-01 00:04',
            text: 'Loop engineering connects agentic coding, developer feedback, and external feedback.',
            metrics: {
              likes: 5140,
              retweets: 955,
              replies: 194,
              quotes: 90,
              views: 287327,
              bookmarks: 6472,
            },
            topics: ['ai_agents'],
            watched_priority_base: 'core',
            source_file: 'runs/x-recent-2026-07-01/AndrewYNg.json',
            score: 42,
          },
          {
            id: '2072004190856212902',
            author_handle: 'DrJimFan',
            author_name: 'Jim Fan',
            createdAtISO: '2026-06-30T17:07:49+00:00',
            createdAtLocal: '2026-07-01 01:07',
            text: 'ASPIRE gives robots a self-evolving skills library.',
            metrics: {
              likes: 958,
              retweets: 130,
              replies: 42,
              quotes: 16,
              views: 75004,
              bookmarks: 676,
            },
            topics: ['ai_agents', 'robotics_spatial'],
            watched_priority_base: 'core',
            source_file: 'runs/x-recent-2026-07-01/DrJimFan.json',
            score: 25,
          },
        ],
      }),
    );

    await writeFile(
      path.join(workspace, 'runs', 'x-recent-2026-07-01', 'AndrewYNg.json'),
      JSON.stringify({
        ok: true,
        data: [
          {
            id: '2071988145667928442',
            author: {
              name: 'Andrew Ng',
              screenName: 'AndrewYNg',
              profileImageUrl: 'https://pbs.twimg.com/profile_images/andrew_normal.jpg',
            },
            media: [
              {
                type: 'photo',
                url: 'https://pbs.twimg.com/media/loop-engineering.jpg',
                width: 1200,
                height: 676,
              },
            ],
          },
        ],
      }),
    );

    await writeFile(
      path.join(workspace, 'briefings', '2026-07-01-x-3day-briefing.md'),
      '# 2026-07-01 X 近 3 天综合汇报\n\n## 近 3 天重点\n\n- Agent workflow moved from model calls to loops.\n',
    );

    const draft = await buildDigestDraft({
      newsWorkspace: workspace,
      date: '2026-07-01',
      lang: 'zh',
    });

    expect(tweetUrl('AndrewYNg', '2071988145667928442')).toBe(
      'https://x.com/AndrewYNg/status/2071988145667928442',
    );
    expect(draft.frontmatter.coverage.posts).toBe(2);
    expect(draft.frontmatter.highlightItems[0]).toMatchObject({
      source: '@AndrewYNg',
      url: 'https://x.com/AndrewYNg/status/2071988145667928442',
      image: 'https://pbs.twimg.com/media/loop-engineering.jpg',
    });
    expect(draft.body).toContain('## 近 3 天重点');
  });

  it('renders publishable MDX without leaking local run file paths', async () => {
    const mdx = renderDigestMdx({
      frontmatter: {
        title: 'AI Agents Digest',
        date: '2026-07-01',
        lang: 'zh',
        translationKey: '2026-07-01-ai-agents-x-digest',
        canonicalSlug: '2026-07-01-ai-agents-x-digest',
        summary: 'Agent workflow, robotics, and inference systems were the strongest themes.',
        dateRange: { start: '2026-06-28', end: '2026-07-01' },
        channels: ['x'],
        tags: ['ai-agents'],
        coverage: { accountsTotal: 113, accountsChecked: 109, posts: 414, likes: 0 },
        highlightItems: [
          {
            title: 'Loop engineering',
            source: '@AndrewYNg',
            channel: 'x',
            url: 'https://x.com/AndrewYNg/status/2071988145667928442',
            image: 'https://pbs.twimg.com/media/loop-engineering.jpg',
            imageAlt: 'Andrew Ng loop engineering post image',
            priority: 'core',
            note: 'Connects agentic coding with human and external feedback loops.',
          },
        ],
      },
      body: '## Source Brief\n\nA concise briefing body.',
    });

    expect(mdx).toContain('highlightItems:');
    expect(mdx).toContain('https://x.com/AndrewYNg/status/2071988145667928442');
    expect(mdx).not.toContain('source_file');
    expect(mdx).not.toContain('/Users/');

    const target = path.join(await mkdtemp(path.join(os.tmpdir(), 'digest-mdx-')), 'digest.mdx');
    await writeFile(target, mdx);
    expect(await readFile(target, 'utf8')).toBe(mdx);
  });

  it('removes operational run-report sections from imported source briefings', async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), 'digest-workspace-'));
    await mkdir(path.join(workspace, 'runs'), { recursive: true });
    await mkdir(path.join(workspace, 'briefings'), { recursive: true });

    await writeFile(
      path.join(workspace, 'runs', '2026-07-01-x-3day-merged.json'),
      JSON.stringify({
        since: '2026-06-28',
        count: 1,
        items: [
          {
            id: '2071988145667928442',
            author_handle: 'AndrewYNg',
            author_name: 'Andrew Ng',
            text: 'Loop engineering connects agentic coding, developer feedback, and external feedback.',
            watched_priority_base: 'core',
            score: 42,
          },
        ],
      }),
    );

    await writeFile(
      path.join(workspace, 'briefings', '2026-07-01-x-3day-briefing.md'),
      [
        '# 2026-07-01 X 近 3 天综合汇报',
        '',
        '窗口：2026-06-28 到 2026-07-01。',
        '来源：关注列表，113 个账号。',
        '连接方式：twitter-cli 已认证。',
        '',
        '## 覆盖情况',
        '',
        '- 完整关注列表：113 个账号。',
        '',
        '## 账号分层',
        '',
        'Core: @OpenAI, @AnthropicAI。',
        '',
        '## 近 3 天重点',
        '',
        'Agent workflow moved from one-shot model calls to loops with evaluation.',
        '',
        '## 下次自动化建议',
        '',
        'uv tool run --from twitter-cli twitter user-posts HANDLE -n 10 --json',
      ].join('\n'),
    );

    const draft = await buildDigestDraft({
      newsWorkspace: workspace,
      date: '2026-07-01',
      lang: 'zh',
    });

    expect(draft.body).toContain('## 近 3 天重点');
    expect(draft.body).toContain('Agent workflow moved');
    expect(draft.body).not.toContain('覆盖情况');
    expect(draft.body).not.toContain('账号分层');
    expect(draft.body).not.toContain('下次自动化建议');
    expect(draft.body).not.toContain('连接方式');
    expect(draft.body).not.toContain('twitter-cli');
  });
});
