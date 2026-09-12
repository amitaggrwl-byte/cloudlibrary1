// Local visual check for searchable Help content and responsive containment.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

const base = process.env.HELP_AUDIT_URL || 'http://127.0.0.1:4174/';
const out = process.env.AUDIT_OUTPUT || '/tmp/cloudlibrary-help-audit';
const viewports = [[1280, 900], [390, 844], [320, 640], [844, 390]];
const searches = ['shelf name', 'real-life book exchange', 'good borrower', 'delete my account'];

(async () => {
  await fs.mkdir(out, { recursive: true });
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const errors = [];
  const results = [];
  try {
    for (const [width, height] of viewports) {
      const page = await browser.newPage({ viewport: { width, height } });
      page.on('pageerror', error => errors.push(`${width}x${height}: ${error.message}`));
      await page.goto(base, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.CloudHelp && typeof window.CloudHelp.open === 'function');
      await page.evaluate(() => window.CloudHelp.open({ admin: false, navigate: async () => {} }));
      await page.locator('#help-modal').waitFor({ state: 'visible' });

      assert.equal(await page.locator('#help-results h3').getByText('Friends and safety', { exact: true }).count(), 1);
      assert.equal(await page.locator('#help-results h3').getByText('Community etiquette', { exact: true }).count(), 1);
      assert.ok(await page.locator('#help-results details').count() >= 20, 'Expected the complete Help topic set');
      assert.equal(await page.locator('#feedback-form').count(), 1, 'Feedback form should remain available');
      for (const search of searches) {
        await page.locator('#help-search').fill(search);
        assert.ok(await page.locator('#help-results summary').count() >= 1, `No Help result for "${search}"`);
      }
      await page.locator('#help-search').fill('real-life book exchange');
      await page.locator('#help-results summary').click();
      assert.equal(await page.locator('#help-results li').count(), 4, 'Exchange advice should contain four steps');
      if (width === 320) await page.screenshot({ path: path.join(out, `${width}x${height}-exchange-answer.png`) });
      await page.locator('#help-search').fill('');

      const dimensions = await page.evaluate(() => {
        const panel = document.querySelector('.help-panel');
        const rect = panel.getBoundingClientRect();
        return {
          pageWidth: document.documentElement.scrollWidth,
          viewportWidth: innerWidth,
          panelLeft: rect.left,
          panelRight: rect.right,
          panelScrollWidth: panel.scrollWidth,
          panelClientWidth: panel.clientWidth
        };
      });
      assert.ok(dimensions.pageWidth <= dimensions.viewportWidth + 1, 'Page overflows horizontally');
      assert.ok(dimensions.panelLeft >= -1 && dimensions.panelRight <= dimensions.viewportWidth + 1, 'Help panel is outside the viewport');
      assert.ok(dimensions.panelScrollWidth <= dimensions.panelClientWidth + 1, 'Help panel overflows horizontally');

      await page.screenshot({ path: path.join(out, `${width}x${height}-help.png`) });
      results.push(`${width}x${height}`);
      await page.close();
    }
    assert.deepEqual(errors, [], 'Uncaught browser errors');
    console.log(JSON.stringify({ passed: results, errors, screenshots: out }, null, 2));
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
