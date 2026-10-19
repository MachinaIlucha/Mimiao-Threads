# Architecture and operational invariants

Single owner, single Threads account. React/Vite frontend, Fastify API, PostgreSQL accessed through Drizzle SQL, pg-boss worker, persistent media, Caddy HTTPS. No dependency on the Mimiao CRM repository. A separate VPS is the intended deployment; no hosting purchase or production deployment is included.

## Trust boundaries

The browser is authenticated by a random HttpOnly session cookie; only its SHA-256 digest is stored. Every mutation requires an allowed Origin and session CSRF token. The owner password is scrypt-hashed. Threads credentials are encrypted with AES-256-GCM; DeepSeek credentials stay in the process environment. HTTP errors deliberately omit provider bodies and secret URLs. Session lifetime is seven days.

Public sources and ideas are untrusted model input, never executable instructions. Model output is validated with Zod, then editorial checks. Only known source URLs may be retained by daily generation. Factual self-assessment is a useful filter, not proof. Owner review, conservative knowledge and reversible editing remain necessary.

Generation requests include the JSON Schema derived from the same Zod validator after the voice instructions. Machine enum values remain untranslated, and empty arrays remain arrays. Responses are still validated without coercion; failed checks record issue paths/codes rather than raw provider output.

Public-copy generation also applies the versioned [client communication voice](client-voice.md) to daily plans, alternative text, evergreen replacements and reply drafts. Dash punctuation is rejected before returning generated copy; internal analytics/research language and existing manual posts remain unchanged. The adapted rules are shipped with the studio, without a runtime dependency on the CRM or local skill files.

Media IDs are server-generated UUIDs. Uploaded rasters are decoded with pixel and byte limits, auto-oriented, resized and re-encoded as JPEG without EXIF. Stored paths are generated internally. Public delivery requires an authenticated session or HMAC bound to ID and expiry; a signed URL is a bearer capability until expiry. No remote image download endpoint is exposed.

## Publication invariants

1. All schedule calculations use IANA `Europe/Kyiv`. UTC is stored in PostgreSQL. Slots are spaced at least90minutes; automated counts are5–8, daytime only.
2. A day has one plan row, and a post has a unique `(plan_day,slot)`. Plan generation is claimed atomically; insertion is one transaction. Failed generations cannot leave partial plans. Owner revisions are not replaced by rerunning the day.
3. Every edit has an expected revision. Scheduling takes a transaction advisory lock to prevent competing reservations. Published, publishing and unknown posts cannot be edited.
4. A publisher takes a PostgreSQL session advisory lock, claims the row by status and revision, and writes an attempt before network publication. The lock must be on a dedicated connection; external calls do not occur within a database transaction.
5. Provider writes are never automatically retried. Ambiguous final-send results become `unknown`. Reconciliation only reads provider state and marks a unique verified result published; it never sends a replacement. Unknown records cannot be placed back into the queue through ordinary editing.
6. Check global pause immediately before the final network call. `LIVE_PUBLISHING` is a second server-level gate. No system can retract a request already accepted by Meta when pause is clicked.
7. A missing/failed attachment blocks the complete post. Text-only fallback is prohibited. Changed-topic posts with photos require owner review.
8. Posts >30minutes late become missed; restart cannot produce a catch-up burst. Actual root-publication time enforces spacing even after delays.
9. Comment replies require an explicit authenticated send endpoint. The worker may discover, classify and draft, but never call send. `sending` is claimed atomically; uncertain replies remain locked. The current implementation conservatively marks even some pre-publish reply failures unknown rather than risking a duplicate.
10. A crash after accepting a provider response but before committing local state remains recoverable by provider reads. Exact outcome may stay unresolved when Meta no longer exposes sufficient evidence; the interface must say so.

## Measurement invariants

Missing is NULL, never zero. API and manual measurements are separate records. Each sample carries actual measurement age. Historical imports are not fabricated24h/72h snapshots. Root posts and owner replies are separate. API follower count belongs to the account; per-post follows/profile visits require manual evidence and cannot be inferred by distributing account growth.

Comparable24h cohorts require measured age24–28hours, API source and root posts. Frequency experiments are balanced by weekday over28days, capped at8posts/day, and gated on sample coverage and meaningful responses. They remain observational: topics, audience and events are confounders. Weekly model suggestions are explanatory feedback, not statistically proven causal effects or automatically imposed bans.

## Jobs and recovery

pg-boss persists queued work and cron schedules in PostgreSQL. Each job type uses singleton concurrency. Core publication idempotency lives in application tables, independent of queue delivery guarantees. Worker heartbeat is every30seconds. API requests enqueue expensive work and return promptly. Provider reads have bounded timeout/retry; writes have one attempt.

Daily generation may retry on worker maintenance after a failure, with a30minute delay and at most3automatic attempts per day. Startup marks stale generating plans failed after35minutes; manual retry remains possible. Research completeness is explicitly limited by API access and search index coverage. Advanced public discovery must be confirmed by deployment configuration and a successful capability probe.

Backups are intentionally not provided at the owner’s request. PostgreSQL and media use persistent Docker volumes; there is no backup daemon, schedule, archive storage, or restore command.

## Verification boundaries

Unit tests cover Kyiv DST, spacing, experiment balancing, editorial duplication and missing metrics. PostgreSQL integration tests use Fastify injection and mocked providers to cover authentication/CSRF, image normalization, optimistic concurrency, plan idempotency, publisher locking, pause and uncertain outcomes. Browser smoke checks login, eight screens, editor and mobile overflow.

These checks do not establish live Meta permissions, successful App Review, real account attribution, DeepSeek factual accuracy, or delivery on a not-yet-provisioned VPS. Those require deployment credentials and observation. No posts are sent as part of automated test suites.
