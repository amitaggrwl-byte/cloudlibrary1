// Move existing controls, preserving their listeners and draft values.
(() => {
  const form = document.getElementById('book-form');
  const get = id => document.getElementById(id);
  const field = (id, name, optional = true) => {
    const input = get(id), wrapper = document.createElement('div');
    wrapper.className = 'book-field';
    const label = document.createElement('label'); label.htmlFor = id;
    label.textContent = optional ? name : `${name} - Required`;
    wrapper.append(label, input); return wrapper;
  };
  const note = text => {const p=document.createElement('p');p.className='book-form-note';p.textContent=text;return p;};
  const pair = (...children) => {const row=document.createElement('div');row.className='book-field-pair';row.append(...children);return row;};
  const photo = get('coverFile').parentElement;
  const coverReader = [...form.querySelectorAll('details')].find(d=>d.textContent.includes('Read cover text'));
  const rating = get('rating-picker-add').parentElement;
  const submit = get('add-book-submit');
  const isbn = field('isbn','ISBN');
  const lookup=get('lookup-isbn');lookup.textContent='Find book details';lookup.title='Find book details using ISBN';
  const scan=get('start-scan-btn');scan.querySelector('span').textContent='Scan ISBN barcode';
  const quick=document.createElement('section');quick.className='book-lookup';
  const lookupRow=document.createElement('div');lookupRow.className='book-lookup-row';lookupRow.append(isbn,lookup,scan);quick.append(lookupRow);
  quick.append(note('ISBN: the number beside the barcode on the back cover.'));
  const title=field('title','Book title',false),author=field('author','Author',false);
  const series=pair(field('seriesName','Series name'),field('seriesNumber','Book number'));
  const copy=pair(field('genre','Genre'),field('condition','Condition'),field('publishedYear','Year'));copy.classList.add('book-three-fields');
  rating.querySelector('p').textContent='Your book rating';
  const cover=field('coverUrl','Cover image URL');
  const coverRow=document.createElement('div');coverRow.className='book-cover-row';coverRow.append(cover,get('lookup-cover-button'));
  const photoSection=document.createElement('section');photoSection.className='book-cover-section';
  photoSection.append(note('Cover photo'),photo);
  if(coverReader)photoSection.append(coverReader);
  photoSection.append(coverRow);
  const availability=field('status','Availability');availability.querySelector('label').textContent='Availability';
  for (const select of [availability.querySelector('select'), get('edit-status')]) {
    const option = [...(select?.options || [])].find(item => item.value === 'Reading');
    if (option) option.textContent = 'Not for lending';
  }
  availability.append(note('Not for lending keeps the book on your shelf but blocks borrow requests.'));
  form.replaceChildren(quick,photoSection,title,author,series,copy,field('description','Notes about this copy'),pair(rating,availability),submit);
  const help=document.createElement('button');help.type='button';help.className='book-help-link';help.textContent='How to add a book';
  const helpDialog=document.createElement('dialog');helpDialog.className='book-context-help';
  helpDialog.setAttribute('aria-labelledby','book-context-help-title');
  helpDialog.innerHTML='<h2 id="book-context-help-title">Adding a book</h2><ol><li>Scan the back-cover barcode or enter its ISBN to find details. No ISBN? Type the title and author.</li><li>Check the details. Everything except title and author is optional; availability starts as Available.</li><li>A cover photo is separate from barcode scanning. Use Read cover text to find details from the front cover.</li><li>Select Add to shelf once, then wait for confirmation.</li></ol><button type="button">Got it</button>';
  document.body.append(helpDialog);helpDialog.querySelector('button').onclick=()=>helpDialog.close();helpDialog.addEventListener('close',()=>help.focus());
  help.onclick=()=>helpDialog.showModal();
  form.before(help);
  const bulk=get('quick-add-form').parentElement;
  form.before(bulk);
  for (const id of ['title','author','edit-title','edit-author']) {
    const input=get(id);
    input.addEventListener('input',()=>input.setCustomValidity(input.value.trim() ? '' : 'Please enter a title or author, not only spaces.'));
  }
  const limits=window.BookTools?.BOOK_LIMITS;
  if(limits){
    for(const [id,key] of [['title','title'],['edit-title','title'],['author','author'],['edit-author','author'],['seriesName','seriesName'],['edit-seriesName','seriesName'],['genre','genre'],['edit-genre','genre'],['condition','condition'],['edit-condition','condition'],['coverUrl','coverUrl'],['edit-coverUrl','coverUrl'],['description','description'],['edit-description','description']]){
      const input=get(id);if(input)input.maxLength=limits[key];
    }
    for(const id of ['seriesNumber','edit-seriesNumber'])get(id).max=limits.seriesNumber;
    for(const id of ['isbn','edit-isbn'])get(id).maxLength=32;
  }
  for(const id of ['publishedYear','edit-publishedYear']) {
    const input=get(id); input.type='text';input.inputMode='numeric';input.maxLength=4;input.pattern='[0-9]{4}';
    const validate=()=>{const value=input.value.trim();input.setCustomValidity(value && (!/^\d{4}$/.test(value)||Number(value)<1000||Number(value)>new Date().getFullYear()+1) ? 'Enter a year from 1000 to next year, or leave it blank.' : '');};
    input.addEventListener('input',validate);input.addEventListener('change',validate);validate();
    input.closest('form').addEventListener('invalid',()=>{input.closest('details')?.setAttribute('open','');},true);
  }
  form.addEventListener('invalid',event=>{event.target.closest('details')?.setAttribute('open','');},true);
  form.addEventListener('reset',()=>{setTimeout(()=>{get('title').focus();get('publishedYear').setCustomValidity('');},0);});
})();
