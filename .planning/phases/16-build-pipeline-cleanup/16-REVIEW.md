---
phase: 16-build-pipeline-cleanup
reviewed: 2026-04-22T00:00:00Z
depth: standard
files_reviewed: 1
files_reviewed_list:
  - scripts/copy-images.js
findings:
  critical: 0
  warning: 1
  info: 1
  total: 2
status: issues_found
---

# Phase 16: Code Review Report

**Reviewed:** 2026-04-22
**Depth:** standard
**Files Reviewed:** 1
**Status:** issues_found

## Summary

`scripts/copy-images.js` is a top-level ES module script that copies binary assets (banner images, theme CSS, Pico CSS, OpenSeadragon nav images) into `_site/` after the eleventy-plugin-vite build wipes the directory. The logic is straightforward and functionally correct. Two issues were found: a warning about missing per-step error context, and an info-level placement of import declarations mid-file.

## Warnings

### WR-01: Bare `await` calls provide no per-step context on failure

**File:** `scripts/copy-images.js:20-42`
**Issue:** All four copy operations (`cp`, `copyFile`, `cp`) are bare `await` calls with no error handling. If any step fails — for example, `node_modules/openseadragon` is absent or `src/images` does not exist — the process throws an unhandled rejection whose stack trace points into Node internals. There is no message indicating which build step failed or what the expected source path was.

For a build script this surfaces as a non-zero exit code (acceptable), but diagnosing the failure requires reading a raw stack trace. A try/catch around each operation, or a helper that rethrows with context, would make failures immediately actionable.

**Fix:**
```js
async function copyStep(label, fn) {
  try {
    await fn();
    console.log(`Copied ${label}`);
  } catch (err) {
    console.error(`Failed to copy ${label}: ${err.message}`);
    process.exit(1);
  }
}

await copyStep('banner: src/images/ -> _site/images/', () =>
  cp(resolve('src/images'), resolve('_site/images'), { recursive: true })
);
// ... repeat for each step
```

## Info

### IN-01: Import declarations placed after executable statements

**File:** `scripts/copy-images.js:30-31`
**Issue:** `import { mkdir, copyFile }` and `import { createRequire }` appear on lines 30-31, after three `await` expressions on lines 20-27. ES module `import` declarations are hoisted and evaluated before any code runs, so this is not a runtime bug. However, placing imports mid-file — interleaved with executable code — is non-idiomatic and misleading. A reader scanning the file sees two `await cp(...)` calls before the `mkdir`/`copyFile` imports appear, implying an ordering that does not actually exist.

**Fix:** Move all imports to the top of the file, grouped with the existing imports on lines 14-15.

```js
import { cp, mkdir, copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
```

---

_Reviewed: 2026-04-22_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
