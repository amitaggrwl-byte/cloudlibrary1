// Seeds Firebase emulators only. It refuses to run unless Firestore points to
// an emulator, so it can never touch the real CloudLibrary project by mistake.
// The root project intentionally keeps its dependencies small; reuse the
// Functions SDK that this repository already installs for deployment.
const { createRequire } = require('node:module');
const functionsRequire = createRequire(require.resolve('../functions/package.json'));
const { initializeApp } = functionsRequire('firebase-admin/app');
const { getAuth } = functionsRequire('firebase-admin/auth');
const { FieldValue, getFirestore } = functionsRequire('firebase-admin/firestore');

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  throw new Error('Start the Firebase emulators first, then run npm run demo:seed.');
}

initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'cloudlibrary-7b9ac' });
const auth = getAuth();
const db = getFirestore();
const password = 'cloudlibrary-demo';
const users = [
  ['alex', 'AlexReads', 'I like adventures, funny books, and big book series.'],
  ['bella', 'BellaBooks', 'I lend mysteries, facts, and stories with brave heroes.'],
  ['carlos', 'CarlosShelf', 'I am looking for my next favorite book.']
];
const circles = [
  ['hxls', 'HXLS', 'School'],
  ['grade-5', 'Grade 5', 'Grade'],
  ['gurgaon', 'Gurgaon', 'Locality'],
  ['dlf-phase-5', 'DLF Phase 5', 'Society'],
  ['fantasy-adventures', 'Fantasy & Adventures', 'Genre'],
  ['mystery-detectives', 'Mystery Detectives', 'Club'],
  ['harry-potter', 'Harry Potter Readers', 'Fan group']
];

function tokens(...values) {
  const result = new Set();
  values.filter(Boolean).forEach(value => String(value).toLowerCase().match(/[a-z0-9]+/g)?.forEach(word => {
    for (let index = 1; index <= Math.min(word.length, 24); index += 1) result.add(word.slice(0, index));
  }));
  return [...result];
}

async function ensureUser(uid) {
  const email = `${uid}@cloudlibrary.demo`;
  try { await auth.getUser(uid); }
  catch { await auth.createUser({ uid, email, password, displayName: uid[0].toUpperCase() + uid.slice(1) }); }
}

async function main() {
  await Promise.all(users.map(([uid]) => ensureUser(uid)));
  const batch = db.batch();
  users.forEach(([uid, libraryName, bio]) => {
    const circleTags = uid === 'alex'
      ? ['HXLS', 'Grade 5', 'Gurgaon']
      : uid === 'bella' ? ['HXLS', 'Mystery Detectives'] : [];
    batch.set(db.collection('profiles').doc(uid), {
      libraryName, shelfKey: libraryName.toLowerCase(), ownerName: libraryName,
      photoURL: '', bio, ratingScore: uid === 'alex' ? 4.2 : 3.4,
      ratingAdjustment: 0, bookCount: uid === 'bella' ? 3 : 2, timelyReturns: uid === 'alex' ? 2 : 0,
      memberSince: FieldValue.serverTimestamp(), circleTags, searchTokens: tokens(libraryName), updatedAt: FieldValue.serverTimestamp()
    });
    batch.set(db.collection('shelfNames').doc(libraryName.toLowerCase()), { ownerId: uid, createdAt: FieldValue.serverTimestamp() });
  });
  batch.set(db.collection('appConfig').doc('community'), { adminUserIds: ['alex'], circleLimit: 5, updatedAt: FieldValue.serverTimestamp() });
  circles.forEach(([id, name, category]) => {
    batch.set(db.collection('circles').doc(id), { name, category, active: true, createdAt: FieldValue.serverTimestamp() });
  });
  [['alex', 'hxls'], ['alex', 'grade-5'], ['alex', 'gurgaon'], ['bella', 'hxls'], ['bella', 'mystery-detectives']].forEach(([userId, circleId]) => {
    const [, name, category] = circles.find(([id]) => id === circleId);
    batch.set(db.collection('circleMemberships').doc(`${userId}_${circleId}`), { userId, circleId, circleName: name, category, joinedAt: FieldValue.serverTimestamp() });
  });
  // Deliberately use legacy IDs here so the local demo exercises the safe
  // one-time migration that preserves relationships from older releases.
  batch.set(db.collection('friendships').doc('alex-bella'), { user1: 'alex', user2: 'bella', user1Name: 'AlexReads', user2Name: 'BellaBooks', senderId: 'alex', status: 'accepted', createdAt: FieldValue.serverTimestamp() });
  batch.set(db.collection('friendships').doc('carlos-alex'), { user1: 'carlos', user2: 'alex', user1Name: 'CarlosShelf', user2Name: 'AlexReads', senderId: 'carlos', status: 'pending', createdAt: FieldValue.serverTimestamp() });
  const books = [
    ['bella-facts', 'bella', 'BellaBooks', '1000 Fantastic Facts', 'Miles Kelly', 'Available'],
    ['bella-mystery', 'bella', 'BellaBooks', 'The Midnight Mystery', 'A. Reader', 'Available'],
    ['alex-adventure', 'alex', 'AlexReads', 'The Map of Moonlight', 'S. Story', 'Available'],
    ['bella-loan', 'bella', 'BellaBooks', 'The Secret Garden', 'Frances Hodgson Burnett', 'Lent Out']
  ];
  books.forEach(([id, ownerId, ownerName, title, author, status]) => {
    const book = { ownerId, ownerName, title, author, genre: 'Fiction', isbn: '', publishedYear: null, condition: 'Good', coverUrl: '', description: '', rating: 4, status, createdAt: FieldValue.serverTimestamp() };
    if (id === 'bella-loan') Object.assign(book, { borrowerId: 'alex', borrowerName: 'AlexReads', activeRequestId: 'demo-loan', lentAt: FieldValue.serverTimestamp(), loanDueAt: new Date(Date.now() + 10 * 86400000) });
    batch.set(db.collection('books').doc(id), book);
    batch.set(db.collection('bookDiscovery').doc(id), {
      bookId: id, ownerId, ownerName, title, author, genre: 'Fiction',
      publishedYear: null, rating: 4, coverUrl: '', status,
      searchTokens: tokens(title, author), updatedAt: FieldValue.serverTimestamp()
    });
  });
  batch.set(db.collection('requests').doc('demo-loan'), { type: 'borrow', bookId: 'bella-loan', title: 'The Secret Garden', ownerId: 'bella', ownerName: 'BellaBooks', requesterId: 'alex', requesterName: 'AlexReads', status: 'approved', createdAt: FieldValue.serverTimestamp() });
  await batch.commit();
  console.log('Demo readers seeded. Open http://localhost:8888/?demo=1 and sign in as Alex, Bella, or Carlos.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
