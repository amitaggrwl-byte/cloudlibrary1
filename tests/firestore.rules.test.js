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
      status: 'Available', readerIds: ['bob'], discoveryVersion: 1
    });
    await store.collection('profiles').doc('owner').set(profile('OwnerShelf'));
    await store.collection('books').doc('locked-book').set({
      ownerId: 'owner', ownerName: 'OwnerShelf', title: 'Locked book', author: 'Author',
      status: 'Available', readerIds: ['reader'], discoveryVersion: 1
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
    memberSince: new Date(),
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
  await assertSucceeds(env.authenticatedContext('bob').firestore().collection('books').where('ownerId', '==', 'alice').where('readerIds', 'array-contains', 'bob').limit(10).get());
  await assertFails(env.authenticatedContext('charlie').firestore().collection('books').where('ownerId', '==', 'alice').limit(10).get());
});

test('the browser cannot lend a book or change a score directly', async () => {
  const owner = env.authenticatedContext('owner').firestore();
  await assertFails(owner.collection('books').doc('locked-book').update({ status: 'Lent Out', borrowerId: 'reader' }));
  await assertFails(owner.collection('books').doc('locked-book').update({ readerIds: ['reader', 'stranger'] }));
  await assertFails(owner.collection('profiles').doc('owner').update({ ratingScore: 10 }));
  await assertFails(owner.collection('books').doc('self-shared').set({ ownerId: 'owner', title: 'Private', status: 'Available', readerIds: ['stranger'] }));
});

test('an owner can delete an available book but not an active loan', async () => {
  const owner = env.authenticatedContext('owner').firestore();
  await assertSucceeds(owner.collection('books').doc('locked-book').delete());
  await env.withSecurityRulesDisabled(async context => {
    await context.firestore().collection('books').doc('active-loan').set({
      ownerId: 'owner', ownerName: 'OwnerShelf', title: 'On loan', author: 'Author',
      status: 'Lent Out', borrowerId: 'reader', readerIds: ['reader']
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
