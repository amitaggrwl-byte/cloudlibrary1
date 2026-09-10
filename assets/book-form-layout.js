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

  const help = document.createElement('button');
  help.type = 'button';
  help.className = 'book-help-link';
  help.textContent = 'How to add a book';
  const helpDialog = document.createElement('dialog');
  helpDialog.className = 'book-context-help';
  helpDialog.setAttribute('aria-labelledby', 'book-context-help-title');
  helpDialog.innerHTML = '<h2 id="book-context-help-title">Adding a book</h2><ol><li>Enter the ISBN printed beside the back-cover barcode, then choose <strong>Find book details</strong>. CloudLibrary fills any missing title, author, series, genre, publication year and cover automatically; information you already entered is kept.</li><li>No ISBN? Type the title and author, or add a clear front-cover photo and use <strong>Read cover text</strong>.</li><li>Check the suggested details. Everything except title and author is optional; availability starts as Available.</li><li>Select Add to shelf once, then wait for confirmation.</li></ol><button type="button">Got it</button>';
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
    get('isbn').focus();
    get('publishedYear').setCustomValidity('');
  }, 0));
})();
