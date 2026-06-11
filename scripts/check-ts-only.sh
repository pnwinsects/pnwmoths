#!/usr/bin/env bash
# scripts/check-ts-only.sh
# MIG-06: Permanent TS-only invariant guard
# Fails if any of the four regression patterns reappear.
set -e
FAIL=0

# Guard 1: No .js source files in converted areas, or at the root eleventy.config.
# Covers scripts/ (incl. scripts/lib via recursion), src/_lib, src/_data,
# src/components, src/types, and root-level eleventy.config.{js,cjs,mjs}.
JS_FILES=$( { find scripts src/_lib src/_data src/components src/types -name "*.js" 2>/dev/null; ls eleventy.config.js eleventy.config.cjs eleventy.config.mjs 2>/dev/null || true; } )
JS_COUNT=$(printf '%s\n' "$JS_FILES" | grep -c . || true)
if [ "$JS_COUNT" -gt 0 ]; then
  echo "FAIL: $JS_COUNT .js source file(s) found in converted areas:"
  printf '%s\n' "$JS_FILES"
  FAIL=1
fi

# Guard 2: No allowJs in any tsconfig
if grep -l "allowJs" tsconfig*.json 2>/dev/null | grep -q .; then
  echo "FAIL: allowJs found in tsconfig(s):"
  grep -l "allowJs" tsconfig*.json 2>/dev/null
  FAIL=1
fi

# Guard 3: No @ts-ignore comments (incl. root eleventy.config.ts)
TS_IGNORE=$(grep -rn "@ts-ignore" scripts/ src/ eleventy.config.ts --include="*.ts" 2>/dev/null | grep -v node_modules || true)
if [ -n "$TS_IGNORE" ]; then
  echo "FAIL: @ts-ignore found:"
  echo "$TS_IGNORE"
  FAIL=1
fi

# Guard 4: No unguarded double-casts in production code (test files and .d.ts are exempt)
DOUBLE_CAST=$(grep -rn "as unknown as" scripts/ src/ eleventy.config.ts --include="*.ts" 2>/dev/null \
  | grep -v node_modules \
  | grep -v "\.test\.ts" \
  | grep -v "\.d\.ts" || true)
if [ -n "$DOUBLE_CAST" ]; then
  echo "FAIL: Unguarded double-casts in production code:"
  echo "$DOUBLE_CAST"
  FAIL=1
fi

if [ "$FAIL" -eq 0 ]; then
  echo "OK: TS-only invariant: 0 .js sources, 0 allowJs, 0 @ts-ignore, 0 unguarded double-casts"
fi
exit "$FAIL"
