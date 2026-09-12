/* Local-only help: no database queries or external search. */
window.CloudHelp = (() => {
  const additions = [
    ['Getting started', 'What should my shelf name be?', [
      'Choose a name that people who know you will recognise, such as TaraReads or ArjunBooks. It is your public CloudLibrary identity, not a password.',
      'Use 3 to 32 letters or numbers with no spaces or special characters. Each shelf name must be unique.',
      'Do not use your email address, phone number, home address, school section, password or birth date.',
      'Choose carefully: the app does not currently provide a self-service shelf-name change. Send feedback if a genuine change is needed.'
    ], 'profile'],
    ['Getting started', 'What should I put in my reader profile?', [
      'Use a short introduction about the books, authors or genres you enjoy. Your Google profile picture may be shown as your avatar.',
      'Join only circles that genuinely describe you. Circles help discovery, but they do not prove identity or make someone a friend.',
      'Your shelf name, avatar, introduction, circles and reading statistics can be seen by signed-in readers. Keep private contact and location details out of the introduction.'
    ], 'profile'],
    ['Friends and safety', 'Who should I add as a friend?', [
      'Add people you already know in real life and can realistically exchange books with: relatives, classmates, neighbours or members of a known local group.',
      'Open the reader profile first. Use the shelf name, picture, introduction, circles and statistics only as helpful context, not as proof of identity.',
      'Do not accept an unknown person only because you share a circle or like the same books. Circles are discovery tags, not identity checks.',
      'If you are unsure who an account belongs to, ask the person through a contact method you already use before accepting.'
    ], 'friends'],
    ['Friends and safety', 'How should we arrange the real-life book exchange?', [
      'CloudLibrary records the request and loan, but it does not arrange a meeting or provide private messaging.',
      'Agree on the handover using a contact method you already use with that person. Exchange at a normal, familiar place such as home, school transport, a club or a society common area.',
      'Children should not arrange a private meeting with someone they do not already know. Tell a parent or trusted adult if an exchange feels unusual or uncomfortable.',
      'The owner should approve only when they are willing to lend. Both readers should check that the correct physical book changes hands.'
    ], 'friends'],
    ['Community etiquette', 'What makes a good borrower?', [
      'Request only books you genuinely plan to read. A bookmark saves a book for later without asking the owner.',
      'Look after the cover and pages, keep food and liquids away, and do not write in the book unless the owner has clearly allowed it.',
      'Return the book by its due date. If you need longer, speak to the owner before the due date; the app does not extend a loan automatically.',
      'After physically returning it, select Request return. The owner then confirms receipt. If it is damaged or lost, tell the owner promptly and agree on a fair solution.'
    ], 'library'],
    ['Community etiquette', 'What makes a good book owner?', [
      'Keep each book title, series number, condition and availability accurate so friends know what they are requesting.',
      'Respond to requests reasonably soon. Decline politely when a book is unavailable instead of leaving the request unanswered.',
      'Describe important existing damage before lending. Send a reminder when needed, but also speak to the borrower respectfully.',
      'Confirm returned only after the physical book is back. Mark a book lost only after discussing it with the borrower because this affects their score.'
    ], 'library'],
    ['Adding books', 'Can I list a book without lending it?', [
      'Yes. In Add book or Edit, choose Not for lending under Availability, then save.',
      'The book remains on your shelf, but new borrow requests are blocked. This uses the existing Reading status, so some shelf badges may still say Reading.',
      'Change it back to Available when you want to lend it. You cannot change an active loan this way; complete the return first.'
    ], 'add'],
    ['Adding books', 'What is an ISBN, and where do I find it?', [
      'An ISBN is an identification number for a particular edition of a book. It has 10 or 13 digits. Different editions or formats can have different ISBNs, even when the title is the same.',
      'Look on the back cover beside the barcode for the letters ISBN. You may also find it inside, on the page with the publishing details. It is not the price or a library sticker number.',
      'Choose Scan ISBN barcode and point your camera at the barcode, not the front-cover picture. Or type the ISBN into the field and choose Find details using ISBN. Hyphens and spaces are fine.',
      'Check the title, author and cover that appear. Some books are missing from the catalog, so a valid ISBN may not find details.',
      'No ISBN, or a damaged barcode? You can still add the book by typing its title and author. You can also try Find details from a cover photo.'
    ], 'add'],
    ['Finding books', 'What is the difference between saving and requesting?', [
      'Use the bookmark icon to save a book you may want later. Saved books appear on My Library.',
      'Saving is private and does not notify the owner, reserve the copy or use a pending-request slot.',
      'Request to borrow sends a real request to a confirmed friend. Use it only when you are ready to arrange the physical exchange.'
    ], 'library'],
    ['Getting started', 'How do I find friends and start sharing?', [
      'Create your shelf and a short introduction in Profile.',
      'Use Search to find a reader by shelf name or circle, then open their profile before sending a friend request.',
      'Confirm who the person is in real life. Wait for acceptance; confirmed friends can view each other\'s shelves and request available books.',
      'Circles help readers discover one another, but joining the same circle does not automatically make you friends.'
    ], 'friends'],
    ['Friends and safety', 'What happens if I remove a friend?', [
      'The app asks for confirmation before removal. After removal, both readers lose access to each other\'s full shelves and cannot make new borrow requests.',
      'Removing a friend is not a way to end an active loan. Finish any physical return and app confirmation first.',
      'You can send a new friend request later if both people want to reconnect.'
    ], 'friends'],
    ['Borrowing', 'How do I request a book? Is it reserved immediately?', [
      'Find an available book on a confirmed friend\'s shelf and select Request to borrow.',
      'Check Inbox for the pending request. A request or bookmark does not reserve the book.',
      'The owner approves or declines. An approved loan counts toward your limit and is due 14 days after approval.',
      'Arrange the physical exchange directly with the friend. Approval records the loan; it does not deliver the book.'
    ], 'inbox'],
    ['Borrowing', 'Why can I not request or approve a book?', [
      'You must be confirmed friends, and the copy must be Available. You cannot borrow your own book.',
      'A reader can hold three active loans, keep five pending book requests, and ask at most two friends for the same title. A duplicate request for the same copy is blocked.',
      'The current app does not let a borrower cancel an unanswered book request. Ask the owner to approve or decline it, and report a genuinely stuck request through feedback.',
      'If someone acted on the request already, refresh the page and check its latest status instead of clicking repeatedly.'
    ], 'inbox'],
    ['Borrowing', 'What happens to competing requests? Can I ask again?', [
      'When an owner approves a copy for one reader, other pending requests for that copy are declined as unavailable.',
      'When a reader reaches three active loans, their other pending borrowing requests are cancelled. They remain in history.',
      'After a decline, cancellation or completed return, you may request again when the copy is available and you meet the limits. A closed request does not permanently block borrowing.'
    ], 'search'],
    ['Borrowing', 'Can I keep a book for longer than 14 days?', [
      'There is currently no renewal button. Ask the owner before the due date and return the book when agreed.',
      'The recorded due date does not change automatically, so a return after it may affect the reader score even if you discussed it outside the app.',
      'Do not create a second request for a book you already hold. Complete the return handshake first.'
    ], 'library'],
    ['Returning', 'Who starts a return, and when is my borrowing slot freed?', [
      'Give the physical book back to the owner.',
      'As the borrower, select Request return on your current loan.',
      'The owner checks they have received the book and selects Confirm returned.',
      'Until confirmation, the book is still lent out and counts as an active loan. A reminder does not complete a return.'
    ], 'library'],
    ['Returning', 'Why can the owner not confirm a return?', [
      'The borrower must request the return first. Check the loan and ask them to complete that step.',
      'Only the owner can confirm receipt. Check which profile is signed in.',
      'If the loan was already closed, refresh and check its history. Do not request or confirm a return unless the physical exchange has happened.'
    ], 'library'],
    ['Returning', 'Are return reminders automatic?', [
      'No. The owner sends an in-app reminder manually from the lent-book controls.',
      'CloudLibrary does not currently send scheduled email or push reminders. Check the app and your real-life arrangements instead of relying on an automatic alert.',
      'A borrower can mark a reminder completed, but the loan closes only through the return handshake.'
    ], 'inbox'],
    ['Returning', 'What if a book is overdue, damaged or lost?', [
      'Contact the owner and arrange the return; the owner can send an in-app reminder. An overdue book remains an active loan and is not returned automatically.',
      'For damage, discuss what happened and agree on a fair solution outside the app. There is no separate damaged-book workflow yet.',
      'If the book is lost, discuss it with the owner. Only the owner closes it as lost; do not confirm a return for a missing book.',
      'Late and lost outcomes affect the reader score. Open the Reader score and ledger answer for the exact rules.'
    ], 'library'],
    ['Deleting', 'Why can I not delete a book from my shelf?', [
      'Only the owner can delete a copy. Check the signed-in profile.',
      'A Lent Out book cannot be deleted, including one awaiting return confirmation. Complete the return or have the owner close a genuinely lost loan first.',
      'For another copy, select Delete and confirm. Deletion is not the same as editing a title or marking a return.',
      'If a non-lent copy you own still gives a permission error, refresh and retry once. Report the book title and exact error through feedback if it persists.'
    ], 'library'],
    ['Deleting', 'Should I sign out or delete my account?', [
      'Choose Sign out when you are finished, changing device, or taking a break. Your shelf and history remain ready for the next sign-in.',
      'Delete the account only when you want to remove it permanently. Deletion cannot be undone.',
      'Signing in again with the same Google account normally opens the same CloudLibrary profile unless that account was permanently deleted.'
    ], 'profile'],
    ['Deleting', 'Why can I not delete my account? What is removed?', [
      'Open Profile, expand Account deletion, read both warnings and type DELETE to confirm.',
      'Deletion is blocked while you have books borrowed or lent out. A return awaiting owner confirmation is still an active loan.',
      'Complete every handoff first. Deletion closes pending requests and removes your friendships, shelf, cover photos, profile, saved books, circles, feedback and sign-in account.',
      'Confirmed friends receive an account-closed notice. Completed exchange records in another reader\'s history may remain so their own lending record still makes sense.'
    ], 'profile'],
    ['Troubleshooting', 'What should I do after a connection or permission error?', [
      'Check the profile signed in and whether the action is allowed for that book or request.',
      'Check your connection, refresh, and inspect the current state before retrying. A slow response does not always mean nothing was saved.',
      'A permission error on an allowed action can be an application problem, not something you did wrong.',
      'Send the page, action, exact error and expected result in feedback. Never include passwords or sign-in codes.'
    ], 'feedback'],
    ['Feedback', 'How do I report a problem and find the reply?', [
      'Choose a problem, suggestion or question in the feedback form.',
      'Describe what you clicked, what happened, and what you expected. Include your device or browser and the book title when relevant.',
      'Send once. Your feedback and the administrator reply appear in Inbox. Never send a password, verification code, phone number or private address.'
    ], 'feedback'],
    ['Privacy', 'What can other readers see?', [
      'Signed-in readers can see your shelf name, avatar, introduction, circles and library-facing statistics. Community discovery also shows book titles and covers.',
      'Email addresses are not displayed. Avoid putting contact details, passwords, birth dates, home addresses or other sensitive information in your shelf name or introduction.',
      'Confirmed friends can open your full shelf and request available books. Readers who are not your friends see only discovery information and your public reader profile.'
    ], 'profile']
  ];
  const groups = ['Getting started', 'Friends and safety', 'Community etiquette', 'Adding books', 'Finding books', 'Borrowing', 'Returning', 'Deleting', 'Profile and score', 'Feedback', 'Privacy', 'Troubleshooting', 'About', 'Administration'];
  function category(title) {
    if (/Administration/.test(title)) return 'Administration';
    if (/About/.test(title)) return 'About';
    if (/Scan|cover photo|Add /.test(title)) return 'Adding books';
    if (/Search|Saved/.test(title)) return 'Finding books';
    if (/Borrowing/.test(title)) return 'Borrowing';
    if (/Returning/.test(title)) return 'Returning';
    return 'Profile and score';
  }
  let initialized = false;
  let render;
  function open({admin, navigate}) {
    const modal = document.getElementById('help-modal');
    if (!initialized) {
      initialized = true;
      const panel = modal.firstElementChild;
      const topics = [...panel.querySelectorAll('details')].filter(d => !d.textContent.includes('Privacy and feedback')).map(d => {
        const title = d.querySelector('summary').textContent;
        d.open = false;
        if (title === 'Saved books') d.querySelector('p').textContent = 'Select the bookmark icon on a book to save it; its appearance changes when saved. Select it again to remove the bookmark. Saved books are on My Library. Opening one searches for the book again; saving does not reserve a copy or send a borrow request.';
        if (title === 'Add one book') d.querySelector('ol').innerHTML = '<li>Use Scan ISBN barcode or Find book details beside the ISBN field, or type the required Book title and Author yourself.</li><li>Check the title and author. Add an optional series name and book number if this book belongs to a set.</li><li>Choose the condition and availability. Available lets friends request the copy; Reading keeps it unavailable for new requests.</li><li>A cover photo is optional. Cover-photo text recognition is separate from barcode scanning.</li><li>Genre, publication year, notes and your book rating are optional. Leave the year blank if unknown.</li><li>Select Add to shelf once. After success, the form clears for the next book. For a whole collection, use Add a list or a series above the form.</li>';
        return {title, group:category(title), node:d};
      });
      additions.forEach(([group,title,steps,target]) => {
        const node = document.createElement('details');
        const summary = document.createElement('summary'); summary.textContent = title; node.append(summary);
        const list = document.createElement('ol');
        steps.forEach(text => {const li=document.createElement('li');li.textContent=text;list.append(li);}); node.append(list);
        topics.push({group,title,node,target});
      });
      topics.forEach(topic => {
        topic.node.className = 'help-answer';
        const target = topic.target || (topic.group === 'Adding books' ? 'add' : topic.group === 'Finding books' ? 'search' : topic.group === 'Profile and score' ? 'profile' : topic.group === 'Administration' ? 'admin' : null);
        const anchor = topic.title === 'Add a list or a series' ? '#series-title' : topic.title === 'Scan an ISBN or find missing details' ? '#isbn' : topic.title === 'Saved books' ? '#saved-books-panel' : topic.group === 'Returning' ? '#borrowed-panel' : null;
        const destination = topic.title === 'Saved books' ? 'library' : target;
        if (destination) {const link=document.createElement('button');link.type='button';link.className='help-jump';link.textContent=({add:'Open Add book',search:'Open Search',profile:'Open my Profile',library:'Open My Library',inbox:'Open Inbox',friends:'Open Friends',admin:'Open Admin',feedback:'Write feedback'})[destination];link.onclick=async()=>{if(destination==='feedback'){document.getElementById('feedback-message').focus();return;} await navigate(destination, anchor);};topic.node.append(link);}
      });
      const form = document.getElementById('feedback-form');
      panel.replaceChildren(); panel.className='help-panel';
      panel.innerHTML='<header class="help-heading"><div><h2 id="help-title">Help and answers</h2><p class="help-intro">How CloudLibrary works, how to share responsibly, and what to do when something goes wrong.</p></div><button type="button" data-action="close-help" aria-label="Close help">&times;</button></header><div class="help-tools"><label for="help-search">What do you need help with?</label><input id="help-search" type="search" placeholder="Try shelf name, friends, exchange, return or delete"><label for="help-topic">Topic</label><select id="help-topic"></select></div><div id="help-results" aria-live="polite"></div>';
      modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-labelledby','help-title');
      panel.append(form);
      const search=panel.querySelector('#help-search'), select=panel.querySelector('#help-topic'), results=panel.querySelector('#help-results');
      render=allowed=>{
        const selected=select.value;
        select.replaceChildren();
        ['All topics',...groups.filter(g=>allowed||g!=='Administration')].forEach(g=>{const o=document.createElement('option');o.value=g;o.textContent=g;select.append(o);});
        if ([...select.options].some(o=>o.value===selected)) select.value=selected;
        const words=search.value.toLowerCase().trim().split(/\s+/).filter(Boolean);
        const visible=topics.filter(t=>(allowed||t.group!=='Administration')&&(select.value==='All topics'||t.group===select.value)&&words.every(w=>t.node.textContent.toLowerCase().includes(w)));
        results.replaceChildren();
        groups.forEach(g=>{const entries=visible.filter(t=>t.group===g);if(!entries.length)return;const h=document.createElement('h3');h.textContent=g;results.append(h);entries.forEach(t=>results.append(t.node));});
        if(!visible.length){const p=document.createElement('p');p.textContent='No matching answer. Try fewer words, choose All topics, or send a question below.';results.append(p);}
        search.oninput=()=>render(allowed);select.onchange=()=>render(allowed);
      };
      panel.addEventListener('keydown',event=>{if(event.key==='Escape'){document.querySelector('[data-action="close-help"]').click();}if(event.key==='Tab'){const items=[...panel.querySelectorAll('button,input,select,textarea,summary')].filter(el=>el.getClientRects().length);const first=items[0],last=items[items.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}});
    }
    render(admin);
    modal.classList.remove('hidden');
    document.getElementById('help-search').focus();
  }
  return {open};
})();
