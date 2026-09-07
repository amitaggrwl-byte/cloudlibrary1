// Local demo only. Requires Playwright on NODE_PATH or in node_modules.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const base = 'http://127.0.0.1:4174/?demo=1';
const out = process.env.AUDIT_OUTPUT || '/tmp/cloudlibrary-ui-audit';
(async()=>{
  await fs.mkdir(out,{recursive:true});
  const browser=await chromium.launch({headless:true,channel:'chrome'});
  const results=[],errors=[];
  try {
    const context=await browser.newContext();
    const page=await context.newPage();
    page.on('pageerror',error=>errors.push(error.message));
    for(const [width,height] of [[1280,900],[390,844],[320,640],[844,390]]) {
      await page.setViewportSize({width,height});
      await page.goto(base);
      await page.getByRole('button',{name:'Continue with Google'}).click();
      await page.locator('#app-content').waitFor({state:'visible',timeout:30000});
      for(const name of ['library','add','friends','search','inbox','profile','admin']) {
        const nav=page.locator(`#tab-${width<768?'mobile-':''}${name}`);
        await nav.waitFor({state:'visible'});await nav.click();
        await page.waitForTimeout(350);
        const visible=page.locator(name==='add'?'#book-form':`#view-${name}`);
        await visible.waitFor({state:'visible'});
        const dimensions=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
        assert.ok(dimensions.scroll<=dimensions.width+1,`${name} overflows at ${width}`);
        if(name==='add') {
          for(const id of ['title','author','isbn','coverUrl','genre','condition','publishedYear','status']) await page.locator(`#${id}`).waitFor({state:'visible'});
          assert.equal(await page.locator('#status option[value="Reading"]').textContent(),'Not for lending');
          await page.getByRole('button',{name:'How to add a book'}).click();
          await page.locator('dialog[open]').waitFor();
          await page.getByRole('button',{name:'Got it',exact:true}).click();
        }
        await page.screenshot({path:path.join(out,`${width}-${height}-${name}.png`),fullPage:true});
        results.push(`${width}x${height} ${name}`);
      }
      await page.getByRole('button',{name:'?',exact:true}).click();
      await page.locator('#help-search').fill('return');
      assert.ok(await page.locator('#help-results summary').count()>0);
      await page.screenshot({path:path.join(out,`${width}-${height}-help.png`)});
      await page.getByRole('button',{name:'Close help',exact:true}).click();
      await page.getByRole('button',{name:'Sign Out',exact:true}).click();
      await page.locator('#login-screen').waitFor({state:'visible'});
    }
    assert.deepEqual(errors,[],'Uncaught browser errors');
    console.log(JSON.stringify({passed:results,errors,screenshots:out},null,2));
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
