# predict-analytics (predictanalytics-news) — project context

This repo is **predictanalytics-news**, the live product: a Polymarket prediction-market
analytics and subscription app (`index.html` at repo root is the single-page app, `api/`
holds serverless functions, `update_news.py` + `.github/workflows/update-news.yml` auto-refresh
news content on a daily cron). Deployed on Vercel, auto-deploys on push to `main`.
Live at `https://predictanalytics-news.vercel.app`.

## Related sites (separate repos, same company)

- **factorysignal** — the content/media brand (magazine), lives in `blog/` in THIS repo,
  served at `/blog/`. See `blog/CLAUDE.md` for its own conventions — it has a distinctly
  different visual identity (Outstanding.kr-inspired) from the main app.
- **factorysignal Holdings** — the parent-company corporate site, a completely separate
  repo/Vercel project (`factorysignal-holdings`), not part of this codebase. Links to both
  this app and the magazine.

## Category system (reused across the whole company, keep colors consistent)

The app defines 5 real content categories with fixed colors (see `index.html`, CSS vars
`--purple`/`--green`/`--yellow`/`--blue`/`--red` and `.cat-politics` etc. around line ~538):

| Category | Color |
|---|---|
| 정치 (politics) | purple `#6c5ce7` |
| 경제 (economy) | green `#0ea968` |
| 암호화폐 (crypto) | amber `#d97706` |
| 스포츠 (sports) | blue `#3b82f6` |
| 세계 (world) | red `#e03040` |

The factorysignal magazine (`blog/`) reuses these exact hex values for its own article
tags/filters, plus adds a 6th category (스타트업/startup, teal `#0d9488`) that only exists
on the magazine side. If either the app or the magazine adds/changes a category color,
update the other for consistency — this was a deliberate cross-brand decision, not a
coincidence.

## $SIGNAL token

Polygon-based utility token, PayPal-only purchase, explicitly non-cashable/non-transferable
by design (VASP/regulatory-avoidance rationale — see `blog/articles/why-signal-token.html`
for the full reasoning). Don't casually change this constraint in copy without flagging it —
it's a deliberate legal-positioning decision, not a product limitation to "fix."

## Git note

Commit author email must match an email on the `minjh8768-al` GitHub account or Vercel may
block the deploy. Global git config should already be set to
`286322874+minjh8768-al@users.noreply.github.com` — check this first if a deploy gets
mysteriously blocked.
