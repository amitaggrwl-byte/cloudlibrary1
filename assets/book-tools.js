(function (root) {
  'use strict';
  const words = value => String(value || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').match(/[a-z0-9]+/g) || [];
  function parseSearch(value) {
    const terms = words(value.replace(/\b(\d+)(st|nd|rd|th)\b/gi, '$1'));
    const textTerms = terms.filter(term => !['book', 'volume', 'vol', 'number', 'no'].includes(term));
    const last = textTerms[textTerms.length - 1];
    const seriesNumber = /^\d+$/.test(last || '') && textTerms.some(term => /[a-z]/.test(term)) ? Number(last) : null;
    return { terms: textTerms, seriesNumber, token: [...textTerms].filter(term => !/^\d+$/.test(term)).sort((a, b) => b.length - a.length)[0] || terms[0] || '' };
  }
  function nearWord(a, b) {
    if (a === b || b.startsWith(a)) return true;
    if (a.length < 4 || Math.abs(a.length - b.length) > 1) return false;
    if (a.length === b.length) {
      const different = [...a].map((c, i) => c === b[i] ? -1 : i).filter(i => i >= 0);
      if (different.length === 2 && different[1] === different[0] + 1 && a[different[0]] === b[different[1]] && a[different[1]] === b[different[0]]) return true;
    }
    let i = 0; let j = 0; let edits = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) { i++; j++; continue; }
      if (++edits > 1) return false;
      if (a.length >= b.length) i++;
      if (b.length >= a.length) j++;
    }
    return edits + (a.length - i) + (b.length - j) <= 1;
  }
  function matchesSearch(parsed, values) {
    const candidates = values.flatMap(words);
    return parsed.terms.every(term => candidates.some(word => /^\d+$/.test(term) ? Number(term) === Number(word) : nearWord(term, word)));
  }
  function validISBN(value) {
    const isbn = String(value).replace(/[-\s]/g, '').toUpperCase();
    if (/^\d{9}[\dX]$/.test(isbn)) return [...isbn].reduce((sum, c, i) => sum + (c === 'X' ? 10 : Number(c)) * (10 - i), 0) % 11 === 0 ? isbn : '';
    if (/^97[89]\d{10}$/.test(isbn)) return [...isbn].reduce((sum, c, i) => sum + Number(c) * (i % 2 ? 3 : 1), 0) % 10 === 0 ? isbn : '';
    return '';
  }
  const BOOK_LIMITS = Object.freeze({
    title: 240,
    author: 180,
    seriesName: 200,
    seriesNumber: 9999,
    genre: 60,
    condition: 40,
    coverUrl: 2000,
    description: 2000
  });
  function optionalInteger(value) {
    if (value === '' || value === null || value === undefined) return null;
    const number = Number(value);
    return Number.isInteger(number) ? number : NaN;
  }
  function validateBook(input = {}, options = {}) {
    const allowedStatuses = options.allowedStatuses || ['Available', 'Reading'];
    const text = key => String(input[key] ?? '').trim();
    const enteredISBN = text('isbn');
    const isbn = enteredISBN ? validISBN(enteredISBN) : '';
    const book = {
      ...input,
      title: text('title'),
      author: text('author'),
      seriesName: text('seriesName'),
      seriesNumber: optionalInteger(input.seriesNumber),
      genre: text('genre'),
      isbn,
      publishedYear: optionalInteger(input.publishedYear),
      condition: text('condition'),
      coverUrl: text('coverUrl'),
      description: text('description'),
      rating: optionalInteger(input.rating),
      status: text('status')
    };
    const errors = [];
    const required = (key, label) => {
      if (!book[key]) errors.push(`${label} is required.`);
    };
    const bounded = (key, label) => {
      if (book[key].length > BOOK_LIMITS[key]) errors.push(`${label} must be ${BOOK_LIMITS[key]} characters or fewer.`);
    };
    required('title', 'Book title');
    required('author', 'Author');
    bounded('title', 'Book title');
    bounded('author', 'Author');
    bounded('seriesName', 'Series name');
    bounded('genre', 'Genre');
    bounded('condition', 'Condition');
    bounded('coverUrl', 'Cover image address');
    bounded('description', 'Book note');
    if (Number.isNaN(book.seriesNumber) || (book.seriesNumber !== null && (book.seriesNumber < 1 || book.seriesNumber > BOOK_LIMITS.seriesNumber))) {
      errors.push(`Book number must be a whole number from 1 to ${BOOK_LIMITS.seriesNumber}.`);
    }
    const latestYear = new Date().getFullYear() + 1;
    if (Number.isNaN(book.publishedYear) || (book.publishedYear !== null && (book.publishedYear < 1000 || book.publishedYear > latestYear))) {
      errors.push(`Year must be from 1000 to ${latestYear}.`);
    }
    if (enteredISBN && !isbn) errors.push('ISBN must be a valid 10- or 13-digit book number.');
    const localEmulatorCover = options.allowLocalCoverUrl && /^http:\/\/(127\.0\.0\.1|localhost):9199\//i.test(book.coverUrl);
    if (book.coverUrl && !/^https:\/\//i.test(book.coverUrl) && !localEmulatorCover) errors.push('Cover image address must start with https://.');
    if (!Number.isInteger(book.rating) || book.rating < 0 || book.rating > 5) errors.push('Rating must be a whole number from 0 to 5.');
    if (!allowedStatuses.includes(book.status)) errors.push('Choose a valid availability.');
    return { valid: errors.length === 0, errors, book };
  }
  function googleMetadata(info = {}) {
    const series = info.seriesInfo?.volumeSeries?.[0] || {};
    return {
      title: info.title || '', author: (info.authors || []).join(', '),
      isbn: info.industryIdentifiers?.find(item => item.type === 'ISBN_13')?.identifier || info.industryIdentifiers?.find(item => item.type === 'ISBN_10')?.identifier || '',
      publishedYear: /^\d{4}/.exec(info.publishedDate || '')?.[0] || '',
      coverUrl: (info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail || '').replace(/^http:/, 'https:'),
      seriesName: series.seriesTitle || '', seriesNumber: Number(series.orderNumber) > 0 ? Number(series.orderNumber) : '',
      subjects: info.categories || []
    };
  }
  const api = { words, parseSearch, nearWord, matchesSearch, validISBN, validateBook, BOOK_LIMITS, googleMetadata };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BookTools = api;
})(typeof window !== 'undefined' ? window : globalThis);
