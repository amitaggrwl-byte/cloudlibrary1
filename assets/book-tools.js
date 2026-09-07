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
  const api = { words, parseSearch, nearWord, matchesSearch, validISBN, googleMetadata };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BookTools = api;
})(typeof window !== 'undefined' ? window : globalThis);
