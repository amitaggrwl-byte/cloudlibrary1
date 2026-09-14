// Local demo only. Requires Playwright on NODE_PATH or in node_modules.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const base = 'http://127.0.0.1:4174/?demo=1';
const out = process.env.AUDIT_OUTPUT || '/tmp/cloudlibrary-ui-audit';
const editableSelector = 'input:not([type]):not([readonly]):not([disabled]),input[type="text"]:not([readonly]):not([disabled]),input[type="search"]:not([readonly]):not([disabled]),input[type="email"]:not([readonly]):not([disabled]),input[type="url"]:not([readonly]):not([disabled]),input[type="tel"]:not([readonly]):not([disabled]),input[type="password"]:not([readonly]):not([disabled]),input[type="number"]:not([readonly]):not([disabled]),textarea:not([readonly]):not([disabled]),select:not([disabled])';
(async()=>{
  await fs.mkdir(out,{recursive:true});
  const browser=await chromium.launch({headless:true,channel:'chrome'});
  const results=[],errors=[];
  try {
    const context=await browser.newContext();
    const page=await context.newPage();
    await page.addInitScript(() => {
      const draft = JSON.stringify({description:'Saved for the signed-in reader'});
      localStorage.setItem('cloudlibrary-book-draft-v1', draft);
      localStorage.setItem('cloudlibrary-book-draft-v2:alex', draft);
    });
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('https://www.googleapis.com/books/v1/volumes?*',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({items:[{volumeInfo:{title:'Scanned title',authors:['Scan Author'],imageLinks:{thumbnail:'https://example.com/scanned-cover.jpg'},publishedDate:'2018',categories:['Juvenile Fiction']}}]})}));
    await page.route('https://example.com/scanned-cover.jpg',route=>route.fulfill({contentType:'image/gif',body:Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==','base64')}));
    await page.route('https://covers.openlibrary.org/**',route=>route.fulfill({contentType:'image/gif',body:Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==','base64')}));
    for(const [width,height] of [[1280,900],[390,844],[320,640],[844,390]]) {
      await page.setViewportSize({width,height});
      await page.goto(base);
      assert.equal((await page.locator('#login-copy').textContent()).trim(),'Some books are better borrowed than bought.','Login copy should stay concise and reuse the approved message');
      assert.equal((await page.locator('#profile-modal button').textContent()).trim(),'Open CloudLibrary','First-profile completion should match the Home landing flow');
      assert.equal(await page.getByText('Your unfinished book entry was restored.',{exact:true}).count(),0,'A book draft must not be announced before sign-in');
      await page.getByRole('button',{name:'Continue with Google'}).click();
      await page.locator('#app-content').waitFor({state:'visible',timeout:30000});
      await page.getByText('Your unfinished book entry was restored.',{exact:true}).waitFor({state:'visible'});
      assert.equal(await page.locator('#description').inputValue(),'Saved for the signed-in reader','Only the signed-in reader draft should be restored');
      if(width<900) {
        const undersized=await page.locator(editableSelector).evaluateAll(elements=>elements.filter(element=>Number.parseFloat(getComputedStyle(element).fontSize)<16).map(element=>element.id || element.getAttribute('aria-label') || element.tagName));
        assert.deepEqual(undersized,[],`Editable controls below 16px at ${width}x${height}`);
      }
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
          await page.getByRole('button',{name:'Edit reader profile',exact:true}).waitFor({state:'visible'});
          assert.equal((await page.locator('#brand-tagline').textContent()).trim(),'Est. by readers, kept by friends','Header should retain the compact brand signature');
          assert.equal(await page.locator('#books-grid').isVisible(),false,'The complete shelf should not remain on Home');
          await page.locator('#onboarding-panel [data-onboarding-step="6"]').waitFor({state:'visible'});
          const onboardingTitles=await page.locator('#onboarding-panel [data-onboarding-title]').allTextContents();
          assert.deepEqual([...onboardingTitles].sort(),[
            'Add a short introduction','Add your first book','Join a circle',
            'Connect with a reader','Borrow your first book','Lend your first book'
          ].sort(),'Getting-started should retain all approved tasks');
          assert.equal(await page.locator('#onboarding-panel [data-onboarding-done="false"]').count(),1,'Only unfinished tasks should remain expanded');
          const completedTasks=page.locator('#onboarding-panel [data-onboarding-completed]');
          assert.equal(await completedTasks.getAttribute('open'),null,'Completed tasks should be collapsed by default');
          assert.equal(await page.locator('#onboarding-panel [data-onboarding-done="true"]').first().isVisible(),false,'Completed task details should stay hidden until requested');
          const setupTasks=page.locator('#library-attention-list [data-attention-setup-task]');
          await setupTasks.first().waitFor({state:'visible'});
          assert.ok(await setupTasks.count()<=2,'Today should show no more than two unfinished setup tasks');
          assert.equal(await setupTasks.last().getAttribute('data-attention-setup-task'),'onboarding-lend-book','Today should include the next unfinished reader task');
          await page.locator('#home-reader-suggestions [data-suggested-reader="dev"]').waitFor({state:'visible'});
          assert.equal(await page.locator('#home-reader-suggestions [data-suggested-reader="bella"]').count(),0,'Existing friends should not be suggested');
          assert.equal(await page.locator('#home-reader-suggestions [data-suggested-reader="carlos"]').count(),0,'Pending connections should not be suggested');
          if(width===1280) {
            const tickerMarkup=await page.evaluate(()=>({
              book:tickerItemHtml({type:'book-suggestion',title:'Cover test',coverUrl:'https://covers.openlibrary.org/b/olid/OL24381783M-M.jpg'}),
              reader:tickerItemHtml({type:'reader-suggestion',actorId:'dev',actorName:'DevReads',actorPhotoURL:'https://example.com/reader.jpg',sharedCircles:['HXLS']}),
              circle:tickerItemHtml({type:'circle-suggestion',name:'Adventure Readers',category:'Club'})
            }));
            assert.match(tickerMarkup.book,/covers\.openlibrary\.org/,'Book ticker items should render their cover when present');
            assert.match(tickerMarkup.reader,/reader\.jpg/,'Reader ticker items should render their profile photo when present');
            assert.match(tickerMarkup.circle,/onboarding-join-circle/,'Circle ticker suggestions should open circle management');
            assert.ok(await page.evaluate(()=>tickerItems.some(item=>item.includes('Reader to discover'))),'Ticker should include a cached established-reader suggestion');
            assert.ok(await page.evaluate(()=>tickerItems.some(item=>item.includes('Circle to explore'))),'Ticker should include a joinable circle suggestion');
            const secretGardenTickerItems=await page.evaluate(()=>tickerItems.filter(item=>item.includes('The Secret Garden')));
            assert.equal(secretGardenTickerItems.length,1,'Duplicate activity for one book should collapse into one ticker story');
            assert.match(secretGardenTickerItems[0],/covers\.openlibrary\.org/,'A duplicate cover should be retained on the book ticker story');
            await page.evaluate(()=>{document.getElementById('cloud-ticker-content').innerHTML=tickerItemHtml({type:'book-suggestion',title:'The Secret Garden',coverUrl:'https://covers.openlibrary.org/b/olid/OL24381783M-M.jpg'});});
            await page.locator('#cloud-ticker-content img').waitFor({state:'visible'});
            await page.waitForTimeout(500);
            const tickerSize=await page.locator('#cloud-ticker-card').evaluate(element=>({height:element.getBoundingClientRect().height,imageHeight:element.querySelector('img').getBoundingClientRect().height}));
            assert.ok(tickerSize.imageHeight<=32 && tickerSize.height<=76,'A ticker cover should stay compact');
          }
          if(width<=390) {
            await page.evaluate(()=>{document.getElementById('cloud-ticker-content').innerHTML=tickerItemHtml({type:'book-suggestion',title:'A Wrinkle in Time',coverUrl:'https://covers.openlibrary.org/b/olid/OL24381783M-M.jpg'});});
            const mobileTicker=page.locator('#cloud-ticker-content');
            await mobileTicker.getByRole('button',{name:'A Wrinkle in Time',exact:true}).waitFor({state:'visible'});
            const tickerBounds=await mobileTicker.evaluate(element=>({contentWidth:element.getBoundingClientRect().width,itemWidth:element.firstElementChild.getBoundingClientRect().width,itemHeight:element.firstElementChild.getBoundingClientRect().height,itemScrollHeight:element.firstElementChild.scrollHeight}));
            assert.ok(tickerBounds.itemWidth<=tickerBounds.contentWidth+1,'Mobile ticker story should remain within its content area');
            assert.ok(tickerBounds.itemHeight<=52,'Mobile ticker story should stay within three compact lines');
            assert.ok(tickerBounds.itemScrollHeight<=tickerBounds.itemHeight+1,'Mobile ticker story should not be clipped');
          }
          const longTitle='The Monk Who Sold His Ferrari: A Fable About Fulfilling Your Dreams and Reaching Your Destiny';
          await page.evaluate(title=>{
            const book={id:'long-title-layout-test',title,author:'Robin Sharma',status:'Lent Out',borrowerId:'bella',borrowerName:'BellaBooks',loanDueAt:new Date(Date.now()+86400000)};
            document.getElementById('lent-out-panel').classList.remove('hidden');
            document.getElementById('lent-out-books-grid').innerHTML=renderBookCard(book,ownBookActions(book),null,'owner');
            window.__savedBooksBeforeLayoutTest=savedBooksCache;
            savedBooksCache=[{id:'long-title-saved-test',bookId:'long-title-layout-test',title,author:'Robin Sharma',ownerId:'bella',ownerName:'BellaBooks'}];
            renderSavedBooks();
          },longTitle);
          const lentTitle=page.locator('#lent-out-books-grid .book-card h3').first();
          const lentTitleLayout=await lentTitle.evaluate(element=>({overflow:getComputedStyle(element).overflow,whiteSpace:getComputedStyle(element).whiteSpace,clientHeight:element.clientHeight,scrollHeight:element.scrollHeight,clientWidth:element.clientWidth,scrollWidth:element.scrollWidth}));
          assert.equal(lentTitleLayout.overflow,'visible','Lent-book titles should not be clipped');
          assert.equal(lentTitleLayout.whiteSpace,'normal','Lent-book titles should wrap');
          assert.ok(lentTitleLayout.scrollHeight<=lentTitleLayout.clientHeight+1 && lentTitleLayout.scrollWidth<=lentTitleLayout.clientWidth+1,'A complete lent-book title should fit its card');
          const savedTitle=page.locator('#saved-books-list .saved-book-card [data-action="search-book"]').first();
          await savedTitle.evaluate((element,title)=>{element.textContent=title;},longTitle);
          const savedTitleLayout=await savedTitle.evaluate(element=>({overflow:getComputedStyle(element).overflow,whiteSpace:getComputedStyle(element).whiteSpace,clientHeight:element.clientHeight,scrollHeight:element.scrollHeight,clientWidth:element.clientWidth,scrollWidth:element.scrollWidth}));
          assert.equal(savedTitleLayout.overflow,'visible','Saved-book titles should not be clipped');
          assert.equal(savedTitleLayout.whiteSpace,'normal','Saved-book titles should wrap');
          assert.ok(savedTitleLayout.scrollHeight<=savedTitleLayout.clientHeight+1 && savedTitleLayout.scrollWidth<=savedTitleLayout.clientWidth+1,'A complete saved-book title should fit its card');
          await page.evaluate(()=>{
            renderLentOutBooks(Object.values(activeLoanBooksCache));
            savedBooksCache=window.__savedBooksBeforeLayoutTest;
            delete window.__savedBooksBeforeLayoutTest;
            renderSavedBooks();
          });
        }
        if(name==='shelf') {
          await page.getByRole('button',{name:'Add books',exact:true}).waitFor({state:'visible'});
          const series=page.locator('#books-grid details.series-stack').first();
          await series.waitFor({state:'visible'});
          assert.equal(await series.getAttribute('open'),'','Own series should be open by default');
          const track=series.locator('.series-carousel-track');
          await track.waitFor({state:'visible'});
          assert.equal(await track.locator('.series-book-slide').count(),2,'Demo series should contain two books');
          assert.equal(await track.locator('img').count(),2,'Series books with cover images should render both covers');
          assert.equal(await page.locator('#books-grid [data-book-id="alex-adventure"] img').count(),0,'A book without a cover should not reserve image space');
          await series.getByRole('button',{name:'Next book in series'}).click();
          await page.waitForTimeout(400);
          assert.ok(await track.evaluate(element=>element.scrollLeft>0),'Series next control should scroll the carousel');
          await page.locator('#books-grid [data-book-id="alex-adventure"] button[data-action="edit-book"]').click();
          await page.locator('#edit-book-modal').waitFor({state:'visible'});
          await page.getByRole('button',{name:'Scan ISBN barcode'}).waitFor({state:'visible'});
          assert.ok(Number.parseFloat(await page.locator('#edit-isbn').evaluate(element=>getComputedStyle(element).fontSize))>=(width<900?16:14),'Edit ISBN should use the intended viewport-safe text size');
          const editLayout=await page.locator('#edit-book-modal > div').evaluate(element=>({client:element.clientWidth,scroll:element.scrollWidth}));
          assert.ok(editLayout.scroll<=editLayout.client+1,`Edit ISBN controls overflow at ${width}`);
          await page.screenshot({path:path.join(out,`${width}-${height}-shelf-edit.png`)});
          if(width===1280) {
            await page.locator('#edit-title').fill('Book #1');
            await page.locator('#edit-author').fill('Unknown author');
            await page.locator('#edit-more-details > summary').click();
            await page.locator('#edit-seriesName').fill('Magic Tree House');
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
            assert.notEqual(await page.evaluate(()=>document.activeElement?.id),'edit-isbn','Edit scan should not focus the ISBN field');
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
          assert.ok(Number.parseFloat(await page.locator('#isbn').evaluate(element=>getComputedStyle(element).fontSize))>=(width<900?16:14),'Add ISBN should use the intended viewport-safe text size');
          assert.equal(await page.locator('#book-form').getByText('Cover photo',{exact:true}).count(),1,'Add form should show one cover section');
          assert.equal(await page.locator('#book-form').getByText(/Fills empty or unknown details/).count(),1,'Add form should explain ISBN autofill');
          assert.equal(await page.locator('#status option[value="Reading"]').textContent(),'Not for lending');
          if(width===1280) {
            await page.locator('#title').evaluate(element=>{element.value='Book 7';});
            await page.locator('#author').evaluate(element=>{element.value='Unknown';});
            await page.evaluate(()=>{
              window.__realHtml5Qrcode=window.Html5Qrcode;
              window.Html5Qrcode=class { async start(_camera,_options,onSuccess){window.__emitBarcode=onSuccess;} async stop(){} async clear(){} };
            });
            await page.locator('#start-scan-btn').click();
            await page.locator('#scanner-modal').waitFor({state:'visible'});
            await page.evaluate(()=>window.__emitBarcode('9780141346847'));
            await page.locator('#scanner-modal').waitFor({state:'hidden'});
            await page.locator('#title').waitFor({state:'visible'});
            assert.equal(await page.locator('[data-add-step="2"]').isVisible(),true,'Successful ISBN lookup should advance Add to details');
            assert.ok(!['isbn','title'].includes(await page.evaluate(()=>document.activeElement?.id)),'Add scan should advance without focusing a text field');
            await page.evaluate(()=>{window.Html5Qrcode=window.__realHtml5Qrcode;delete window.__realHtml5Qrcode;delete window.__emitBarcode;});
            const catalogMessages=await page.evaluate(async()=>{
              const originalFetch=window.fetch;
              const stack=document.getElementById('toast-stack');
              const run=async(isbn,fetchImpl)=>{
                stack.replaceChildren();
                document.getElementById('isbn').value=isbn;
                window.fetch=fetchImpl;
                await fillFromISBN();
                return stack.lastElementChild?.textContent || '';
              };
              try {
                const noMatch=await run('9780439023481',async url=>String(url).includes('googleapis.com')
                  ? new Response(JSON.stringify({items:[]}),{status:200,headers:{'Content-Type':'application/json'}})
                  : new Response('',{status:404}));
                const timeout=await run('9780061120084',async()=>{throw new DOMException('Timed out','AbortError');});
                return {noMatch,timeout};
              } finally { window.fetch=originalFetch; }
            });
            assert.equal(catalogMessages.noMatch,'No book matched this ISBN. Select Enter or check details to add it manually, or replace the ISBN and try another book.');
            assert.equal(catalogMessages.timeout,'The book catalogue took too long to respond. Please try again.');
          } else {
            await page.getByRole('button',{name:'Enter or check details'}).click();
          }
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
          const helpLayout=await page.locator('dialog[open]').evaluate(element=>({client:element.clientWidth,scroll:element.scrollWidth}));
          assert.ok(helpLayout.scroll<=helpLayout.client+1,`Add help dialog overflows at ${width}`);
          await page.getByRole('button',{name:'Got it',exact:true}).click();
          await page.getByRole('button',{name:'Back to My Library',exact:true}).click();
          await page.locator('#view-shelf').waitFor({state:'visible'});
          await page.getByRole('button',{name:'Add books',exact:true}).click();
          await page.goBack();
          await page.locator('#view-shelf').waitFor({state:'visible'});
          await page.evaluate(()=>{document.getElementById('book-form').reset();localStorage.clear();});
        }
        if(name==='search') {
          assert.equal((await page.getByRole('heading',{name:'Search books, readers & circles',exact:true}).textContent()).trim(),'Search books, readers & circles','Search heading should explain its full scope');
          assert.equal(await page.locator('#global-search-input').getAttribute('placeholder'),'Title, author, series, reader, shelf, or circle…','Search prompt should list searchable entities');
          assert.equal(await page.locator('#search-status-filter option').first().textContent(),'Book availability','Availability should be clearly book-specific');
          assert.equal(await page.locator('#search-genre-filter option').first().textContent(),'Book genre','Genre should be clearly book-specific');
        }
        if(name==='friends') {
          await page.getByRole('button',{name:'Find readers',exact:true}).waitFor({state:'visible'});
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
        if(name==='search') {
          await page.locator('#search-reader-suggestions [data-suggested-reader="dev"]').waitFor({state:'visible'});
          await page.locator('#search-reader-suggestions [data-suggested-reader="dev"] button[data-action="open-reader-profile"]').click();
          await page.locator('#reader-profile-modal').waitFor({state:'visible'});
          await page.waitForFunction(()=>document.getElementById('reader-profile-body')?.textContent.includes('DevReads'));
          assert.ok((await page.locator('#reader-profile-body').textContent()).includes('DevReads'),'Suggested reader should open the matching profile');
          const profileModalLayout=await page.locator('#reader-profile-modal > div').evaluate(element=>({client:element.clientWidth,scroll:element.scrollWidth}));
          assert.ok(profileModalLayout.scroll<=profileModalLayout.client+1,`Reader profile modal overflows at ${width}`);
          await page.getByRole('button',{name:'Close profile',exact:true}).click();
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
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Profile overflows at ${width}`);
      await page.screenshot({path:path.join(out,`${width}-${height}-profile.png`),fullPage:true});
      await page.getByRole('button',{name:'Admin tools',exact:true}).click();
      await page.locator('#view-admin').waitFor({state:'visible'});
      assert.equal(await page.locator('.tab-btn[aria-current="page"]').count(),0,'Admin should not highlight a primary destination');
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Admin overflows at ${width}`);
      if(width<900) {
        const undersized=await page.locator(editableSelector).evaluateAll(elements=>elements.filter(element=>Number.parseFloat(getComputedStyle(element).fontSize)<16).map(element=>element.id || element.getAttribute('aria-label') || element.tagName));
        assert.deepEqual(undersized,[],`Dynamic editable controls below 16px at ${width}x${height}`);
      }
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
