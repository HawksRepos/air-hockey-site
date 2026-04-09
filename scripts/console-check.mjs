import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}\n${e.stack ?? ''}`));
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(`CONSOLE: ${msg.text()}`);
});
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.waitForTimeout(300);
await page.click('text=Detailed Analysis');
await page.waitForTimeout(800);
console.log(errors.length ? errors.join('\n---\n') : 'no errors');
await browser.close();
