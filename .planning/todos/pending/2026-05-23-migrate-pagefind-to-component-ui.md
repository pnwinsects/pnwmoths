---
created: 2026-05-23T04:59:34.402Z
title: Migrate Pagefind to Component UI
area: ui
files: []
---

## Problem

Pagefind is currently using the Default UI (`pagefind-ui.js`). As of Pagefind 1.5.0, the Component UI is the recommended integration path for new setups. The build warns about this on each run.

## Solution

Replace the Default UI integration with the Component UI, which provides a search modal, improved accessibility, and better customization options. See https://pagefind.app/docs/search-ui/ for migration guidance.
