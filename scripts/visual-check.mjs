#!/usr/bin/env node
/**
 * Screenshots the running dev server at several viewport sizes.
 *
 * Usage:
 *   1. Make sure `npm run dev` is running (default port 5173).
 *   2. node scripts/visual-check.mjs
 *
 * Output goes to /tmp/airhockey-visual-check/
 */

import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const URL = process.env.URL ?? 'http://localhost:5173/';
const OUT = '/tmp/airhockey-visual-check';

const VIEWPORTS = [
  { name: '01-tv-1920',     width: 1920, height: 1080 },
  { name: '02-laptop-1440', width: 1440, height: 900 },
  { name: '03-narrow-1024', width: 1024, height: 768 },
  { name: '04-tablet-820',  width: 820,  height: 1180 },
  { name: '05-phone-390',   width: 390,  height: 844 },
];

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const vp of VIEWPORTS) {
      const ctx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 2,
      });
      const page = await ctx.newPage();
      await page.goto(URL, { waitUntil: 'networkidle' });
      // Give Recharts a moment to settle.
      await page.waitForTimeout(400);

      // Initial paint (Mass Sweep tab).
      await page.screenshot({
        path: `${OUT}/${vp.name}-tab1-mass.png`,
        fullPage: false,
      });

      // Step through each presentation tab.
      const TABS = ['Hole Diameter', 'Fan Operating Point', 'Power & Cost'];
      const tabSlugs = ['tab2-hole', 'tab3-fan', 'tab4-power'];
      for (let i = 0; i < TABS.length; i += 1) {
        await page.getByRole('button', { name: TABS[i] }).click();
        await page.waitForTimeout(300);
        await page.screenshot({
          path: `${OUT}/${vp.name}-${tabSlugs[i]}.png`,
          fullPage: false,
        });
      }

      // Detailed view.
      await page.click('text=Detailed Analysis');
      await page.waitForTimeout(400);
      await page.screenshot({
        path: `${OUT}/${vp.name}-detailed.png`,
        fullPage: true,
      });

      console.log(`✓ ${vp.name} (${vp.width}×${vp.height})`);
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
  console.log(`\nScreenshots in ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
