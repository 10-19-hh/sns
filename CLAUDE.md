# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project state

This is the **publishing-only (퍼블리싱) stage** of an SNS web app defined in `prd.md`. There is no build tool, package manager, framework, or backend wired up yet — it's static HTML/CSS/vanilla JS with hardcoded mock data standing in for Supabase. `prd.md` is the source of truth for intended features, data model, RLS policies, and design tokens; read it before adding or changing a feature so the mock matches the spec.

The PRD's technical section proposes Next.js + TypeScript + Tailwind + Supabase as the eventual stack, but that migration hasn't happened — don't assume those tools exist in this repo.

## Running it

No build step. Serve the directory root and open in a browser:

```bash
python3 -m http.server 8731
# then open http://localhost:8731/index.html
```

Any static file server works since pages use relative paths (`css/style.css`, `js/common.js`) and plain `<a href="other.html">` navigation — there's no router.

There are no tests, linter, or build/typecheck commands in this repo.

## Architecture

**Every page is a standalone HTML file** (`index.html`, `login.html`, `signup.html`, `new.html`, `edit.html`, `post.html`, `profile.html`, `settings.html`) that loads `css/style.css` and `js/common.js`, then has an inline `<script>` block with page-specific logic. There is no module bundler — `js/common.js` attaches everything it exports to a global `window.UI` object, and each page's inline script destructures what it needs from `UI`.

**`js/common.js` is the shared layer** and owns three things:
1. **Mock data**: `USERS` (keyed by username) and `POSTS` (array, each with nested `comments`). `ME = 'minji'` is the hardcoded "logged in" user — ownership checks (`p.user === ME`) gate edit/delete UI throughout. There's no persistence; a page reload resets all state (likes, new comments, deletions) back to the `POSTS` literal.
2. **Chrome rendering**: `renderChrome()` runs on `DOMContentLoaded` and injects the sticky top bar + mobile bottom tab bar into every page, *unless* `document.body.dataset.bare` is set. Set `data-bare="1"` on `<body>` for auth pages (`login.html`, `signup.html`) that shouldn't get the app chrome. Otherwise set `data-page="home|new|post|profile|edit|settings"` on `<body>` — `renderChrome()` reads this to highlight the active tab in the bottom nav.
3. **Shared UI primitives**: feed card rendering (`cardHTML` + `bindCard`, used by both the home feed and the post-detail page), modal/action-sheet/toast helpers (`confirmModal`, `actionSheet`, `toast`), and inline SVG icons (the `I` object) — reused instead of an icon font or asset files.

**Interaction patterns to preserve when extending a page:**
- Double-tap on `.card-media` toggles like with a heart-burst animation (see `bindCard` in `js/common.js`); single click/tap navigates to `post.html?id=...` unless already on the detail page.
- Optimistic UI only — like toggles and comment add/edit/delete mutate the in-memory `POSTS` array and re-render immediately; nothing survives a reload, and there's no rollback-on-failure path since there's no network call to fail.
- Destructive actions (delete post, delete comment) go through `confirmModal`; the post-card overflow menu goes through `actionSheet`.
- Pages read query params via `UI.qs('id')` / `UI.qs('u')` (thin wrapper over `URLSearchParams`) to decide which post/profile to render — e.g. `post.html?id=3`, `profile.html?u=junho`, `edit.html?id=2`.

**Design tokens** (colors, radii, spacing, motion easing) are centralized as CSS custom properties at the top of `css/style.css`, including a `prefers-color-scheme: dark` override block. Reuse existing tokens (`--blue`, `--red`, `--r-card`, `--r-ctrl`, `--ease`, etc.) rather than hardcoding new values — `prd.md` §4.2 documents the intended palette if a token is missing.

Images in mock data are generated via `https://picsum.photos/seed/<seed>/<w>/<h>` (see `img()` helper and `postImg()` in `js/common.js`) — requires network access to render; posts with `seed: null` render as text-only cards instead.

## Korean-language UI

All user-facing copy (labels, validation errors, button text, placeholders) is in Korean. Match this when adding strings — see existing inline validation messages in `login.html`/`signup.html` and empty/error states in `js/common.js` for tone and phrasing conventions.
