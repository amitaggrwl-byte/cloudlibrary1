const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseSearch, matchesSearch, validISBN, googleMetadata } = require('../assets/book-tools');

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
