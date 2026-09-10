const { chromium } = require('playwright');
const fs = require('node:fs/promises');
const path = require('node:path');

const root = __dirname;
const base = 'http://127.0.0.1:4174/?demo=1';
const errors = [];
const captures = [];

async function ensureFolders() {
  for (const folder of [
    '01-login', '02-library', '03-add-books', '04-friends', '05-search',
    '06-inbox', '07-profile', '08-admin', '09-help', '10-responsive'
  ]) await fs.mkdir(path.join(root, folder), { recursive: true });
}

async function screenshot(page, relativePath, target = null, fullPage = true) {
  const output = path.join(root, relativePath);
  await fs.mkdir(path.dirname(output), { recursive: true });
  if (target) await target.screenshot({ path: output });
  else await page.screenshot({ path: output, fullPage });
  captures.push(relativePath);
}

async function openDemo(browser, reader, viewport) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(`${reader}: ${error.message}`));
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.locator('#demo-user').selectOption(reader);
  await page.getByRole('button', { name: 'Continue with Google' }).click();
  await page.locator('#app-content').waitFor({ state: 'visible', timeout: 30000 });
  await page.addStyleTag({ content: '.firebase-emulator-warning { display: none !important; }' });
  await page.waitForTimeout(900);
  return { context, page };
}

async function openTab(page, name) {
  const desktop = page.locator(`#tab-${name}`);
  const mobile = page.locator(`#tab-mobile-${name}`);
  const target = await desktop.isVisible() ? desktop : mobile;
  await target.click();
  await page.locator(`#view-${name}`).waitFor({ state: 'visible' });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);
}

async function captureLogin(browser) {
  for (const [label, viewport] of [['desktop', { width: 1440, height: 900 }], ['phone', { width: 390, height: 844 }]]) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
    const page = await context.newPage();
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.addStyleTag({ content: '.firebase-emulator-warning { display: none !important; }' });
    await screenshot(page, `01-login/${label}-login.png`, null, true);
    await context.close();
  }
}

async function captureDesktop(browser) {
  const alex = await openDemo(browser, 'alex', { width: 1440, height: 900 });
  const page = alex.page;

  await screenshot(page, '02-library/desktop-alex-library-full.png');
  await screenshot(page, '02-library/reader-profile-and-ticker.png', page.locator('#my-reader-score').locator('..'));
  if (await page.locator('#borrowed-panel').isVisible()) await screenshot(page, '02-library/currently-borrowed.png', page.locator('#borrowed-panel'));
  if (await page.locator('#saved-books-panel').isVisible()) await screenshot(page, '02-library/saved-books.png', page.locator('#saved-books-panel'));

  await openTab(page, 'add');
  await screenshot(page, '03-add-books/desktop-add-page-full.png');
  await screenshot(page, '03-add-books/single-book-form.png', page.locator('#book-form'));
  const bulk = page.locator('#view-add details').first();
  if (await bulk.count()) {
    await bulk.evaluate(element => { element.open = true; element.dispatchEvent(new Event('toggle')); });
    await page.waitForTimeout(250);
    await screenshot(page, '03-add-books/bulk-and-series-entry.png', bulk);
  }
  const helpButton = page.getByRole('button', { name: /How to add a book/i });
  if (await helpButton.count()) {
    await helpButton.click();
    const dialog = page.locator('dialog[open]');
    await dialog.waitFor({ state: 'visible' });
    await screenshot(page, '03-add-books/quick-add-help.png', dialog);
    await dialog.getByRole('button', { name: /Got it/i }).click();
  }

  await openTab(page, 'friends');
  await screenshot(page, '04-friends/desktop-friends-list.png');
  const friendName = page.locator('button[data-action="open-reader-profile"][data-uid="bella"]');
  if (await friendName.count()) {
    await friendName.click();
    await page.locator('#reader-profile-modal:not(.hidden)').waitFor();
    await screenshot(page, '04-friends/friend-profile-before-shelf.png', page.locator('#reader-profile-modal > div'));
    const viewShelf = page.locator('#reader-profile-modal button[data-action="view-shelf"]');
    await viewShelf.click();
    await page.locator('#view-friend-shelf').waitFor({ state: 'visible' });
    await page.waitForTimeout(800);
    await screenshot(page, '04-friends/bella-friend-shelf-full.png');
    const series = page.locator('#friend-shelf-books details').first();
    if (await series.count()) {
      await series.evaluate(element => { element.open = true; });
      await screenshot(page, '04-friends/friend-series-expanded.png', series);
    }
  }

  await openTab(page, 'search');
  await page.locator('#global-search-input').fill('magic tree house 10');
  await page.locator('#global-search-form').press('Enter');
  await page.waitForTimeout(900);
  await screenshot(page, '05-search/desktop-series-number-search.png');
  await page.locator('#global-search-input').fill('magik tree');
  await page.locator('#global-search-form').press('Enter');
  await page.waitForTimeout(900);
  await screenshot(page, '05-search/fuzzy-spelling-search.png');

  await openTab(page, 'inbox');
  await screenshot(page, '06-inbox/desktop-inbox-all.png');
  await page.locator('#inbox-filter').selectOption('borrow');
  await page.waitForTimeout(250);
  await screenshot(page, '06-inbox/borrowing-filter.png', page.locator('#view-inbox'));

  await openTab(page, 'profile');
  await page.waitForTimeout(700);
  await screenshot(page, '07-profile/desktop-profile-full.png');
  const ledger = page.getByText('Reader score ledger', { exact: true }).locator('..');
  if (await ledger.count()) {
    await ledger.evaluate(element => { element.open = true; element.dispatchEvent(new Event('toggle')); });
    await page.waitForTimeout(400);
    await screenshot(page, '07-profile/score-ledger-expanded.png', ledger);
  }
  const history = page.locator('#borrow-history-details');
  if (await history.count()) {
    await history.evaluate(element => { element.open = true; element.dispatchEvent(new Event('toggle')); });
    await page.waitForTimeout(650);
    await screenshot(page, '07-profile/borrowing-history-expanded.png', history);
  }
  const manageCircles = page.getByRole('button', { name: /Manage circles/i });
  if (await manageCircles.count()) {
    await manageCircles.click();
    await page.waitForTimeout(650);
    await screenshot(page, '07-profile/circle-manager.png', page.locator('#circle-manager'));
  }

  await openTab(page, 'admin');
  await page.waitForTimeout(900);
  await screenshot(page, '08-admin/desktop-admin-overview.png');
  const adminSections = page.locator('#admin-dashboard details');
  for (let index = 0; index < await adminSections.count(); index += 1) {
    const section = adminSections.nth(index);
    await section.evaluate(element => { element.open = true; });
    const title = String(await section.locator('summary').innerText()).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 45) || `section-${index + 1}`;
    await page.waitForTimeout(250);
    await screenshot(page, `08-admin/section-${String(index + 1).padStart(2, '0')}-${title}.png`, section);
    await section.evaluate(element => { element.open = false; });
  }

  const helpOpen = page.locator('[data-action="open-help"]').first();
  await helpOpen.click();
  await page.locator('#help-modal:not(.hidden)').waitFor();
  await screenshot(page, '09-help/help-overview.png', page.locator('#help-modal .help-panel'));
  for (const term of ['ISBN', 'borrow', 'return', 'delete']) {
    await page.locator('#help-search').fill(term);
    await page.waitForTimeout(150);
    await screenshot(page, `09-help/help-search-${term.toLowerCase()}.png`, page.locator('#help-modal .help-panel'));
  }
  await page.getByRole('button', { name: 'Close help' }).click();
  await alex.context.close();

  const bella = await openDemo(browser, 'bella', { width: 1440, height: 900 });
  await screenshot(bella.page, '02-library/desktop-bella-large-library-full.png');
  if (await bella.page.locator('#lent-out-panel').isVisible()) await screenshot(bella.page, '02-library/currently-lent-out.png', bella.page.locator('#lent-out-panel'));
  const ownSeries = bella.page.locator('#books-grid details').first();
  if (await ownSeries.count()) {
    await ownSeries.evaluate(element => { element.open = true; });
    await screenshot(bella.page, '02-library/own-series-expanded.png', ownSeries);
  }
  await bella.context.close();
}

async function captureResponsive(browser) {
  for (const [label, viewport] of [
    ['phone-portrait', { width: 390, height: 844 }],
    ['phone-small', { width: 320, height: 640 }],
    ['phone-landscape', { width: 844, height: 390 }]
  ]) {
    const session = await openDemo(browser, 'alex', viewport);
    for (const name of ['library', 'add', 'friends', 'search', 'inbox', 'profile', 'admin']) {
      await openTab(session.page, name);
      await screenshot(session.page, `10-responsive/${label}-${name}.png`, null, false);
    }
    await session.context.close();
  }
}

(async () => {
  await ensureFolders();
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    await captureLogin(browser);
    await captureDesktop(browser);
    await captureResponsive(browser);
  } finally {
    await browser.close();
  }
  await fs.writeFile(path.join(root, 'capture-results.json'), JSON.stringify({ captures, errors }, null, 2));
  if (errors.length) throw new Error(`Browser errors: ${errors.join('; ')}`);
  console.log(`Created ${captures.length} screenshots in ${root}`);
})().catch(error => { console.error(error); process.exitCode = 1; });
