# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A Chrome extension (Manifest V3) that hides product listings from specific clothing brands on **Vinted.se** and **Tradera.com**. The extension popup lets users manage a brand blocklist stored in `chrome.storage.sync`.

## Commands

```bash
npm run dev       # Start Vite dev server (for the React scaffold only, not the extension)
npm run build     # Build the React app to dist/
npm run lint      # Run ESLint
```

**Note**: The React/Vite app (`src/`) is an unused Lovable.dev scaffold. The actual extension files are plain JS/HTML at the repo root and do **not** require a build step. Load the extension in Chrome via `chrome://extensions` → "Load unpacked" → select the repo root directory.

## Architecture

This repo has two separate, independent layers:

### 1. Chrome Extension (the real product)

All active extension files live at the **repo root**:

| File | Role |
|---|---|
| `manifest.json` | MV3 manifest; content script targets `*.vinted.se/*` and `*.tradera.com/*` |
| `background.js` | Service worker — manages the badge counter and resets on tab/URL changes |
| `content.js` | Injected into Vinted/Tradera — observes DOM, reads brands from storage, hides matching items |
| `popup.html` + `popup.js` | Extension popup UI (vanilla HTML/CSS/JS) |

### 2. React/Vite Scaffold (`src/`)

Bootstrapped by Lovable.dev; unused for the extension. `src/pages/Index.tsx` is a placeholder. Changes here have no effect on extension behavior.

## Extension Data Flow

```
popup.js  ──writes──▶  chrome.storage.sync  ◀──reads──  content.js
    │                                                          │
    └──sendMessage('brandsUpdated')──────────────────────────▶│ re-filter
    └──sendMessage('siteSettingsUpdated')───────────────────▶ │ re-filter

content.js  ──sendMessage('updateBadgeCount')──▶  background.js  ──▶  badge
```

### `chrome.storage.sync` Schema

```js
{
  excludedBrands: string[],       // all brands added by user
  disabledBrands: string[],       // brands temporarily paused (still in excludedBrands)
  siteSettings: { vinted: boolean, tradera: boolean },
  brandTimestamps: { [brand]: number },  // epoch ms, for "latest added" sort
  sortMethod: 'alphabetical' | 'latest',
  darkMode: boolean,
}
```

Active brands = `excludedBrands.filter(b => !disabledBrands.includes(b))`

## Site-Specific DOM Selectors

These are fragile and the most likely thing to break when Vinted/Tradera update their UI:

**Vinted**
- Item containers: `[data-testid^="grid-item"]`
- Brand text: `.new-item-box__description p[data-testid$="--description-title"]`

**Tradera**
- Item containers: `[id^="item-card-"]`, `.item-card`, `.item-card-new`
- Brand text: `[class*="item-card_title"]`, `.attribute-buttons-list_attribute__ssoUD`, `a.text-truncate-one-line`
- Hiding strategy: walk up the DOM to find a `@container`/`col-*`/`grid-item` ancestor, then set `display: none` on that parent (not the item itself)

## Key Behaviors to Preserve

- Both sites are SPAs; `content.js` watches for URL changes with a `MutationObserver` on `document` and re-runs filtering after a 1-second delay.
- `ensurePageLoaded()` polls for content with up to 15 attempts × 500ms before giving up.
- `sendMessageWithRetry()` retries chrome messaging up to 2 times with exponential backoff to handle the popup/background not being open.
- The badge only shows when the active tab is on a supported site AND the filtered count > 0.
