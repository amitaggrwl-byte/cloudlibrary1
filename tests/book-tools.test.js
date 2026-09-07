const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseSearch, matchesSearch, validISBN, validateBook, googleMetadata } = require('../assets/book-tools');

test('series number and ordinal searches have the same meaning', () => {
  for (const query of ['Magic Tree House 10', 'Magic Tree House book #10', 'Magic Tree House 10th book']) {
    const parsed = parseSearch(query);
    assert.equal(parsed.seriesNumber, 10);
    assert.equal(matchesSearch(parsed, ['Magic Tree House', 10]), true);
    assert.equal(matchesSearch(parsed, ['Magic Tree House', 1]), false);
    assert.equal(matchesSearch(parsed, ['Magic Tree House', 100]), false);
  }
});
test('spelling near misses and transposed letters match without losing numeric precision', () => {
  assert.ok(matchesSearch(parseSearch('magik tree huose 12'), ['Magic Tree House', 12]));
  assert.equal(matchesSearch(parseSearch('magic tree 2'), ['Magic Tree House', 20]), false);
  assert.equal(matchesSearch(parseSearch('magic tree 2'), ['Unrelated', 2]), false);
  assert.equal(parseSearch('1000 fantastic facts').seriesNumber, null);
  assert.equal(parseSearch('39 clues 10').seriesNumber, 10);
  assert.equal(parseSearch('Long series 250').seriesNumber, 250);
});
test('ISBN validates both formats and rejects non-book product barcodes', () => {
  assert.equal(validISBN('978-0-439-02348-1'), '9780439023481');
  assert.equal(validISBN('0-8044-2957-X'), '080442957X');
  assert.equal(validISBN('9780439023482'), '');
  assert.equal(validISBN('1234567890123'), '');
});
test('metadata leaves unavailable series fields empty and uses HTTPS covers', () => {
  const data = googleMetadata({ title: 'Test title', authors: ['First', 'Second'], imageLinks: { thumbnail: 'http://example.com/cover.jpg' }, publishedDate: '2012-04', categories: ['Juvenile Fiction / Fantasy'] });
  assert.equal(data.author, 'First, Second');
  assert.equal(data.coverUrl, 'https://example.com/cover.jpg');
  assert.equal(data.seriesName, '');
  assert.equal(data.publishedYear, '2012');
});

test('number-free book titles match using separate series metadata', () => {
  const books = Array.from({ length: 40 }, (_, i) => ({ title: 'A Hidden Door', seriesName: 'Magic Tree House', seriesNumber: i + 1 }));
  for (let number = 1; number <= 40; number++) {
    const matched = books.filter(book => matchesSearch(parseSearch(`Magic Tree House ${number}`), [book.title, book.seriesName, book.seriesNumber]));
    assert.deepEqual(matched.map(book => book.seriesNumber), [number]);
    assert.ok(matched.every(book => !/\d/.test(book.title)));
  }
});

test('book validation normalizes one consistent clean-launch record', () => {
  const result = validateBook({
    title: '  The Sea of Monsters  ', author: ' Rick Riordan ', seriesName: ' Percy Jackson ',
    seriesNumber: '2', genre: 'Adventure', isbn: '978-0-14-134684-7', publishedYear: '2013',
    condition: 'Good', coverUrl: 'https://example.com/cover.jpg', description: ' My copy ', rating: '4', status: 'Available'
  });
  assert.equal(result.valid, true);
  assert.equal(result.book.title, 'The Sea of Monsters');
  assert.equal(result.book.seriesNumber, 2);
  assert.equal(result.book.isbn, '9780141346847');
});

test('book validation rejects incomplete and malformed metadata', () => {
  const base = { title: 'Book', author: 'Author', seriesName: '', seriesNumber: null, genre: '', isbn: '', publishedYear: null, condition: '', coverUrl: '', description: '', rating: 0, status: 'Available' };
  assert.equal(validateBook({ ...base, title: '   ' }).valid, false);
  assert.equal(validateBook({ ...base, author: '' }).valid, false);
  assert.equal(validateBook({ ...base, seriesNumber: 0 }).valid, false);
  assert.equal(validateBook({ ...base, publishedYear: 999 }).valid, false);
  assert.equal(validateBook({ ...base, isbn: '9780439023482' }).valid, false);
  assert.equal(validateBook({ ...base, coverUrl: 'http://example.com/cover.jpg' }).valid, false);
  assert.equal(validateBook({ ...base, rating: 6 }).valid, false);
  assert.equal(validateBook({ ...base, rating: null }).valid, false);
});
