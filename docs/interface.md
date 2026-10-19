# Interface contract

The studio uses a warm graphite/amber theme, local Manrope Variable, React, Motion and vanilla CSS. Tokens live in `src/styles/tokens.css`; base, shell, pages, editor, motion and responsive rules have separate files. Pages load on demand. No external font or decorative image requests are required.

The dashboard derives readiness and the next scheduled root post from existing post/settings responses. The 18:00/19:00 rail describes the configured daily cadence, not successful job execution. A queued job is never presented as completed. Account follower growth is not attributed to individual posts. Loading, missing measurements, empty lists and request errors remain distinct. Browser fixtures must never be seeded into production data.

Full motion is the default. `mimiao-motion` in localStorage stores the local calm/full preference; `prefers-reduced-motion` overrides it. Calm mode stops CSS loops and layout movement. Ambient pointer light runs only for a mouse, without React pointer state; intersection/visibility observers pause decoration outside the viewport or in a hidden tab. Form fields do not tilt. Entry motion does not replay on ordinary query polling.

The editor renders in a portal with a focus trap, inert background, scroll lock, Escape dismissal and focus restoration. Its text/photo preview is illustrative: final Threads rendering may differ. Mobile uses the same state and a preview toggle, with actions outside the scrollable body. Photo ordering keeps the existing explicit buttons and save payload. Chart bars expose dates and values on keyboard focus and hover; missing samples do not become zeroes.

`tests/browser_smoke.py` checks real local login and navigation without saving content. `tests/design_browser.py` intercepts all API responses for visual fixtures, rejects writes, and covers four viewport sizes, populated screens, loading/empty/error, preview, photo ordering, keyboard behavior and motion preferences. Screenshots are ignored artifacts under `test-results/`.

Visual references: [Linear's interface refresh](https://linear.app/now/behind-the-latest-design-refresh) for hierarchy and layered surfaces; [Raycast Pro](https://www.raycast.com/pro) for restrained light and depth. The schedule thread is the studio's own visual motif.
