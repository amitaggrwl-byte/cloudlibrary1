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
    await page.route('https://www.googleapis.com/books/v1/volumes?*',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({items:[{volumeInfo:{title:'Scanned title',authors:['Scan Author'],imageLinks:{thumbnail:'https://example.com/scanned-cover.jpg'},publishedDate:'2018',categories:['Juvenile Fiction']}}]})}));
    await page.route('https://example.com/scanned-cover.jpg',route=>route.fulfill({contentType:'image/gif',body:Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==','base64')}));
    for(const [width,height] of [[1280,900],[390,844],[320,640],[844,390]]) {
      await page.setViewportSize({width,height});
      await page.goto(base);
      assert.equal((await page.locator('#profile-modal button').textContent()).trim(),'Open CloudLibrary','First-profile completion should match the Home landing flow');
      await page.getByRole('button',{name:'Continue with Google'}).click();
      await page.locator('#app-content').waitFor({state:'visible',timeout:30000});
      const viewNames = ['library','shelf','friends','search','inbox'];
      for(const name of viewNames) {
        const nav=page.locator(`#tab-${width<768?'mobile-':''}${name}`);
        await nav.waitFor({state:'visible'});await nav.click();
        await page.waitForTimeout(350);
        const visible=page.locator(name==='add'?'#book-form':`#view-${name}`);
        await visible.waitFor({state:'visible'});
        const dimensions=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
        assert.ok(dimensions.scroll<=dimensions.width+1,`${name} overflows at ${width}`);
        if(name==='library') {
          await page.locator('#my-reader-score').waitFor({state:'visible'});
          assert.equal(await page.locator('#books-grid').isVisible(),false,'The complete shelf should not remain on Home');
          await page.locator('#onboarding-panel [data-onboarding-step="6"]').waitFor({state:'visible'});
          const onboardingTitles=await page.locator('#onboarding-panel [data-onboarding-step] > div > div > p:first-child').allTextContents();
          assert.deepEqual(onboardingTitles,[
            'Add a short introduction','Add your first book','Join a circle',
            'Connect with a reader','Borrow your first book','Lend your first book'
          ],'Getting-started tasks should keep the approved order');
        }
        if(name==='shelf') {
          await page.getByRole('button',{name:'Add books',exact:true}).waitFor({state:'visible'});
          const series=page.locator('#books-grid details.series-stack').first();
          await series.waitFor({state:'visible'});
          assert.equal(await series.getAttribute('open'),'','Own series should be open by default');
          const track=series.locator('.series-carousel-track');
          await track.waitFor({state:'visible'});
          assert.equal(await track.locator('.series-book-slide').count(),2,'Demo series should contain two books');
          assert.equal(await track.locator('img').count(),0,'Books without cover images should not reserve cover space');
          await series.getByRole('button',{name:'Next book in series'}).click();
          await page.waitForTimeout(400);
          assert.ok(await track.evaluate(element=>element.scrollLeft>0),'Series next control should scroll the carousel');
          await series.locator('button[data-action="edit-book"]').first().click();
          await page.locator('#edit-book-modal').waitFor({state:'visible'});
          await page.getByRole('button',{name:'Scan ISBN barcode'}).waitFor({state:'visible'});
          const editLayout=await page.locator('#edit-book-modal > div').evaluate(element=>({client:element.clientWidth,scroll:element.scrollWidth}));
          assert.ok(editLayout.scroll<=editLayout.client+1,`Edit ISBN controls overflow at ${width}`);
          await page.screenshot({path:path.join(out,`${width}-${height}-shelf-edit.png`)});
          if(width===1280) {
            await page.locator('#edit-title').fill('Book #1');
            await page.locator('#edit-author').fill('Unknown author');
            await page.evaluate(()=>{
              window.__realHtml5Qrcode=window.Html5Qrcode;
              window.Html5Qrcode=class { async start(_camera,_options,onSuccess){window.__emitBarcode=onSuccess;} async stop(){} async clear(){} };
            });
            await page.getByRole('button',{name:'Scan ISBN barcode'}).click();
            await page.locator('#scanner-modal').waitFor({state:'visible'});
            const layers=await page.evaluate(()=>({scanner:Number(getComputedStyle(document.getElementById('scanner-modal')).zIndex),edit:Number(getComputedStyle(document.getElementById('edit-book-modal')).zIndex)}));
            assert.ok(layers.scanner>layers.edit,'Scanner should appear above Edit');
            await page.evaluate(()=>window.__emitBarcode('9780141346847'));
            await page.locator('#scanner-modal').waitFor({state:'hidden'});
            assert.equal(await page.locator('#edit-isbn').inputValue(),'9780141346847','Scan should target Edit ISBN');
            assert.equal(await page.locator('#edit-title').inputValue(),'Scanned title','Scan should replace a generated title placeholder');
            assert.equal(await page.locator('#edit-author').inputValue(),'Scan Author','Scan should replace unknown metadata');
            assert.equal(await page.locator('#edit-seriesName').inputValue(),'Magic Tree House','Scan should preserve useful existing metadata');
            assert.equal(await page.locator('#edit-coverUrl').inputValue(),'https://example.com/scanned-cover.jpg','Scanned ISBN should fill a missing cover');
            assert.equal(await page.locator('#isbn').inputValue(),'','Edit scan must not change Add ISBN');
            await page.evaluate(()=>{window.Html5Qrcode=window.__realHtml5Qrcode;delete window.__realHtml5Qrcode;delete window.__emitBarcode;});
          }
          await page.getByRole('button',{name:'Cancel',exact:true}).click();
          await page.getByRole('button',{name:'Add books',exact:true}).click();
          await page.locator('#view-add').waitFor({state:'visible'});
          assert.equal(await page.locator('#tab-shelf').getAttribute('aria-current'),'page','Add should keep My Library selected');
          for(const id of ['isbn','coverUrl']) await page.locator(`#${id}`).waitFor({state:'visible'});
          for(const id of ['title','author','genre','condition','status']) assert.equal(await page.locator(`#${id}`).isVisible(),false,`${id} should not appear in Add step 1`);
          await page.screenshot({path:path.join(out,`${width}-${height}-add-step-1.png`),fullPage:true});
          assert.equal(await page.locator('#isbn').evaluate(element => Boolean(element.closest('details'))),false,'ISBN should stay in the main Add flow');
          assert.equal(await page.locator('#book-form').getByText('Cover photo',{exact:true}).count(),1,'Add form should show one cover section');
          assert.equal(await page.locator('#book-form').getByText(/Fills empty or unknown details/).count(),1,'Add form should explain ISBN autofill');
          assert.equal(await page.locator('#status option[value="Reading"]').textContent(),'Not for lending');
          if(width===1280) {
            await page.locator('#isbn').fill('9780141346847');
            await page.locator('#title').evaluate(element=>{element.value='Book 7';});
            await page.locator('#author').evaluate(element=>{element.value='Unknown';});
            await page.locator('#lookup-isbn').click();
          }
          await page.getByRole('button',{name:'Enter or check details'}).click();
          for(const id of ['title','author','genre','condition','publishedYear']) await page.locator(`#${id}`).waitFor({state:'visible'});
          await page.screenshot({path:path.join(out,`${width}-${height}-add-step-2.png`),fullPage:true});
          if(width===1280) {
            assert.equal(await page.locator('#title').inputValue(),'Scanned title','Add lookup should replace a generated title placeholder');
            assert.equal(await page.locator('#author').inputValue(),'Scan Author','Add lookup should replace unknown metadata');
          }
          await page.locator('#title').fill('A Wizard Test Book');
          await page.locator('#author').fill('Demo Author');
          await page.getByRole('button',{name:'Continue to shelf settings'}).click();
          await page.locator('#status').waitFor({state:'visible'});
          assert.equal(await page.locator('#title').isVisible(),false,'Details should be hidden in shelf-settings step');
          await page.screenshot({path:path.join(out,`${width}-${height}-add-step-3.png`),fullPage:true});
          await page.getByRole('button',{name:'Back to details'}).click();
          await page.locator('#title').waitFor({state:'visible'});
          await page.getByRole('button',{name:'List or series',exact:true}).click();
          await page.locator('#quick-book-lines').waitFor({state:'visible'});
          assert.equal(await page.locator('#book-form').isVisible(),false,'Single-book form should hide in bulk mode');
          await page.screenshot({path:path.join(out,`${width}-${height}-add-bulk.png`),fullPage:true});
          await page.getByRole('button',{name:'One book',exact:true}).click();
          await page.locator('#title').waitFor({state:'visible'});
          await page.getByRole('button',{name:'How to add a book'}).click();
          await page.locator('dialog[open]').waitFor();
          await page.getByRole('button',{name:'Got it',exact:true}).click();
          await page.getByRole('button',{name:'Back to My Library',exact:true}).click();
          await page.locator('#view-shelf').waitFor({state:'visible'});
          await page.getByRole('button',{name:'Add books',exact:true}).click();
          await page.goBack();
          await page.locator('#view-shelf').waitFor({state:'visible'});
          await page.evaluate(()=>{document.getElementById('book-form').reset();localStorage.clear();});
        }
        if(name==='friends') {
          await page.locator('#view-friends button[data-action="view-shelf"]').first().click();
          await page.locator('#view-friend-shelf').waitFor({state:'visible'});
          const friendSeries=page.locator('#friend-shelf-books details.series-stack').first();
          await friendSeries.waitFor({state:'visible'});
          assert.equal(await friendSeries.getAttribute('open'),'','Friend series should be open by default');
          const friendTrack=friendSeries.locator('.series-carousel-track');
          assert.equal(await friendTrack.locator('.series-book-slide').count(),2,'Friend series should contain two books');
          const friendCarouselSize=await friendTrack.evaluate(element=>({client:element.clientWidth,scroll:element.scrollWidth}));
          await friendSeries.getByRole('button',{name:'Next book in series'}).click();
          await page.waitForTimeout(400);
          if(friendCarouselSize.scroll>friendCarouselSize.client+1) assert.ok(await friendTrack.evaluate(element=>element.scrollLeft>0),'Friend series next control should scroll an overflowing carousel');
          else assert.equal(await friendTrack.evaluate(element=>element.scrollLeft),0,'A fully visible friend series should not move');
          const friendDimensions=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
          assert.ok(friendDimensions.scroll<=friendDimensions.width+1,`friend shelf overflows at ${width}`);
          await page.screenshot({path:path.join(out,`${width}-${height}-friend-shelf.png`),fullPage:true});
          await page.locator('#view-friend-shelf button[data-action="back-to-friends"]').click();
          await page.locator('#view-friends').waitFor({state:'visible'});
        }
        if(name==='inbox') {
          const readerLink=page.locator('#inbox-body button[data-action="open-reader-profile"]').first();
          await readerLink.waitFor({state:'visible'});
          await readerLink.click();
          await page.locator('#reader-profile-modal').waitFor({state:'visible'});
          await page.getByRole('button',{name:'Close profile',exact:true}).click();
          const bookLink=page.locator('#inbox-body button[data-action="open-inbox-book"]').first();
          await bookLink.waitFor({state:'visible'});
          await bookLink.click();
          await page.locator('#view-friend-shelf').waitFor({state:'visible'});
          await nav.click();
          await page.locator('#view-inbox').waitFor({state:'visible'});
        }
        await page.screenshot({path:path.join(out,`${width}-${height}-${name}.png`),fullPage:true});
        results.push(`${width}x${height} ${name}`);
      }
      await page.locator('#user-info').click();
      await page.locator('#view-profile').waitFor({state:'visible'});
      await page.locator('#own-profile-page button[data-action="view-my-shelf"]').waitFor({state:'visible'});
      assert.equal(await page.locator('.tab-btn[aria-current="page"]').count(),0,'Profile should not highlight a primary destination');
      await page.screenshot({path:path.join(out,`${width}-${height}-profile.png`),fullPage:true});
      await page.getByRole('button',{name:'Admin tools',exact:true}).click();
      await page.locator('#view-admin').waitFor({state:'visible'});
      assert.equal(await page.locator('.tab-btn[aria-current="page"]').count(),0,'Admin should not highlight a primary destination');
      await page.screenshot({path:path.join(out,`${width}-${height}-admin.png`),fullPage:true});
      await page.getByRole('button',{name:'Back to profile',exact:true}).click();
      await page.locator('#view-profile').waitFor({state:'visible'});
      await page.getByRole('button',{name:'Help and feedback',exact:true}).click();
      await page.locator('#help-search').fill('return');
      assert.ok(await page.locator('#help-results summary').count()>0);
      await page.screenshot({path:path.join(out,`${width}-${height}-help.png`)});
      await page.getByRole('button',{name:'Close help',exact:true}).click();
      if(width===1280) {
        await page.getByRole('button',{name:'Help and feedback',exact:true}).click();
        await page.locator('#help-search').fill('Add a list or a series');
        const bulkHelp=page.locator('#help-results details').filter({hasText:'Add a list or a series'}).first();
        await bulkHelp.locator('summary').click();
        await bulkHelp.getByRole('button',{name:'Open Add books',exact:true}).click();
        await page.locator('#quick-book-lines').waitFor({state:'visible'});
      }
      await page.getByRole('button',{name:'Sign out',exact:true}).click();
      await page.locator('#login-screen').waitFor({state:'visible'});
    }
    assert.deepEqual(errors,[],'Uncaught browser errors');
    console.log(JSON.stringify({passed:results,errors,screenshots:out},null,2));
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
