# Tradera Vinted Filter

A Chrome extension (Manifest V3) that hides product listings from specific clothing brands on **Vinted.se** and **Tradera.com**.

## What It Does

- Lets you build a brand blocklist via the extension popup
- Automatically hides matching listings on Vinted and Tradera as you browse
- Works on SPAs — re-filters after navigation and DOM changes
- Syncs your blocklist across devices via `chrome.storage.sync`
- Shows a badge count of how many listings were hidden on the current page

## Installation

1. Clone or download this repository
2. Open Chrome and go to `chrome://extensions`
3. Enable **Developer mode** (top-right toggle)
4. Click **Load unpacked** and select the repo root directory
5. The extension icon will appear in your toolbar

No build step required — the extension is plain vanilla JS/HTML.

## How It Works

The extension consists of three main files:

| File | Role |
|---|---|
| `content.js` | Injected into Vinted/Tradera pages — observes the DOM and hides listings that match any brand in your blocklist |
| `popup.html` / `popup.js` | Extension popup UI — add, remove, enable/disable brands; toggle per-site filtering |
| `background.js` | Service worker — updates the badge counter showing how many listings are hidden |
| `manifest.json` | MV3 manifest — registers content scripts for `*.vinted.se/*` and `*.tradera.com/*` |

Brand data is stored in `chrome.storage.sync` and read by `content.js` on every page load and URL change.

## Features

- Per-brand enable/disable (pause filtering without removing a brand)
- Per-site toggle (filter Vinted only, Tradera only, or both)
- Sort brand list alphabetically or by date added
- Dark mode
