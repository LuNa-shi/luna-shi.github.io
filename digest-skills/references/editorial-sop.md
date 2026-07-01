# Digest Editorial SOP

## Current Flow

1. Maintain watched sources in the private news workspace. Store X following snapshots, priority tiers, raw post runs, liked posts, comment captures, and source failures under `/Users/luna-mac/Projects/news`.
2. Collect the three-day window. For X, fetch recent posts for core/high accounts first, use search fallback for failed accounts, dedupe posts, and keep raw JSON private. Add liked posts when available.
3. Add context for selected core posts. For posts promoted into highlight cards or detailed sections, inspect public replies, quote posts, and high-signal discussion when reachable. Keep comment raw data private and publish only synthesis.
4. Rank candidates with source priority, topic relevance, novelty, evidence quality, engagement, and media. Demote forwarded-only posts, promotional posts without technical detail, repeated launch copy, and claims that cannot be checked.
5. Generate the MDX draft with `yarn digest:generate -- --date YYYY-MM-DD --lang zh`.
6. Rewrite the draft into a public briefing. Remove run logs, coverage dumps, account tier lists, automation commands, local paths, and private collection notes.
7. Verify the digest. Check links, images, frontmatter, no private paths, no run-report sections, and run `yarn build`.

## Public Brief Template

Use this structure unless the user asks for a different format:

```markdown
## 本期判断

- **主题一句话。** 用一到两句说明本期判断。
- **主题一句话。** 用一到两句说明为什么重要。

## 1. Topic Name

### Edited post title

Paragraph 1: source fact. State who posted what, the concrete model/product/paper/tool, and the directly supported claim. Include the link in this paragraph.

Paragraph 2: comment/context take. Synthesize public replies, quote posts, maintainer notes, builder reactions, or credible criticism into one direct view. Explain what the discussion reveals, what is contested, or what practical implication matters.
```

Do not add a trailing "next issue should watch" section unless explicitly requested. The digest should feel complete on its own.

## Per-Post Two-Paragraph Rule

Every important post should usually have two short paragraphs:

1. **Fact paragraph:** What happened. Name the source and artifact. Keep it concrete and auditable.
2. **Take paragraph:** What the reactions or surrounding context imply. Use comments/replies/quotes when available; otherwise use the linked artifact, product docs, paper abstract, or benchmark details. Be concise and direct.

Avoid weak second paragraphs such as generic checklists, "future work to watch," or broad statements that could apply to any model launch. Prefer a sharp claim:

- Good: "评论区的主要分歧不在模型是否更强，而在安全分类器会不会误伤正常 debugging；这说明可用性问题会比 benchmark 分数更快影响开发者口碑。"
- Good: "多个 builder 关注的是 API/terminal 权限和恢复机制，而不是发布文案里的 'agentic'。这说明真实竞争点已经从单次生成质量转到长任务执行可靠性。"
- Weak: "后续需要观察它是否稳定、是否安全、是否有更多评测。"

## Comment Synthesis Rules

- Read comments selectively. Prioritize maintainers, researchers, builders reporting real use, rebuttals, bug reports, clarification from the author, and quote posts adding evidence.
- Ignore low-signal praise, memes, engagement bait, duplicate reactions, and generic complaints.
- Separate facts from comment sentiment. A comment can show concern or reception, but it does not prove a technical claim unless it links evidence.
- Use comments to sharpen the second paragraph, not to lengthen it. One direct sentence is often enough.
- If comments are unavailable or low quality, base the second paragraph on the artifact and say the practical implication directly. Do not mention that comments were unavailable unless the absence itself matters.

## Collection Notes

- For each highlighted X post, try to capture at least: source post, public URL, media, top replies, quote posts, and any author follow-up in the same thread.
- Keep raw comments private. Publish only short synthesis with source links where useful.
- Mark unverified accusations, leaks, and security claims as pending verification.
