# Browser publication mode

The optional browser worker uses the ordinary Threads website, without a Meta developer app. The owner signs in to **mimiao.crm** manually; cookies live in a dedicated persistent browser profile. Passwords, OTPs, CAPTCHA and account checkpoints are not automated. No private Meta API or session-cookie export is used. Browser choice cannot remove a Meta account or rate restriction.

## Camoufox Profile Manager deployment

The VPS uses `compose.yml:compose.camoufox.yml` with `BROWSER_ENGINE=camoufox`.
Do not combine the Camoufox and Chromium overlays. CPM 0.6.0 is pinned to its
release wheel SHA-256 in `Dockerfile.camoufox`. Its dependencies constrain the
Python Playwright version separately from the Studio TypeScript client.

The manager owns a persistent profile named **Mimiao Threads**. Its immutable ID
is saved in `/data/studio-profile-id`; deletion fails closed rather than selecting
another profile. Other profiles in the manager are never used by Studio.
The initial profile uses Linux to match the VPS and fixed English UI languages.
No proxy rotation, imported browser cookies or automatic login is configured.
The manager initially opens a blank page. When Studio attaches to a blank tab,
it opens Threads before checking the signed-in account. Existing pages, including
login and Meta checkpoints, are preserved for the owner to complete manually.

`deploy/camoufox/studio_bridge.py` adds an authenticated, serialized DOM-command
adapter to CPM. The existing TypeScript publisher still owns account checks,
attachments, the durable send boundary and reconciliation. Commands have bounded
timeouts and are never retried, including on a lost response. Media uploads can
only read the read-only shared media directory. The adapter uses the CPM 0.6.0
session implementation; review and test this contract before upgrading CPM.
Camoufox fills the composer through keyboard selection, deletion and typing to
avoid duplicated text in the rich editor. Exact-text verification remains required
before recording the send boundary or clicking Post.
After sending, confirmation allows up to 20 seconds for rendered post cards to
hydrate. This repeats read-only DOM checks, never the Post click. Exact text,
publication time, a new permalink and all attachments are still required. If no
unique match appears, the attempt stays unknown and reconciliation checks it later.

Set private `CAMOUFOX_STUDIO_KEY` (32+ characters), `CAMOUFOX_OWNER_PASSWORD`
(16+ characters), `CAMOUFOX_SECRET_KEY` (Fernet key), and the existing eight-character
`BROWSER_DESKTOP_PASSWORD` in the VPS `.env`. The panel creates **owner** only once;
changing the environment password does not silently reset an existing account.
Automatic CPM profile backups are explicitly disabled to respect owner preference.
There is no CI or automatic manager upgrade.

Build and start manually:

```sh
docker compose -f compose.yml -f compose.camoufox.yml build api worker camoufox
docker compose -f compose.yml -f compose.camoufox.yml up -d --no-build api worker camoufox
ssh -N -L 6080:127.0.0.1:6080 -L 8000:127.0.0.1:8000 threads@173.242.59.9
```

Open the profile panel at `http://127.0.0.1:8000` and desktop at
`http://127.0.0.1:6080/vnc.html`. Both ports bind only to VPS loopback; use SSH.
The panel has a separate owner password; the worker key never goes to Studio UI.
The Python process, browser and desktop run unprivileged in a dedicated container.
Keep one tab open in the publishing profile and finish login manually. Then use
Studio's **Check login**, review the schedule, and only then remove the global pause.

Rollback selects `compose.yml:compose.browser.yml` and recreates API/worker after
stopping the Camoufox service. The old Chromium volume and new manager volume are
separate and retained. Never run both browser workers on the same publishing queue.

## Local development

Install dependencies and Chromium (`npm ci`, `npx playwright install chromium`). Set `PUBLISHING_MODE=browser` in the local `.env`, keep `LIVE_PUBLISHING=false` initially, and run the normal worker. A dedicated Chromium window opens. Sign in manually, then use **Connections → Check login**. The personal Chrome profile is never reused.

## VPS

Set a separate random eight-character `BROWSER_DESKTOP_PASSWORD` in the private VPS `.env` (VNC's protocol limit; not the Threads password). Build and run:

```sh
docker compose -f compose.yml -f compose.browser.yml up -d --build api worker
```

Use the same two compose files on subsequent manual deployments. The API is unchanged apart from reporting the active transport; the worker image includes Chromium, Xvfb and noVNC. The profile volume persists across restarts. The browser runs as the unprivileged node user. Playwright's default Chromium sandbox setting is used inside the container; the container is not privileged and has no host Docker socket.

Open a tunnel on your own computer:

```sh
ssh -N -L 6080:127.0.0.1:6080 threads@173.242.59.9
```

Visit `http://127.0.0.1:6080/vnc.html`, connect with the desktop password, and sign in to Threads. The HTTP connection is local and the remote leg travels inside SSH. Port 6080 binds only to VPS loopback; port 5900 binds only to container loopback. Do not publish these ports through Caddy/Cloudflare or expose any Chromium debugging port.

After login click **Check login** in the admin. Set `LIVE_PUBLISHING=true` and recreate API/worker to permit sends, then review the queue and remove its global pause. Only explicitly scheduled posts are sent; drafts remain drafts.

## Delivery evidence and recovery

Each attempt pins its transport. The API remains the default for existing deployments. Browser sends share the existing advisory lock, revision claim, text checks, spacing, late-post handling, photos and pause gates.

Before clicking Post, the worker verifies the navigation profile and composer author, fills the exact text, and requires every requested image preview to load. A missing attachment blocks the complete post. The worker stores the visible pre-send permalink set and sending timestamp before the one final click.

A send is confirmed only by a new permalink for the intended account, matching text, a timestamp within the attempt window and at least the expected number of images. The browser records its permalink and timestamp, leaving the numeric API ID empty. A failure after the sending boundary is `unknown`, never retried. Known browser failures before sending engage the global pause. Uncertain results leave that setting untouched: the unresolved sending/unknown record itself prevents later posts, even if pause is removed. Verified reconciliation permits subsequent scheduled posts unless the owner has paused the queue. Posts more than 30 minutes late remain missed; reconciliation does not recover the overdue backlog automatically.

Reconciliation reads the visible profile and the saved attempt evidence, never clicks Post. If the browser cannot establish the outcome, the record stays unknown. The owner must inspect the public profile; there is deliberately no automatic "try again" for ambiguous sends. Only loaded profile cards are examined, so very old/hidden posts may require manual operational reconciliation. A known duplicate visible before sending blocks the post.

Browser state is a timestamped observation, not a promise that a future session will remain valid. Each publication checks identity again. A logged-out browser, a Meta checkpoint, changed UI, upload failure or unavailable desktop requires manual attention.

## Scope and verification

The mode publishes text and 1–20 attached images. It does not replace API insights, discovery, historical imports or replies. Manual analytics remain available. Nothing in this mode removes a Meta restriction or guarantees that browser automation will continue to work after a Threads UI change.

Tests cover transport selection without OAuth, durable sending state, pause at the click boundary, conservative uncertain results, queue blocking, reconciliation and evidence matching. Tests never publish to a real account. DOM selectors were inspected against the visible English Threads UI on 2026-10-20; a real text/photo smoke remains a separate owner-visible action after server login.

References: [persistent browser contexts](https://playwright.dev/docs/api/class-browsertype#browser-type-launch-persistent-context), [Playwright Docker](https://playwright.dev/docs/docker).
