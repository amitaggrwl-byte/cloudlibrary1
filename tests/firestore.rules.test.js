const { readFileSync } = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment
} = require('@firebase/rules-unit-testing');

let env;
const projectId = 'cloudlibrary-rules-test';

test.before(async () => {
  env = await initializeTestEnvironment({
    projectId,
    firestore: { rules: readFileSync('firestore.rules', 'utf8') }
  });
  await env.withSecurityRulesDisabled(async context => {
    const store = context.firestore();
    await store.collection('books').doc('book-1').set({
      ownerId: 'alice', ownerName: 'AliceShelf', title: 'Book', author: 'Author',
      status: 'Available', discoveryVersion: 1
    });
    await store.collection('friendships').doc('alice__bob').set({ user1: 'alice', user2: 'bob', status: 'accepted' });
    await store.collection('friendships').doc('owner__reader').set({ user1: 'owner', user2: 'reader', status: 'accepted' });
    await store.collection('books').doc('legacy-book').set({
      ownerId: 'alice', ownerName: 'AliceShelf', title: 'Legacy book', author: 'Author',
      status: 'Available', readerIds: ['charlie']
    });
    await store.collection('profiles').doc('owner').set(profile('OwnerShelf'));
    await store.collection('books').doc('locked-book').set({
      ownerId: 'owner', ownerName: 'OwnerShelf', title: 'Locked book', author: 'Author',
      status: 'Available', discoveryVersion: 1
    });
    await store.collection('tickerActivities').doc('alice-book').set({
      recipientId: 'alice', type: 'book-added', actorId: 'bob', actorName: 'BobShelf',
      ownerId: 'bob', title: 'Book', createdAt: new Date()
    });
    await store.collection('networkTicker').doc('member-bob').set({
      type: 'member-joined', actorId: 'bob', actorName: 'BobShelf', createdAt: new Date()
    });
    await store.collection('readerStats').doc('alice').set({ totalBorrowed: 4, mostBorrowedTitle: 'Book', mostBorrowedCount: 2 });
    await store.collection('networkStats').doc('current').set({ totalLoans: 9, activeLoans: 2, highestMemberBorrowed: 4 });
    await store.collection('ratingEvents').doc('alice-return').set({
      subjectId: 'alice', title: 'Book', points: 0.5, reason: 'Returned on time', createdAt: new Date()
    });
    await store.collection('books').doc('series-book').set({
      ownerId: 'owner', ownerName: 'OwnerShelf', title: 'The Sea of Monsters', author: 'Rick Riordan',
      seriesName: 'Percy Jackson', seriesNumber: 2, status: 'Available'
    });
  });
});

test.after(async () => env.cleanup());

function profile(name) {
  return {
    libraryName: name,
    shelfKey: name.toLowerCase(),
    ownerName: name,
    photoURL: '',
    bio: '',
    ratingScore: 3,
    ratingAdjustment: 0,
    bookCount: 0,
    timelyReturns: 0,
    totalLent: 0,
    friendCount: 0,
    memberSince: new Date(),
    circleTags: [],
    searchTokens: [name.toLowerCase()],
    updatedAt: new Date()
  };
}

function writeProfile(store, uid, name, extra = {}) {
  const batch = store.batch();
  const data = { ...profile(name), ...extra };
  batch.set(store.collection('profiles').doc(uid), data);
  batch.set(store.collection('shelfNames').doc(data.shelfKey), { ownerId: uid, createdAt: new Date() });
  return batch.commit();
}

test('profiles reject email fields and only accept the public schema', async () => {
  const alice = env.authenticatedContext('alice').firestore();
  await assertSucceeds(writeProfile(alice, 'alice', 'AliceShelf'));
  await assertFails(writeProfile(alice, 'alice-private', 'PrivateShelf', { ownerEmail: 'parent@example.com' }));
});

test('a shelf name can only be reserved by one profile in the same atomic write', async () => {
  const alice = env.authenticatedContext('alice-unique').firestore();
  const bob = env.authenticatedContext('bob-unique').firestore();
  await assertSucceeds(writeProfile(alice, 'alice-unique', 'UniqueShelf'));
  await assertFails(writeProfile(bob, 'bob-unique', 'UniqueShelf'));
});

test('a full book is readable by the owner and confirmed reader only', async () => {
  await assertSucceeds(env.authenticatedContext('alice').firestore().collection('books').doc('book-1').get());
  await assertSucceeds(env.authenticatedContext('bob').firestore().collection('books').doc('book-1').get());
  await assertFails(env.authenticatedContext('charlie').firestore().collection('books').doc('book-1').get());
  await assertSucceeds(env.authenticatedContext('bob').firestore().collection('books').where('ownerId', '==', 'alice').limit(10).get());
  await assertFails(env.authenticatedContext('charlie').firestore().collection('books').where('ownerId', '==', 'alice').limit(10).get());
});

test('existing server-written book access keeps working during friendship migration', async () => {
  const charlie = env.authenticatedContext('charlie').firestore();
  await assertSucceeds(charlie.collection('books').doc('legacy-book').get());
  await assertFails(charlie.collection('requests').doc('legacy-borrow').set({
    type: 'borrow', bookId: 'legacy-book', ownerId: 'alice', requesterId: 'charlie', status: 'pending'
  }));
});

test('the browser cannot lend a book or change a score directly', async () => {
  const owner = env.authenticatedContext('owner').firestore();
  await assertFails(owner.collection('books').doc('locked-book').update({ status: 'Lent Out', borrowerId: 'reader' }));
  await assertFails(owner.collection('books').doc('locked-book').update({ readerIds: ['reader', 'stranger'] }));
  await assertFails(owner.collection('profiles').doc('owner').update({ ratingScore: 10 }));
  await assertFails(owner.collection('books').doc('self-shared').set({ ownerId: 'owner', title: 'Private', status: 'Available', readerIds: ['stranger'] }));
});

test('an owner can add series metadata without changing protected loan state', async () => {
  const owner = env.authenticatedContext('owner').firestore();
  await assertSucceeds(owner.collection('books').doc('series-book').update({ seriesName: 'Percy Jackson & the Olympians', seriesNumber: 2 }));
});

test('borrow requests can only be created by the trusted Function', async () => {
  const bob = env.authenticatedContext('bob').firestore();
  const charlie = env.authenticatedContext('charlie').firestore();
  const request = { type: 'borrow', bookId: 'book-1', ownerId: 'alice', requesterId: 'bob', status: 'pending' };
  await assertFails(bob.collection('requests').doc('bob-borrow').set(request));
  await assertFails(charlie.collection('requests').doc('charlie-borrow').set({ ...request, requesterId: 'charlie' }));
});

test('an owner can delete an available book but not an active loan', async () => {
  const owner = env.authenticatedContext('owner').firestore();
  await assertSucceeds(owner.collection('books').doc('locked-book').delete());
  await env.withSecurityRulesDisabled(async context => {
    await context.firestore().collection('books').doc('active-loan').set({
      ownerId: 'owner', ownerName: 'OwnerShelf', title: 'On loan', author: 'Author',
      status: 'Lent Out', borrowerId: 'reader'
    });
  });
  await assertFails(owner.collection('books').doc('active-loan').delete());
});

test('a reminder owner can cancel a pending reminder', async () => {
  await env.withSecurityRulesDisabled(async context => {
    await context.firestore().collection('requests').doc('reminder-1').set({
      type: 'return-reminder', ownerId: 'owner', requesterId: 'reader',
      status: 'pending', title: 'Book'
    });
  });
  const owner = env.authenticatedContext('owner').firestore();
  const reader = env.authenticatedContext('reader').firestore();
  await assertSucceeds(owner.collection('requests').doc('reminder-1').update({
    status: 'cancelled', cancellationReason: 'sender-cancelled', respondedAt: new Date()
  }));
  await assertFails(reader.collection('requests').doc('reminder-1').update({ status: 'completed', completedAt: new Date() }));
});

test('discovery searches are capped at ten documents', async () => {
  const alice = env.authenticatedContext('alice').firestore();
  await assertSucceeds(alice.collection('bookDiscovery').where('searchTokens', 'array-contains', 'har').limit(10).get());
  await assertFails(alice.collection('bookDiscovery').where('searchTokens', 'array-contains', 'har').get());
  assert.ok(true);
});

test('discovery cards are server-written and cannot carry private fields', async () => {
  const alice = env.authenticatedContext('alice').firestore();
  await assertFails(alice.collection('bookDiscovery').doc('private-card').set({
    bookId: 'private-card', ownerId: 'alice', title: 'Book', coverUrl: '', status: 'Available', searchTokens: ['book'],
    parentEmail: 'parent@example.com'
  }));
});

test('saved books are private, bounded records with one deterministic copy per reader', async () => {
  const alice = env.authenticatedContext('alice').firestore();
  const saved = {
    userId: 'alice', bookId: 'book-1', title: 'Book', author: 'Author', seriesName: '',
    coverUrl: '', ownerId: 'bob', ownerName: 'BobShelf', createdAt: new Date()
  };
  await assertSucceeds(alice.collection('savedBooks').doc('alice_book-1').set(saved));
  await assertFails(alice.collection('savedBooks').doc('alice_another-id').set(saved));
  await assertFails(alice.collection('savedBooks').doc('alice_book-2').set({ ...saved, bookId: 'book-2', privateNote: 'unbounded data' }));
  await assertFails(env.authenticatedContext('bob').firestore().collection('savedBooks').doc('alice_book-1').get());
});

test('a return reminder must belong to an active loan', async () => {
  const owner = env.authenticatedContext('owner').firestore();
  await assertFails(owner.collection('requests').doc('bad-reminder').set({
    type: 'return-reminder', ownerId: 'owner', requesterId: 'stranger', bookId: 'locked-book', status: 'pending'
  }));
  await env.withSecurityRulesDisabled(async context => {
    await context.firestore().collection('books').doc('active-reminder-book').set({
      ownerId: 'owner', ownerName: 'OwnerShelf', title: 'On loan', author: 'Author',
      status: 'Lent Out', borrowerId: 'reader'
    });
  });
  await assertSucceeds(owner.collection('requests').doc('good-reminder').set({
    type: 'return-reminder', ownerId: 'owner', requesterId: 'reader', bookId: 'active-reminder-book', status: 'pending'
  }));
});

test('ticker feeds are small and private where book activity is concerned', async () => {
  const alice = env.authenticatedContext('alice').firestore();
  const charlie = env.authenticatedContext('charlie').firestore();
  await assertSucceeds(alice.collection('tickerActivities').where('recipientId', '==', 'alice').orderBy('createdAt', 'desc').limit(6).get());
  await assertFails(charlie.collection('tickerActivities').doc('alice-book').get());
  await assertSucceeds(alice.collection('networkTicker').orderBy('createdAt', 'desc').limit(2).get());
  await assertFails(alice.collection('networkTicker').orderBy('createdAt', 'desc').limit(3).get());
});

test('ticker statistics keep personal details private and community records anonymous', async () => {
  const alice = env.authenticatedContext('alice').firestore();
  const bob = env.authenticatedContext('bob').firestore();
  await assertSucceeds(alice.collection('readerStats').doc('alice').get());
  await assertFails(bob.collection('readerStats').doc('alice').get());
  await assertSucceeds(alice.collection('networkStats').doc('current').get());
  await assertFails(alice.collection('networkStats').get());
});

test('score ledger entries are readable only by the reader they belong to', async () => {
  const alice = env.authenticatedContext('alice').firestore();
  const bob = env.authenticatedContext('bob').firestore();
  await assertSucceeds(alice.collection('ratingEvents').where('subjectId', '==', 'alice').limit(20).get());
  await assertFails(bob.collection('ratingEvents').where('subjectId', '==', 'alice').limit(20).get());
});
