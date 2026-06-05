#!/usr/bin/env node

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const postsDir = join(root, 'src/content/posts');

const rules = [
  { pattern: /^pi-agent-/, tags: ['pi-agent'], categories: ['agents', 'research'] },
  { pattern: /^sutton-rl-/, tags: ['sutton-rl'], categories: ['learning', 'rl'] },
  { pattern: /^crafting-interpreters-/, tags: ['crafting-interpreters'], categories: ['learning', 'systems'] },
  { pattern: /^selfish-gene-/, tags: ['selfish-gene'], categories: ['reading'] },
  { pattern: /^cs336-/, tags: ['cs336'], categories: ['learning', 'systems'] },
  { pattern: /^leibo-/, tags: ['leibo'], categories: ['agents', 'research'] },
  { pattern: /^readings-/, tags: ['readings'], categories: ['reading'] },
];

const readingCategoryOverrides = [
  { pattern: /(life-framework|mas-conference|agent-teams|cc-auto-mode)/, categories: ['reading', 'agents'] },
  { pattern: /(amp|claude-code|compression|heuristic)/, categories: ['reading', 'systems'] },
  { pattern: /(anthropic|yuandong|talk-with)/, categories: ['reading', 'research'] },
];

const curatedTldrs = new Map([
  [
    'crafting-interpreters-chapter-2',
    'This note maps the interpreter pipeline from source text through tokens, parsing, semantic analysis, code generation, and runtime choices.',
  ],
  [
    'crafting-interpreters-chapter-3-lox',
    'Lox is the small language that carries the book: expressive enough for classes, closures, and control flow, but compact enough to implement twice.',
  ],
  [
    'crafting-interpreters-chapter-4-scanning',
    'Scanning is the first hard boundary in an interpreter: raw characters become tokens, and the rest of the language pipeline finally has structure to work with.',
  ],
  [
    'cs336-lecture-1',
    'Modern LM work is easiest to understand by building the stack yourself, because tokenization, data, compute, and evaluation are all leaky engineering choices.',
  ],
  [
    'cs336-lecture-2-resource-accounting',
    'Before training a model, PyTorch tensors, memory, FLOPs, and profiling have to become concrete enough that architecture choices have real resource prices.',
  ],
  [
    'cs336-lecture-3-lm-architecture',
    'LM architecture is a stack of trade-offs across normalization, activations, attention, positional encoding, hyperparameters, stability, and inference cost.',
  ],
  [
    'cs336-lecture-4-moe',
    'MoE scales parameter count through sparse expert routing, but the real work is balancing tokens, capacity, communication cost, and specialization.',
  ],
  [
    'leibo-concordia',
    'Concordia treats LLM agents as situated social actors with memory, roles, and norms, making simulations easier to observe and intervene in than plain chat swarms.',
  ],
  [
    'leibo-manifesto-multi-agent-intelligence',
    'Multi-agent intelligence should study how cooperation, competition, specialization, and shared discoveries create abilities that isolated agents would miss.',
  ],
  [
    'leibo-social-dilemma',
    'Social dilemmas show why individually rational actions can damage group outcomes, and why cooperation depends on payoffs, repetition, reputation, and norms.',
  ],
  [
    'leibo-social-path-human-like-ai',
    'Human-like AI may require populations of agents learning through social interaction, where cooperation and competition generate skills beyond single-agent training.',
  ],
  [
    'pi-agent-containerization-compaction',
    'Coding agents need sandboxed execution, context compaction, and continuation mechanics so long-running work can survive safely across many tool calls.',
  ],
  [
    'readings-amp-automatic-mixed-precision',
    'AMP speeds training and reduces memory by choosing lower precision for safe ops while keeping higher precision where numerical stability matters.',
  ],
  [
    'readings-anthropic-blogs',
    'Long agentic tasks fail when context, tool use, and coordination drift; the useful lesson is to treat context engineering as runtime design.',
  ],
  [
    'readings-building-c-compiler-agent-teams',
    'A practical multi-agent software pipeline can stay simple: split compiler work across coding agents, isolate tasks, and judge progress with integration tests.',
  ],
  [
    'readings-cc-auto-mode-ai-safety',
    'Claude Code auto mode is a permissions problem: useful autonomy needs explicit trust boundaries around repos, commands, domains, and data access.',
  ],
  [
    'readings-claude-code-source',
    'Looking at Claude Code as an OS process exposes the practical substrate of agents: files, permissions, plugins, subprocesses, and tool calls.',
  ],
  [
    'readings-compression-is-all-you-need',
    'Mathematical progress can be viewed as compression when a new abstraction makes many downstream proofs shorter, reusable, or easier to maintain.',
  ],
  [
    'readings-heuristic-learning',
    'Heuristic Learning frames iterative agent work as maintaining a living heuristic system, where patches, rules, and code are compressed into reusable practice.',
  ],
  [
    'readings-life-framework-multi-agent-systems',
    'The LIFE survey reframes LLM multi-agent systems as a lifecycle: build individual capability, integrate collaboration, attribute failures, then evolve the system.',
  ],
  [
    'readings-mas-conference-paper',
    'This page is a ranked reading shortlist for recent MAS papers, prioritizing collaboration structure, topology design, runtime efficiency, and verification.',
  ],
  [
    'readings-talk-with-shunyu-yao',
    'The conversation frames agent research as moving from raw model scaling toward long-horizon tool use, memory, personalization, science, and grounded reliability.',
  ],
  [
    'readings-yuandong-tian',
    'Search quality depends on shaping the action space, not only increasing rollouts; good representations make planning and learning much more effective.',
  ],
  [
    'selfish-gene-chapter-3',
    'The durable unit is not the body but the replicating gene: bodies disappear, while genetic information keeps competing through copying and recombination.',
  ],
  [
    'selfish-gene-chapter-4',
    'Bodies and brains are gene-built action machines: genes set up the machinery, but fast behavior has to be delegated to perception, memory, and decision systems.',
  ],
  [
    'selfish-gene-chapter-5',
    'Aggression is not simply about being harsher; stable strategies depend on injury cost, resource value, opponent behavior, and the wider population mix.',
  ],
  [
    'selfish-gene-chapter-6',
    'Kin selection explains why helping relatives can still serve selfish genes, because the same gene may be preserved through another body.',
  ],
  [
    'selfish-gene-chapter-7',
    'Reproduction is a trade-off between more offspring and better-supported offspring, so restraint can be self-interested rather than species-minded.',
  ],
  [
    'selfish-gene-chapter-8',
    'Parents and children cooperate through shared genes, but their interests are not identical, which makes family care a site of real strategic conflict.',
  ],
  [
    'selfish-gene-chapter-9',
    'Sexual conflict begins with unequal parental investment, pushing males and females toward different strategies around mating, care, loyalty, and display.',
  ],
  [
    'selfish-gene-chapter-10',
    'Group living and apparent altruism can often be read through self-protection, kinship, exploitation, reciprocal exchange, and the costs of being alone.',
  ],
  [
    'selfish-gene-chapter-11-meme',
    'Memes extend the book from genes to culture: ideas, habits, and symbols can also copy, compete, mutate, and reshape human behavior.',
  ],
  [
    'selfish-gene-chapter-12',
    'Repeated interaction changes the logic of selfishness, making cooperation viable when strategies can be nice, retaliatory, forgiving, and non-envious.',
  ],
  [
    'sutton-rl-chapter-5-monte-carlo',
    'Monte Carlo methods learn value from complete sampled episodes, trading model-free simplicity for delayed updates and return variance.',
  ],
  [
    'sutton-rl-chapter-6-td-learning',
    'TD learning updates from partial experience by bootstrapping current value estimates, combining Monte Carlo sampling with dynamic-programming-style updates.',
  ],
  [
    'sutton-rl-day-1-mdp',
    'RL is interaction for long-term reward: policy chooses actions, reward gives feedback, value estimates future return, and Bellman equations connect the pieces.',
  ],
  [
    'sutton-rl-day-2-bandits',
    'Multi-armed bandits isolate the exploration/exploitation problem by removing state transitions and making action-value estimation the center.',
  ],
  [
    'sutton-rl-day-3-dp',
    'Dynamic programming turns known MDP dynamics into iterative policy evaluation and improvement through Bellman updates.',
  ],
]);

const files = (await readdir(postsDir)).filter((file) => file.endsWith('.md') || file.endsWith('.mdx'));
let updated = 0;

for (const file of files) {
  const filePath = join(postsDir, file);
  const source = await readFile(filePath, 'utf8');
  const parsed = parseFrontmatter(source);
  if (!parsed) continue;

  const slug = basename(file).replace(/\.(md|mdx)$/, '');
  const rule = rules.find((candidate) => candidate.pattern.test(slug));
  const override = readingCategoryOverrides.find((candidate) => candidate.pattern.test(slug));
  const overview = buildOverview(slug, parsed.data.title, parsed.body);

  const nextData = {
    ...parsed.data,
    overview: overview || cleanPreview(parsed.data.overview || parsed.data.description) || 'A synced Notion note.',
    description: overview || cleanPreview(parsed.data.overview || parsed.data.description) || 'A synced Notion note.',
    tags: rule?.tags ?? parsed.data.tags ?? [],
    categories: override?.categories ?? rule?.categories ?? parsed.data.categories ?? [],
  };

  const next = `---\n${dumpFrontmatter(nextData)}---\n\n${parsed.body.trim()}\n`;
  if (next !== source) {
    await writeFile(filePath, next, 'utf8');
    updated += 1;
  }
}

console.log(`Updated ${updated} post overview(s).`);

function parseFrontmatter(source) {
  const match = source.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return null;
  return {
    data: yaml.load(match[1]) ?? {},
    body: match[2],
  };
}

function dumpFrontmatter(data) {
  const ordered = {};
  for (const key of [
    'title',
    'date',
    'overview',
    'description',
    'tags',
    'categories',
    'math',
    'toc',
    'relatedPosts',
    'pinned',
    'hidden',
    'draft',
    'image',
  ]) {
    if (data[key] !== undefined) ordered[key] = normalizeValue(data[key]);
  }

  for (const [key, value] of Object.entries(data)) {
    if (!(key in ordered)) ordered[key] = normalizeValue(value);
  }

  return yaml.dump(ordered, {
    lineWidth: 120,
    noRefs: true,
    sortKeys: false,
  });
}

function normalizeValue(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value;
}

function summarizeBody(body) {
  const lines = body
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*]\([^)]+\)/g, ' ')
    .split('\n')
    .filter((line) => !/^#{1,6}\s/.test(line))
    .map(cleanPreviewLine)
    .filter((line) => isUsefulPreviewLine(line));

  return lines.slice(0, 2).join(' ');
}

function buildOverview(slug, title, body) {
  const curated = curatedTldrs.get(slug);
  const detail = curated || extractExplicitTldr(body) || summarizeBody(body) || String(title ?? '').trim();
  return ensureTldr(detail);
}

function extractExplicitTldr(body) {
  const lines = String(body).split('\n');
  const collected = [];
  let capture = false;

  for (const rawLine of lines) {
    const heading = rawLine.match(/^#{1,6}\s+(.*)$/);
    if (heading) {
      const text = heading[1].toLowerCase();
      if (/tl;?dr|takeaway|一句话|核心观点/.test(text)) {
        capture = true;
        continue;
      }
      if (capture) break;
    }

    if (!capture) continue;
    const line = cleanPreviewLine(rawLine);
    if (isUsefulPreviewLine(line)) collected.push(line);
    if (collected.length >= 2) break;
  }

  return collected.join(' ');
}

function cleanPreviewLine(line) {
  return String(line)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^#+\s*/, '')
    .replace(/^[-*>0-9. [\]x]+/, '')
    .replace(/\[([^\]]+)]\([^)]+\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[*_~`$]/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isUsefulPreviewLine(line) {
  if (!line) return false;
  if (line.startsWith('Source:')) return false;
  if (/^(来源|课程页|项目仓库|arxiv|paper[:：]|标签[:：]|原文[:：])/i.test(line)) return false;
  if (line.startsWith('|')) return false;
  if (/^-+$/.test(line)) return false;
  if (line.length < 18) return false;
  if (/^(本文一句话|本章一句话|一句话|为什么重要|takeaway|对应内容|目标：?|阅读定位[:：]?)$/i.test(line)) return false;
  if (/[:：]$/.test(line) && line.length < 34) return false;
  return /[\p{Letter}\p{Script=Han}]/u.test(line);
}

function cleanPreview(value) {
  const text = String(value ?? '')
    .replace(/^(?:Reading note(?: on [^:]+)?|Sutton RL note|CS336 systems note|Crafting Interpreters note|Multi-agent intelligence reading note|Pi agent systems note)[：:]\s*/i, '')
    .replace(/^Note[：:]\s*/i, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.!?;:，。！？；：])/g, '$1')
    .trim();

  return text.length > 180 ? `${text.slice(0, 177).trim()}...` : text;
}

function ensureTldr(value) {
  const text = cleanPreview(value).replace(/^TL;?DR[：:]\s*/i, '').trim();
  return text ? cleanPreview(`TLDR: ${text}`) : 'TLDR: A synced Notion note, kept short for quick scanning.';
}
