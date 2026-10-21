# Client communication voice

Post writing uses an adapted snapshot of the owner's `client-communication` skill, read on 2026-10-19:

- `C:/Users/1gtag/.codex/skills/client-communication/SKILL.md`
- Its original `references/creative-communications-brief.md`
- Current Mimiao `docs/marketing/OUTREACH_PLAYBOOK.md` in the CRM repository

The original references are unchanged. Full verbatim source snapshots are shipped in `shared/client-communication-sources.ts`, with source names, capture date and SHA-256 of their UTF-8 text. «Голос и знания» shows all three full documents, character counts, and the separate Threads adaptation from `shared/client-voice.ts`. The studio has no runtime filesystem dependency on the skill or CRM. Updating the skill later requires updating these snapshots and their voice version deliberately.

The provider sends all three complete sources, followed by explicit Threads scope instructions and the adaptation, in the system message for `daily-plan` (both selected and alternative text), `variant`, `evergreen` and `reply`. The UI summary is not the model's only input. Existing owner voice/preferences remain additional context. Research summaries and weekly analytics retain their Russian internal format and do not receive these sources. Prices, historical offers, example messages and product claims in the full playbook are explicitly reference material, not current product facts or evidence of real client conversations. Campaign budgets, deliverables and approval workflows are outside the post-writing task. Full sources increase input tokens per writing request; provider usage is recorded as before.

The adaptation keeps natural Ukrainian, respectful «ви», warmth, concise concrete phrasing, restrained contextual irony, factual discipline and cultural sensitivity. It adapts correspondence to public Threads posts, without mandatory greetings, sales pitches or questions on every post. It forbids dash punctuation and numeric ranges written with a hyphen; ordinary spelling such as «будь-який» and URL hyphens remain valid.

After schema validation, generated public text is checked for dash punctuation. A violation records a failed style check and returns `GENERATION_STYLE_INVALID`, so the generated result is not saved as an approved plan, replacement, alternative or reply. Text is not silently rewritten. Tone and factuality still require model judgment and owner review. This change does not rewrite existing posts, change manual editor validation, enable publishing, or send comments. Generation logs include the prompt and style version for traceability.

Provider tests intercept the actual outbound request, verify every source in full on all four writing paths, reject invalid alternatives/replies and preserve internal reports, spelling and URLs. No live model call is needed for these checks.

## Readability and editorial experiments

Version `client-communication-2026-10-21-v3` adds checks to both public fields of `daily-plan`, `variant` and `evergreen`. Replies retain the existing dash check and do not receive post layout constraints; internal reports remain exempt. Posts must retain the educator address at the beginning. Normally use two or three short paragraphs with blank lines. At 140 Unicode codepoints, at least two paragraphs are required; at most four paragraphs and 220 codepoints per paragraph are accepted. A single newline is not a paragraph. CRLF/CR are normalized only for inspection, preserving the original returned text. Literal backslash-n is rejected. Emoji are counted as grapheme clusters, so a profession, family, flag or keycap counts as one; maximum two are accepted. Usually use one appropriate emoji, after the address, and none for sensitive topics. Zero is valid.

Daily plans allow each nonnull supplied trend ID and each exact source URL in at most two posts; duplicate URLs within one post count once. Empty evidence is unlimited. Remaining posts should explore distinct evergreen topics rather than paraphrase the same news. Existing source allowlists, factual checks and duplicate checks still apply. Layout errors return `GENERATION_STYLE_INVALID`, diversity errors `GENERATION_INVALID`; the existing maximum three generation attempts repair feedback before the entire plan is saved atomically. Exhaustion preserves existing posts and revisions. There are no silent rewrites or retroactive bulk changes to queued posts, manual editor behavior, scheduling or publication transport.

The prompt rotates practical tips, explicitly hypothetical situations, real tradeoffs, appropriate humor and confirmed product usefulness, with no mandatory question or sales ending. Existing Russian `reason` records `Приём: ... Гипотеза: ... Смотрим: ...`, including one concrete response metric. Profile visits or follows may be manually observed; no automatic follower attribution or growth guarantee is implied.

The one-product-call limit does not count ordinary educator suggestions using «спробуйте». That word counts when the post is categorized as product or mentions Mimiao/Міміао/CRM; existing conservative URL, registration and profile-link checks remain.

[Meta's Threads educational insights](https://about.fb.com/news/2024/10/find-your-community-with-new-threads-educational-insights/) inform the focus on original content, conversation and appropriate humor. [NN/g's web-reading research](https://www.nngroup.com/articles/how-users-read-on-the-web/) supports concise writing with one idea per paragraph. The numeric layout limits and emoji policy are our editorial experiment, not Meta requirements or proven reach improvements.
