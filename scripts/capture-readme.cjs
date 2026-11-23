/* Capture the complete application after positive-ion analysis for the README. */
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const {pathToFileURL} = require('node:url');
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.MMF_CHROMIUM_PATH || undefined,
    headless: true, args: ['--no-sandbox']
  });
  try {
    const page = await browser.newPage({viewport: {width: 1280, height: 1100}, deviceScaleFactor: 2});
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.setDefaultTimeout(120000);
    await page.goto(pathToFileURL(path.resolve(__dirname, '../dist/index.html')).href);
    for (const kind of ['features', 'mods']) {
      await page.locator(`#example-${kind}`).click();
      await page.waitForFunction(kind => !document.getElementById(`example-${kind}`).disabled && document.getElementById(`${kind}-info`).textContent.includes('rows'), kind);
    }
    await page.locator('#run').click();
    await page.waitForFunction(() => !document.getElementById('results').hidden);
    assert.equal(await page.locator('#count').innerText(), '16,719');
    assert.equal(await page.locator('#bars .bar-row').count(), 8);
    assert.equal(await page.locator('#hist .bin').count(), 20);
    await page.evaluate(() => document.fonts.ready);
    const destination = path.resolve(__dirname, '../docs/images/results.png');
    fs.mkdirSync(path.dirname(destination), {recursive: true});
    await page.screenshot({path: destination, fullPage: true});
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({screenshot: destination, candidates: 16719, modificationBars: 8, massErrorBins: 20, pageErrors: errors}));
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
