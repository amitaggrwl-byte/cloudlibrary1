// Add form-specific validation and help without rearranging the HTML controls.
(() => {
  const form = document.getElementById('book-form');
  const get = id => document.getElementById(id);

  const lookup = get('lookup-isbn');
  lookup.textContent = 'Find details';
  lookup.title = 'Find book details using ISBN';
  get('edit-lookup-isbn').textContent = 'Find details';
  const scan = get('start-scan-btn');
  scan.querySelector('span').textContent = 'Scan ISBN';

  for (const select of [get('status'), get('edit-status')]) {
    const option = [...(select?.options || [])].find(item => item.value === 'Reading');
    if (option) option.textContent = 'Not for lending';
  }

  const directFormChild = element => {
    let node = element;
    while (node?.parentElement && node.parentElement !== form) node = node.parentElement;
    return node?.parentElement === form ? node : null;
  };
  const addBlocks = {
    isbn: directFormChild(get('isbn')),
    title: directFormChild(get('title')),
    genre: directFormChild(get('genre')),
    cover: directFormChild(get('cover-preview')),
    rating: directFormChild(get('rating-picker-add')),
    details: directFormChild(get('book-more-details')),
    submit: directFormChild(get('add-book-submit'))
  };
  const wizard = document.createElement('div');
  wizard.className = 'add-wizard';
  wizard.innerHTML = '<div class="add-wizard-progress" aria-label="Add-book progress"><span data-wizard-progress="1">1 <b>Find</b></span><span data-wizard-progress="2">2 <b>Details</b></span><span data-wizard-progress="3">3 <b>Shelf</b></span></div>';
  form.prepend(wizard);
  const stepSections = [1, 2, 3].map(number => {
    const section = document.createElement('section');
    section.className = 'add-wizard-step';
    section.dataset.addStep = String(number);
    section.setAttribute('aria-labelledby', `add-step-${number}-title`);
    form.append(section);
    return section;
  });
  stepSections[0].innerHTML = '<div class="add-step-heading"><p>Step 1 of 3</p><h3 id="add-step-1-title">Find your book</h3><span>Scan its ISBN, enter the number, use a cover photo, or continue to type the details.</span></div>';
  stepSections[1].innerHTML = '<div class="add-step-heading"><p>Step 2 of 3</p><h3 id="add-step-2-title">Check the book details</h3><span>Title and author are required. Correct any catalog suggestions before continuing.</span></div>';
  stepSections[2].innerHTML = '<div class="add-step-heading"><p>Step 3 of 3</p><h3 id="add-step-3-title">Choose shelf settings</h3><span>Decide whether friends may request this copy, then add it to your shelf.</span></div><div id="add-book-review" class="add-book-review" aria-live="polite"></div>';
  for (const block of [addBlocks.isbn, addBlocks.cover]) if (block) stepSections[0].append(block);
  for (const block of [addBlocks.title, addBlocks.genre, addBlocks.details]) if (block) stepSections[1].append(block);
  for (const block of [addBlocks.rating, addBlocks.submit]) if (block) stepSections[2].append(block);
  if (addBlocks.details?.tagName === 'DETAILS') addBlocks.details.open = true;

  const controls = (backLabel, nextLabel) => {
    const row = document.createElement('div');
    row.className = 'add-wizard-controls';
    row.innerHTML = `${backLabel ? `<button type="button" data-add-back>${backLabel}</button>` : '<span></span>'}<button type="button" data-add-next>${nextLabel}</button>`;
    return row;
  };
  stepSections[0].append(controls('', 'Enter or check details'));
  stepSections[1].append(controls('Back', 'Continue to shelf settings'));
  const finalBack = document.createElement('button');
  finalBack.type = 'button';
  finalBack.dataset.addBack = '';
  finalBack.className = 'add-wizard-final-back';
  finalBack.textContent = 'Back to details';
  stepSections[2].insertBefore(finalBack, addBlocks.submit || null);

  let activeStep = 1;
  const updateReview = () => {
    const title = get('title').value.trim() || 'Untitled book';
    const author = get('author').value.trim() || 'Author not entered';
    const series = get('seriesName').value.trim();
    const number = get('seriesNumber').value.trim();
    get('add-book-review').innerHTML = `<strong>${title.replace(/[&<>"']/g, value => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[value]))}</strong><span>${author.replace(/[&<>"']/g, value => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[value]))}${series ? ` · ${series.replace(/[&<>"']/g, value => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[value]))}${number ? `, book ${number}` : ''}` : ''}</span>`;
  };
  const setStep = (number, focus = true) => {
    activeStep = Math.max(1, Math.min(3, number));
    get('start-scan-btn').hidden = activeStep !== 1 || get('admin-panel').dataset.addMode === 'bulk';
    stepSections.forEach((section, index) => { section.hidden = index + 1 !== activeStep; });
    wizard.querySelectorAll('[data-wizard-progress]').forEach(item => {
      const current = Number(item.dataset.wizardProgress) === activeStep;
      item.classList.toggle('active', current);
      if (current) item.setAttribute('aria-current', 'step'); else item.removeAttribute('aria-current');
    });
    if (activeStep === 3) updateReview();
    if (focus) stepSections[activeStep - 1].querySelector('input,select,button')?.focus();
  };
  stepSections[0].querySelector('[data-add-next]').onclick = () => setStep(2);
  stepSections[1].querySelector('[data-add-back]').onclick = () => setStep(1);
  stepSections[1].querySelector('[data-add-next]').onclick = () => {
    for (const input of [get('title'), get('author')]) {
      input.setCustomValidity(input.value.trim() ? '' : `Please enter the ${input.id}.`);
      if (!input.reportValidity()) return;
    }
    if (!get('publishedYear').reportValidity()) return;
    setStep(3);
  };
  finalBack.onclick = () => setStep(2);
  document.addEventListener('cloudlibrary:isbn-success', event => setStep(2, event.detail?.focus !== false));
  setStep(1, false);

  const addPanel = get('admin-panel');
  const bulkSection = get('bulk-add-section');
  const modeButtons = [...document.querySelectorAll('[data-add-mode]')];
  const setMode = mode => {
    const bulk = mode === 'bulk';
    addPanel.dataset.addMode = mode;
    form.hidden = bulk;
    bulkSection.hidden = !bulk;
    if (bulk) bulkSection.open = true;
    get('start-scan-btn').hidden = bulk;
    addPanel.querySelector('h2').textContent = bulk ? 'Add a list or series' : 'Add one book';
    modeButtons.forEach(button => {
      const active = button.dataset.addMode === mode;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    if (bulk) get('quick-book-lines').focus(); else setStep(activeStep);
  };
  modeButtons.forEach(button => { button.onclick = () => setMode(button.dataset.addMode); });
  setMode('single');

  const help = document.createElement('button');
  help.type = 'button';
  help.className = 'book-help-link';
  help.textContent = 'How to add a book';
  const helpDialog = document.createElement('dialog');
  helpDialog.className = 'book-context-help';
  helpDialog.setAttribute('aria-labelledby', 'book-context-help-title');
  helpDialog.innerHTML = '<h2 id="book-context-help-title">Adding a book</h2><ol><li>Enter the ISBN printed beside the back-cover barcode, then choose <strong>Find book details</strong>. CloudLibrary fills empty fields, unknown details and generated Book # titles; meaningful information you entered is kept.</li><li>No ISBN? Type the title and author, or add a clear front-cover photo and use <strong>Read cover text</strong>.</li><li>Check the suggested details. Everything except title and author is optional; availability starts as Available.</li><li>Select Add to shelf once, then wait for confirmation.</li></ol><button type="button">Got it</button>';
  document.body.append(helpDialog);
  helpDialog.querySelector('button').onclick = () => helpDialog.close();
  helpDialog.addEventListener('close', () => help.focus());
  help.onclick = () => helpDialog.showModal();
  form.after(help);

  for (const id of ['title', 'author', 'edit-title', 'edit-author']) {
    const input = get(id);
    input.addEventListener('input', () => input.setCustomValidity(input.value.trim() ? '' : 'Please enter a title or author, not only spaces.'));
  }

  const limits = window.BookTools?.BOOK_LIMITS;
  if (limits) {
    for (const [id, key] of [
      ['title', 'title'], ['edit-title', 'title'], ['author', 'author'], ['edit-author', 'author'],
      ['seriesName', 'seriesName'], ['edit-seriesName', 'seriesName'], ['genre', 'genre'], ['edit-genre', 'genre'],
      ['condition', 'condition'], ['edit-condition', 'condition'], ['coverUrl', 'coverUrl'], ['edit-coverUrl', 'coverUrl'],
      ['description', 'description'], ['edit-description', 'description']
    ]) {
      const input = get(id);
      if (input) input.maxLength = limits[key];
    }
    for (const id of ['seriesNumber', 'edit-seriesNumber']) get(id).max = limits.seriesNumber;
    for (const id of ['isbn', 'edit-isbn']) get(id).maxLength = 32;
  }

  for (const id of ['publishedYear', 'edit-publishedYear']) {
    const input = get(id);
    input.type = 'text';
    input.inputMode = 'numeric';
    input.maxLength = 4;
    input.pattern = '[0-9]{4}';
    const validate = () => {
      const value = input.value.trim();
      const invalid = value && (!/^\d{4}$/.test(value) || Number(value) < 1000 || Number(value) > new Date().getFullYear() + 1);
      input.setCustomValidity(invalid ? 'Enter a year from 1000 to next year, or leave it blank.' : '');
    };
    input.addEventListener('input', validate);
    input.addEventListener('change', validate);
    validate();
    input.closest('form').addEventListener('invalid', () => input.closest('details')?.setAttribute('open', ''), true);
  }

  form.addEventListener('invalid', event => event.target.closest('details')?.setAttribute('open', ''), true);
  form.addEventListener('reset', () => setTimeout(() => {
    setStep(1, false);
    if (!get('view-add').classList.contains('hidden')) get('isbn').focus();
    get('publishedYear').setCustomValidity('');
  }, 0));
})();
