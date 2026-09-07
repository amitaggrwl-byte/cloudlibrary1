/* Local-only help: no database queries or external search. */
window.CloudHelp = (() => {
  const additions = [
    ['Adding books', 'Can I list a book without lending it?', ['Yes. In Add book or Edit, choose Not for lending under Availability, then save.', 'The book remains on your shelf, but new borrow requests are blocked. This uses the existing Reading status, so some shelf badges may still say Reading.', 'Change it back to Available when you want to lend it. You cannot change an active loan this way; complete the return first.'], 'add'],
    ['Adding books', 'What is an ISBN, and where do I find it?', ['An ISBN is an identification number for a particular edition of a book. It has 10 or 13 digits. Different editions or formats can have different ISBNs, even when the title is the same.', 'Look on the back cover beside the barcode for the letters ISBN. You may also find it inside, on the page with the publishing details. It is not the price or a library sticker number.', 'Choose Scan ISBN barcode and point your camera at the barcode, not the front-cover picture. Or type the ISBN into the field and choose Find details using ISBN. Hyphens and spaces are fine.', 'Check the title, author and cover that appear. Some books are missing from the catalog, so a valid ISBN may not find details.', 'No ISBN, or a damaged barcode? You can still add the book by typing its title and author. You can also try Find details from a cover photo.'], 'add'],
    ['Getting started', 'How do I find friends and start sharing?', ['Create your shelf and introduction in Profile.', 'Use Search to find a reader, then open their profile before sending a friend request.', 'Wait for acceptance. Confirmed friends can view shelves and request available books. Circles are profile tags, not automatic friendships.'], 'friends'],
    ['Borrowing', 'How do I request a book? Is it reserved immediately?', ['Find an available book on a confirmed friend\'s shelf and select Request to borrow.', 'Check Inbox for the pending request. A request or bookmark does not reserve the book.', 'The owner approves or declines. An approved loan counts toward your limit and is due 14 days after approval. Arrange the physical exchange with your friend.'], 'inbox'],
    ['Borrowing', 'Why can I not request or approve a book?', ['You must be confirmed friends, and the copy must be Available. You cannot borrow your own book.', 'A reader can hold three active loans, keep five pending requests, and ask at most two friends for the same title. A duplicate pending request for the same copy is blocked.', 'Return a book and wait for the owner to confirm, or cancel an unanswered request in Inbox before trying again.', 'If someone acted on the request already, refresh the page and check its latest status instead of clicking repeatedly.'], 'inbox'],
    ['Borrowing', 'What happens to competing requests? Can I ask again?', ['When an owner approves a copy for one reader, other pending requests for that copy are declined as unavailable.', 'When a reader reaches three active loans, their other pending borrowing requests are cancelled. They remain in history.', 'After a decline, cancellation or completed return, you may request again when the copy is available and you meet the limits. A closed request does not permanently block borrowing.'], 'search'],
    ['Returning', 'Who starts a return, and when is my borrowing slot freed?', ['Give the physical book back to the owner.', 'As the borrower, select Request return on your current loan.', 'The owner checks they have received the book and selects Confirm returned.', 'Until confirmation, the book is still lent out and counts as an active loan. A reminder does not complete a return.'], 'library'],
    ['Returning', 'Why can the owner not confirm a return?', ['The borrower must request the return first. Check the loan and ask them to complete that step.', 'Only the owner can confirm receipt. Check which profile is signed in.', 'If the loan was already closed, refresh and check its history. Do not request or confirm a return unless the physical exchange has happened.'], 'library'],
    ['Returning', 'What if a book is overdue or lost?', ['Contact the owner and arrange the return; the owner can send a reminder.', 'An overdue book remains an active loan. There is no automatic return when the 14 days expire.', 'If the book is lost, discuss it with the owner. The owner closes it as lost; do not confirm a return for a missing book.', 'Late and lost outcomes affect the reader score. See Reader score and ledger for the point rules.'], 'library'],
    ['Deleting', 'Why can I not delete a book from my shelf?', ['Only the owner can delete a copy. Check the signed-in profile.', 'A Lent Out book cannot be deleted, including one awaiting return confirmation. Complete the return or have the owner close a genuinely lost loan first.', 'For another copy, select Delete and confirm. Deletion is not the same as editing a title or marking a return.', 'If a non-lent copy you own still gives a permission error, refresh and retry once. Report the book title and exact error through feedback if it persists.'], 'library'],
    ['Deleting', 'Why can I not delete my account? What is removed?', ['Open your Profile and the account deletion controls. Read the warning and type DELETE to confirm.', 'Deletion is blocked while you have books borrowed OR lent out. A return awaiting confirmation is still an active loan.', 'Complete those handoffs first. Pending requests are closed during deletion; friendships, your shelf, profile and saved books are removed.', 'Friends are notified. Completed exchange records in other readers\' histories may remain; deleting your account does not erase every record of a shared loan.'], 'profile'],
    ['Troubleshooting', 'What should I do after a connection or permission error?', ['Check the profile signed in and whether the action is allowed for that book or request.', 'Check your connection, refresh, and inspect the current state before retrying. A slow response does not always mean nothing was saved.', 'A permission error on an allowed action can be an application problem, not something you did wrong.', 'Send the page, action, exact error and expected result in feedback. Never include passwords or sign-in codes.'], 'feedback'],
    ['Feedback', 'How do I report a problem and find the reply?', ['Choose a problem, suggestion or question in the feedback form.', 'Describe what you clicked, what happened, and what you expected. Include your device/browser and book title when relevant.', 'Send once. Your feedback and administrator reply appear in Inbox.'], 'feedback'],
    ['Privacy', 'What can other readers see?', ['Your shelf name, avatar, introduction, circles and library-facing statistics help readers decide whom to connect with.', 'Email addresses are not shown publicly. Avoid putting contact details or sensitive information in your introduction.', 'Community discovery shows book information. Only confirmed friends can request to borrow.'], 'profile']
  ];
  const groups = ['Getting started', 'Adding books', 'Finding books', 'Borrowing', 'Returning', 'Deleting', 'Profile and score', 'Feedback', 'Privacy', 'Troubleshooting', 'About', 'Administration'];
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
      panel.innerHTML='<header class="help-heading"><h2 id="help-title">Help and answers</h2><button type="button" data-action="close-help" aria-label="Close help">&times;</button></header><div class="help-tools"><label for="help-search">What do you need help with?</label><input id="help-search" type="search" placeholder="Try return, delete, ISBN or series"><label for="help-topic">Topic</label><select id="help-topic"></select></div><div id="help-results" aria-live="polite"></div>';
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
