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
