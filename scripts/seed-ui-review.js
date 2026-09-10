// Adds a dense, repeatable UI-review scenario to the Firebase emulators only.
// Run `npm run demo:seed` first so Alex, Bella, and Carlos already exist.
const { createRequire } = require('node:module');
const functionsRequire = createRequire(require.resolve('../functions/package.json'));
const { initializeApp } = functionsRequire('firebase-admin/app');
const { getAuth } = functionsRequire('firebase-admin/auth');
const { FieldValue, Timestamp, getFirestore } = functionsRequire('firebase-admin/firestore');

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  throw new Error('This UI-review fixture can only run against the Firebase emulators.');
}

initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'cloudlibrary-7b9ac' });
const auth = getAuth();
const db = getFirestore();
const password = 'cloudlibrary-demo';

function tokens(...values) {
  const result = new Set();
  values.filter(Boolean).forEach(value => String(value).toLowerCase().match(/[a-z0-9]+/g)?.forEach(word => {
    for (let index = 1; index <= Math.min(word.length, 24); index += 1) result.add(word.slice(0, index));
  }));
  return [...result];
}

async function ensureUser(uid, displayName) {
  try { await auth.getUser(uid); }
  catch { await auth.createUser({ uid, email: `${uid}@cloudlibrary.demo`, password, displayName }); }
}

function loanBook({ id, ownerId, ownerName, borrowerId, borrowerName, title, author, dueDays }) {
  const dueAt = Timestamp.fromMillis(Date.now() + dueDays * 86400000);
  return {
    id,
    data: {
      ownerId, ownerName, borrowerId, borrowerName, title, author,
      seriesName: '', seriesNumber: null, genre: 'Fiction', isbn: '', publishedYear: null,
      condition: 'Good', coverUrl: '', description: '', rating: 4, status: 'Lent Out',
      activeRequestId: `ui-review-request-${id}`, lentAt: FieldValue.serverTimestamp(),
      loanDueAt: dueAt, createdAt: FieldValue.serverTimestamp()
    }
  };
}

async function main() {
  await Promise.all([
    ensureUser('dana', 'DanaDen'),
    ensureUser('noor', 'NoorNook')
  ]);

  const batch = db.batch();
  const extraProfiles = [
    ['dana', 'DanaDen', 'I collect nature stories and illustrated adventures.', ['HXLS', 'Fantasy & Adventures'], 4.6, 8, 5, 2],
    ['noor', 'NoorNook', 'A public reader who is not connected to Alex.', ['Gurgaon'], 3.8, 4, 1, 0]
  ];
  extraProfiles.forEach(([uid, libraryName, bio, circleTags, ratingScore, bookCount, timelyReturns, friendCount]) => {
    batch.set(db.collection('profiles').doc(uid), {
      libraryName, shelfKey: libraryName.toLowerCase(), ownerName: libraryName,
      photoURL: '', bio, ratingScore, ratingAdjustment: 0, bookCount, timelyReturns,
      totalLent: timelyReturns, friendCount, memberSince: Timestamp.fromDate(new Date('2025-09-08T00:00:00Z')),
      circleTags, searchTokens: tokens(libraryName), updatedAt: FieldValue.serverTimestamp()
    });
    batch.set(db.collection('shelfNames').doc(libraryName.toLowerCase()), { ownerId: uid, createdAt: FieldValue.serverTimestamp() });
  });

  // Alex now has two confirmed friends: Bella and Dana. Noor remains unrelated.
  batch.set(db.collection('friendships').doc('alex__dana'), {
    user1: 'alex', user2: 'dana', user1Name: 'AlexReads', user2Name: 'DanaDen',
    senderId: 'alex', status: 'accepted', createdAt: FieldValue.serverTimestamp()
  });

  const activeLoans = [
    // Three books borrowed by Alex.
    loanBook({ id: 'ui-borrowed-1', ownerId: 'bella', ownerName: 'BellaBooks', borrowerId: 'alex', borrowerName: 'AlexReads', title: 'River of Stars', author: 'Mira Sen', dueDays: 6 }),
    loanBook({ id: 'ui-borrowed-2', ownerId: 'dana', ownerName: 'DanaDen', borrowerId: 'alex', borrowerName: 'AlexReads', title: 'The Clockwork Forest', author: 'L. Green', dueDays: -3 }),
    loanBook({ id: 'ui-borrowed-3', ownerId: 'bella', ownerName: 'BellaBooks', borrowerId: 'alex', borrowerName: 'AlexReads', title: 'Comets After School', author: 'R. Das', dueDays: 14 }),
    // Three books lent by Alex across both confirmed friends.
    loanBook({ id: 'ui-lent-1', ownerId: 'alex', ownerName: 'AlexReads', borrowerId: 'bella', borrowerName: 'BellaBooks', title: 'The Paper Kingdom', author: 'Helena Ku Rhee', dueDays: 4 }),
    loanBook({ id: 'ui-lent-2', ownerId: 'alex', ownerName: 'AlexReads', borrowerId: 'dana', borrowerName: 'DanaDen', title: 'A Wrinkle in Time', author: 'Madeleine L Engle', dueDays: -1 }),
    loanBook({ id: 'ui-lent-3', ownerId: 'alex', ownerName: 'AlexReads', borrowerId: 'bella', borrowerName: 'BellaBooks', title: 'The Wild Robot', author: 'Peter Brown', dueDays: 11 })
  ];
  activeLoans.forEach(({ id, data }) => {
    batch.set(db.collection('books').doc(id), data);
    batch.set(db.collection('bookDiscovery').doc(id), {
      bookId: id, ownerId: data.ownerId, ownerName: data.ownerName, title: data.title,
      author: data.author, genre: data.genre, publishedYear: null, rating: data.rating,
      coverUrl: '', status: 'Lent Out', suggestionBucket: Math.random(),
      searchTokens: tokens(data.title, data.author), updatedAt: FieldValue.serverTimestamp()
    });
    batch.set(db.collection('requests').doc(data.activeRequestId), {
      type: 'borrow', bookId: id, title: data.title, ownerId: data.ownerId,
      ownerName: data.ownerName, requesterId: data.borrowerId, requesterName: data.borrowerName,
      status: 'approved', createdAt: FieldValue.serverTimestamp()
    });
  });

  // Three pending requests initiated by Alex, shown individually in Attention.
  [
    ['ui-pending-1', 'bella-facts', '1000 Fantastic Facts', 'bella', 'BellaBooks'],
    ['ui-pending-2', 'bella-mystery', 'The Midnight Mystery', 'bella', 'BellaBooks'],
    ['ui-pending-3', 'dana-available', 'Garden of Small Wonders', 'dana', 'DanaDen']
  ].forEach(([id, bookId, title, ownerId, ownerName]) => {
    batch.set(db.collection('requests').doc(id), {
      type: 'borrow', bookId, title, ownerId, ownerName,
      requesterId: 'alex', requesterName: 'AlexReads', status: 'pending',
      createdAt: FieldValue.serverTimestamp()
    });
  });

  const availableBooks = [
    ['dana-available', 'dana', 'DanaDen', 'Garden of Small Wonders', 'N. Vale'],
    ['noor-available', 'noor', 'NoorNook', 'The Unfamiliar Shelf', 'P. Stranger']
  ];
  availableBooks.forEach(([id, ownerId, ownerName, title, author]) => {
    const data = {
      ownerId, ownerName, title, author, seriesName: '', seriesNumber: null,
      genre: 'Fiction', isbn: '', publishedYear: null, condition: 'Good', coverUrl: '',
      description: '', rating: 4, status: 'Available', createdAt: FieldValue.serverTimestamp()
    };
    batch.set(db.collection('books').doc(id), data);
    batch.set(db.collection('bookDiscovery').doc(id), {
      bookId: id, ownerId, ownerName, title, author, genre: 'Fiction', publishedYear: null,
      rating: 4, coverUrl: '', status: 'Available', suggestionBucket: Math.random(),
      searchTokens: tokens(title, author), updatedAt: FieldValue.serverTimestamp()
    });
  });

  // Save both a friend's and a stranger's available book. The ticker must only
  // surface Dana's title because Noor is not connected to Alex.
  batch.set(db.collection('savedBooks').doc('alex_dana-available'), {
    userId: 'alex', bookId: 'dana-available', title: 'Garden of Small Wonders',
    author: 'N. Vale', ownerId: 'dana', ownerName: 'DanaDen', savedAt: FieldValue.serverTimestamp()
  });
  batch.set(db.collection('savedBooks').doc('alex_noor-available'), {
    userId: 'alex', bookId: 'noor-available', title: 'The Unfamiliar Shelf',
    author: 'P. Stranger', ownerId: 'noor', ownerName: 'NoorNook', savedAt: FieldValue.serverTimestamp()
  });

  await batch.commit();
  console.log('UI-review fixture seeded: Alex has 3 borrowed books, 3 lent books, 3 pending borrow requests, 2 friends, and 1 unrelated reader.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
