/**
 * Generate the default share card (public/images/social-card.png).
 *
 * Every page without a photo of its own — the home page, Browse, Identify,
 * Glossary, FAQs, About — points og:image at this file (issue #198). The site's
 * own banner, public/images/header.png, is 1153x78: far too letterboxed for a
 * link preview, so this composes it into the 1200x630 card that Open Graph
 * consumers expect.
 *
 * Like scripts/generate-range-map.ts this is run MANUALLY, not as part of
 * `npm run build` — the output PNG is committed, so the site build stays offline
 * and deterministic. Re-run it only when the banner or the site name changes:
 *
 *   npm run generate:social-card
 *
 * It drives the locally installed Google Chrome via playwright-core (no browser
 * download) and fetches the site's webfonts from Google Fonts, exactly as the
 * live pages do, so the card's typography matches the header it sits under.
 */
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { SITE_NAME } from '../src/_lib/social-meta.ts';

const BANNER_PATH = 'public/images/header.png';
const OUT_PATH = 'public/images/social-card.png';

// 1200x630 is the Open Graph recommendation (1.91:1) and what Bluesky, Slack,
// Discord and Facebook all render without cropping.
const WIDTH = 1200;
const HEIGHT = 630;

// Site palette, from src/styles/theme.css: black banner, cream page background.
const BLACK = '#000000';
const CREAM = '#f3e8ba';

const TAGLINE = 'Moths of Washington · Oregon · Idaho · Montana · British Columbia';

function cardHtml(bannerDataUri: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600&family=Spinnaker&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: ${WIDTH}px;
    height: ${HEIGHT}px;
    background: ${BLACK};
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    overflow: hidden;
  }
  /* The banner is a single row of specimens; two bands frame the wordmark and
     fill the 630px height that one 78px strip cannot. */
  .strip { display: block; width: 100%; }
  .strip--bottom { transform: scaleX(-1); }
  .wordmark {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 28px;
    padding: 0 64px;
    text-align: center;
  }
  h1 {
    font-family: 'Spinnaker', 'Open Sans', sans-serif;
    font-size: 84px;
    font-weight: 400;
    line-height: 1.05;
    letter-spacing: 0.04em;
    color: #ffffff;
  }
  p {
    font-family: 'Open Sans', Verdana, sans-serif;
    font-size: 28px;
    letter-spacing: 0.02em;
    color: ${CREAM};
  }
</style>
</head>
<body>
  <img class="strip" src="${bannerDataUri}" alt="">
  <div class="wordmark">
    <h1>${SITE_NAME}</h1>
    <p>${TAGLINE}</p>
  </div>
  <img class="strip strip--bottom" src="${bannerDataUri}" alt="">
</body>
</html>`;
}

const bannerDataUri = `data:image/png;base64,${readFileSync(BANNER_PATH).toString('base64')}`;

// `channel: 'chrome'` uses the already-installed Google Chrome; playwright-core
// ships no browsers of its own.
const browser = await chromium.launch({ channel: 'chrome' });
try {
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
  await page.setContent(cardHtml(bannerDataUri), { waitUntil: 'networkidle' });
  // Without this the screenshot can land before Spinnaker swaps in and the
  // wordmark renders in the fallback sans-serif. Passed as a string because this
  // project's Node tsconfig has no DOM lib — `document` would not typecheck.
  await page.waitForFunction("document.fonts.status === 'loaded'");
  await page.screenshot({ path: OUT_PATH });
  console.log(`[social-card] Wrote ${OUT_PATH} (${WIDTH}x${HEIGHT})`);
} finally {
  await browser.close();
}
