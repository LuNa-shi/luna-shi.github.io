# Digest Source Policy

## X

- Use the authenticated local `twitter-cli`; do not require the official X API for normal runs.
- Each run should refresh the following snapshot, fetch recent posts for core/high accounts, fetch liked posts for the same window when available, and compare following snapshots for added/removed accounts.
- For posts promoted to highlight cards or detailed sections, collect public reply/comment context and quote-post context when reachable. Use this context for editorial synthesis, not as raw published content.
- Keep raw JSON/YAML in `/Users/luna-mac/Projects/news`. Do not publish full following lists, private run paths, cookies, tokens, or uncurated liked-post dumps.
- Public digest entries may include source handles, public post URLs, public media URLs, and short summaries.

## Future Sources

- Blogs/RSS: prefer feeds first; keep extracted article text in the private workspace and publish only citations plus summary.
- YouTube: use channel RSS or official metadata where possible; publish video title, URL, thumbnail, and curated notes.
- Manual sources: record provenance in the digest body and mark subjective interpretation clearly.

## Verification

- Every linked item in a digest must have a reachable public URL.
- Unverified accusations, leaks, or security claims must be labeled as pending verification.
- If a source fails during collection, record the gap in the private run log and summarize the coverage gap in the digest when it affects interpretation.
