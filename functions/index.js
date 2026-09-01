const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { FieldValue, Timestamp, getFirestore } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onDocumentCreated, onDocumentDeleted } = require('firebase-functions/v2/firestore');

initializeApp();
const db = getFirestore();
const runtime = { region: 'asia-south1', memory: '256MiB', timeoutSeconds: 30, maxInstances: 2 };
const callableRuntime = { ...runtime, invoker: 'public' };
const DAY_MS = 24 * 60 * 60 * 1000;

function requireUser(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Please sign in and try again.');
  return request.auth.uid;
}

function requireString(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new HttpsError('invalid-argument', `${name} is required.`);
  return value.trim();
}

function clampScore(value) {
  return Math.max(0, Math.min(10, Math.round(value * 10) / 10));
}

function discoveryRef(bookId) {
  return db.collection('bookDiscovery').doc(bookId);
}

async function acceptedFriendIds(userId) {
  const [sent, received] = await Promise.all([
    db.collection('friendships').where('user1', '==', userId).limit(76).get(),
    db.collection('friendships').where('user2', '==', userId).limit(76).get()
  ]);
  const friendIds = new Set();
  [...sent.docs, ...received.docs].forEach(doc => {
    const friendship = doc.data();
    if (friendship.status !== 'accepted') return;
    friendIds.add(friendship.user1 === userId ? friendship.user2 : friendship.user1);
  });
  return [...friendIds];
}

async function writeTickerActivities(recipientIds, eventKey, activity) {
  const recipients = [...new Set(recipientIds)].filter(Boolean);
  if (!recipients.length) return;
  const batch = db.batch();
  recipients.forEach(recipientId => {
    batch.set(db.collection('tickerActivities').doc(`${eventKey}-${recipientId}`), {
      recipientId,
      ...activity,
      createdAt: FieldValue.serverTimestamp()
    });
  });
  await batch.commit();
}

async function writeNewMemberActivity(userId, profile) {
  await db.collection('networkTicker').doc(`member-${userId}`).set({
    type: 'member-joined',
    actorId: userId,
    actorName: profile.libraryName || 'A new reader',
    actorPhotoURL: profile.photoURL || '',
    createdAt: FieldValue.serverTimestamp()
  });
}

async function writePublicBookActivity(eventKey, type, book) {
  const latestActivityIds = {
    'public-book-added': 'latest-book-added',
    'public-book-borrowed': 'latest-book-borrowed',
    'public-book-available': 'latest-book-available'
  };
  // Keep one anonymous record per category. This stays small regardless of
  // how active the community becomes, and never associates a reader with it.
  await db.collection('networkTicker').doc(latestActivityIds[type] || eventKey).set({
    type,
    title: book.title || 'Untitled book',
    coverUrl: book.coverUrl || '',
    createdAt: FieldValue.serverTimestamp()
  });
}

exports.respondToFriendRequest = onCall(callableRuntime, async request => {
  const uid = requireUser(request);
  const requestId = requireString(request.data?.requestId, 'requestId');
  const action = request.data?.action;
  if (!['accepted', 'declined'].includes(action)) throw new HttpsError('invalid-argument', 'Invalid friend request action.');
  const friendshipRef = db.collection('friendships').doc(requestId);
  return db.runTransaction(async tx => {
    const snap = await tx.get(friendshipRef);
    if (!snap.exists) throw new HttpsError('not-found', 'Friend request no longer exists.');
    const friendship = snap.data();
    if (friendship.user2 !== uid || friendship.status !== 'pending') throw new HttpsError('permission-denied', 'This friend request cannot be changed.');
    if (action === 'accepted') {
      const [firstShelf, secondShelf] = await Promise.all([
        tx.get(db.collection('books').where('ownerId', '==', friendship.user1).limit(76)),
        tx.get(db.collection('books').where('ownerId', '==', friendship.user2).limit(76))
      ]);
      if (firstShelf.size + secondShelf.size > 150) throw new HttpsError('resource-exhausted', 'One of these shelves is too large to connect right now.');
      firstShelf.docs.forEach(doc => tx.update(doc.ref, { readerIds: FieldValue.arrayUnion(friendship.user2) }));
      secondShelf.docs.forEach(doc => tx.update(doc.ref, { readerIds: FieldValue.arrayUnion(friendship.user1) }));
    }
    tx.update(friendshipRef, { status: action, respondedAt: FieldValue.serverTimestamp() });
    return { action };
  });
});

exports.removeFriend = onCall(callableRuntime, async request => {
  const uid = requireUser(request);
  const friendshipId = requireString(request.data?.friendshipId, 'friendshipId');
  const friendshipRef = db.collection('friendships').doc(friendshipId);
  return db.runTransaction(async tx => {
    const snap = await tx.get(friendshipRef);
    if (!snap.exists) throw new HttpsError('not-found', 'Friendship no longer exists.');
    const friendship = snap.data();
    if (friendship.status !== 'accepted' || (friendship.user1 !== uid && friendship.user2 !== uid)) throw new HttpsError('permission-denied', 'This friendship cannot be removed.');
    const [firstShelf, secondShelf] = await Promise.all([
      tx.get(db.collection('books').where('ownerId', '==', friendship.user1).limit(76)),
      tx.get(db.collection('books').where('ownerId', '==', friendship.user2).limit(76))
    ]);
    if (firstShelf.size + secondShelf.size > 150) throw new HttpsError('resource-exhausted', 'One of these shelves is too large to disconnect right now.');
    firstShelf.docs.forEach(doc => tx.update(doc.ref, { readerIds: FieldValue.arrayRemove(friendship.user2) }));
    secondShelf.docs.forEach(doc => tx.update(doc.ref, { readerIds: FieldValue.arrayRemove(friendship.user1) }));
    tx.delete(friendshipRef);
    return { removed: true };
  });
});

exports.cleanUpMyInbox = onCall(callableRuntime, async request => {
  const uid = requireUser(request);
  const [owned, requested, incomingFriendships] = await Promise.all([
    db.collection('requests').where('ownerId', '==', uid).limit(100).get(),
    db.collection('requests').where('requesterId', '==', uid).limit(100).get(),
    db.collection('friendships').where('user2', '==', uid).limit(100).get()
  ]);
  const pendingRequests = [...owned.docs, ...requested.docs].filter(doc => doc.data().status === 'pending');
  const pendingFriendships = incomingFriendships.docs.filter(doc => doc.data().status === 'pending');
  const profileIds = new Set();
  pendingRequests.forEach(doc => {
    const data = doc.data();
    profileIds.add(data.ownerId === uid ? data.requesterId : data.ownerId);
  });
  pendingFriendships.forEach(doc => profileIds.add(doc.data().user1));
  const profiles = await Promise.all([...profileIds].map(id => db.collection('profiles').doc(id).get()));
  const missingProfiles = new Set(profiles.filter(doc => !doc.exists).map(doc => doc.id));
  const pendingReminders = pendingRequests.filter(doc => doc.data().type === 'return-reminder');
  const reminderBookIds = [...new Set(pendingReminders.map(doc => doc.data().bookId).filter(Boolean))];
  const reminderBooks = new Map((await Promise.all(reminderBookIds.map(id => db.collection('books').doc(id).get())))
    .map(doc => [doc.id, doc]));
  const batch = db.batch();
  let cleaned = 0;
  const cancellations = new Map();
  pendingRequests.forEach(doc => {
    const data = doc.data();
    const otherId = data.ownerId === uid ? data.requesterId : data.ownerId;
    if (!missingProfiles.has(otherId)) return;
    cancellations.set(doc.id, { ref: doc.ref, reason: 'account-deleted' });
  });
  const newestReminderByLoan = new Set();
  pendingReminders
    .sort((a, b) => (b.data().createdAt?.toMillis?.() || 0) - (a.data().createdAt?.toMillis?.() || 0))
    .forEach(doc => {
      if (cancellations.has(doc.id)) return;
      const reminder = doc.data();
      const book = reminderBooks.get(reminder.bookId);
      if (!book?.exists || book.data().status !== 'Lent Out' || book.data().borrowerId !== reminder.requesterId) {
        cancellations.set(doc.id, { ref: doc.ref, reason: 'loan-closed' });
        return;
      }
      const loanKey = `${reminder.ownerId}:${reminder.requesterId}:${reminder.bookId}`;
      if (newestReminderByLoan.has(loanKey)) {
        cancellations.set(doc.id, { ref: doc.ref, reason: 'duplicate-reminder' });
        return;
      }
      newestReminderByLoan.add(loanKey);
    });
  pendingFriendships.forEach(doc => {
    if (!missingProfiles.has(doc.data().user1)) return;
    cleaned += 1;
    batch.delete(doc.ref);
  });
  cancellations.forEach(({ ref, reason }) => {
    cleaned += 1;
    batch.update(ref, { status: 'cancelled', cancellationReason: reason, respondedAt: FieldValue.serverTimestamp() });
  });
  if (cleaned) await batch.commit();
  return { cleaned };
});

exports.respondToBorrowRequest = onCall(callableRuntime, async request => {
  const uid = requireUser(request);
  const requestId = requireString(request.data?.requestId, 'requestId');
  const action = request.data?.action;
  if (!['approved', 'denied'].includes(action)) throw new HttpsError('invalid-argument', 'Invalid borrow request action.');
  const requestRef = db.collection('requests').doc(requestId);
  const result = await db.runTransaction(async tx => {
    const requestSnap = await tx.get(requestRef);
    if (!requestSnap.exists) throw new HttpsError('not-found', 'Borrow request no longer exists.');
    const loan = requestSnap.data();
    if (loan.type !== 'borrow' || loan.ownerId !== uid || loan.status !== 'pending') throw new HttpsError('permission-denied', 'This borrow request cannot be changed.');
    if (action === 'denied') {
      tx.update(requestRef, { status: 'denied', respondedAt: FieldValue.serverTimestamp() });
      return { action };
    }
    const bookRef = db.collection('books').doc(loan.bookId);
    const borrowerStatsRef = db.collection('readerStats').doc(loan.requesterId);
    const ownerStatsRef = db.collection('readerStats').doc(uid);
    const bookStatsRef = db.collection('bookLoanStats').doc(loan.bookId);
    const networkStatsRef = db.collection('networkStats').doc('current');
    const [bookSnap, activeLoans, pendingRequests, borrowerStatsSnap, ownerStatsSnap, bookStatsSnap, networkStatsSnap] = await Promise.all([
      tx.get(bookRef),
      tx.get(db.collection('books').where('borrowerId', '==', loan.requesterId).where('status', '==', 'Lent Out').limit(4)),
      tx.get(db.collection('requests').where('bookId', '==', loan.bookId).where('status', '==', 'pending').limit(100)),
      tx.get(borrowerStatsRef), tx.get(ownerStatsRef), tx.get(bookStatsRef), tx.get(networkStatsRef)
    ]);
    if (!bookSnap.exists || bookSnap.data().ownerId !== uid || bookSnap.data().status !== 'Available') throw new HttpsError('failed-precondition', 'This book is no longer available.');
    if (!Array.isArray(bookSnap.data().readerIds) || !bookSnap.data().readerIds.includes(loan.requesterId)) throw new HttpsError('permission-denied', 'Only a confirmed friend can borrow this book.');
    if (activeLoans.size >= 3) throw new HttpsError('failed-precondition', 'This reader already has three active loans.');
    const dueAt = Timestamp.fromMillis(Date.now() + 14 * DAY_MS);
    tx.update(requestRef, { status: 'approved', respondedAt: FieldValue.serverTimestamp(), loanDueAt: dueAt });
    tx.update(bookRef, {
      status: 'Lent Out', borrowerId: loan.requesterId, borrowerName: loan.requesterName || 'Reader',
      lentAt: FieldValue.serverTimestamp(), loanDueAt: dueAt, activeRequestId: requestId, updatedAt: FieldValue.serverTimestamp()
    });
    tx.set(discoveryRef(loan.bookId), { status: 'Lent Out', updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    const nextBorrowedTotal = Number(borrowerStatsSnap.data()?.totalBorrowed || 0) + 1;
    const nextBookLoanCount = Number(bookStatsSnap.data()?.loanCount || 0) + 1;
    const ownerStats = ownerStatsSnap.data() || {};
    const ownerMostBorrowed = Math.max(Number(ownerStats.mostBorrowedCount || 0), nextBookLoanCount);
    const networkStats = networkStatsSnap.data() || {};
    tx.set(borrowerStatsRef, { totalBorrowed: nextBorrowedTotal, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    tx.set(bookStatsRef, { ownerId: uid, loanCount: nextBookLoanCount, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    tx.set(ownerStatsRef, {
      mostBorrowedTitle: nextBookLoanCount >= Number(ownerStats.mostBorrowedCount || 0) ? bookSnap.data().title || 'Untitled book' : ownerStats.mostBorrowedTitle || '',
      mostBorrowedCount: ownerMostBorrowed,
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    tx.set(networkStatsRef, {
      totalLoans: Number(networkStats.totalLoans || 0) + 1,
      activeLoans: Number(networkStats.activeLoans || 0) + 1,
      highestMemberBorrowed: Math.max(Number(networkStats.highestMemberBorrowed || 0), nextBorrowedTotal),
      mostBorrowedTitle: nextBookLoanCount >= Number(networkStats.mostBorrowedCount || 0) ? bookSnap.data().title || 'Untitled book' : networkStats.mostBorrowedTitle || '',
      mostBorrowedCoverUrl: nextBookLoanCount >= Number(networkStats.mostBorrowedCount || 0) ? bookSnap.data().coverUrl || '' : networkStats.mostBorrowedCoverUrl || '',
      mostBorrowedCount: Math.max(Number(networkStats.mostBorrowedCount || 0), nextBookLoanCount),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    pendingRequests.docs.filter(doc => doc.id !== requestId).forEach(doc => {
      tx.update(doc.ref, { status: 'denied', denialReason: 'book-unavailable', respondedAt: FieldValue.serverTimestamp() });
    });
    return {
      action, dueAt: dueAt.toDate().toISOString(), ownerId: uid,
      ownerName: bookSnap.data().ownerName || 'A friend', borrowerId: loan.requesterId,
      borrowerName: loan.requesterName || 'Reader', title: bookSnap.data().title || 'Untitled book', coverUrl: bookSnap.data().coverUrl || ''
    };
  });
  if (result.action === 'approved') {
    await Promise.all([
      writeTickerActivities([result.ownerId], `borrowed-owner-${requestId}`, {
        type: 'book-borrowed-owner', actorId: result.borrowerId, actorName: result.borrowerName, title: result.title
      }),
      writeTickerActivities([result.borrowerId], `borrowed-reader-${requestId}`, {
        type: 'book-borrowed-reader', actorId: result.ownerId, actorName: result.ownerName, title: result.title
      }),
      writePublicBookActivity(`borrowed-${requestId}`, 'public-book-borrowed', result)
    ]).catch(err => console.error('Could not write borrow activity', err));
  }
  return result;
});

exports.closeLoan = onCall(callableRuntime, async request => {
  const uid = requireUser(request);
  const bookId = requireString(request.data?.bookId, 'bookId');
  const outcome = request.data?.outcome;
  if (!['returned', 'lost'].includes(outcome)) throw new HttpsError('invalid-argument', 'Invalid loan outcome.');
  const bookRef = db.collection('books').doc(bookId);
  const result = await db.runTransaction(async tx => {
    const bookSnap = await tx.get(bookRef);
    if (!bookSnap.exists) throw new HttpsError('not-found', 'Book no longer exists.');
    const book = bookSnap.data();
    if (book.ownerId !== uid || book.status !== 'Lent Out' || !book.borrowerId) throw new HttpsError('failed-precondition', 'This book is not an active loan.');
    const requestRef = book.activeRequestId ? db.collection('requests').doc(book.activeRequestId) : null;
    const networkStatsRef = db.collection('networkStats').doc('current');
    const [profileSnap, requestSnap, networkStatsSnap] = await Promise.all([
      tx.get(db.collection('profiles').doc(book.borrowerId)),
      requestRef ? tx.get(requestRef) : Promise.resolve(null),
      tx.get(networkStatsRef)
    ]);
    const now = Date.now();
    const heldFor = now - (book.lentAt?.toMillis?.() || now);
    const onTime = !book.loanDueAt?.toMillis || now <= book.loanDueAt.toMillis();
    const points = outcome === 'lost' ? -3 : (heldFor >= 2 * DAY_MS && onTime ? 1 : (onTime ? 0 : -1));
    const profile = profileSnap.exists ? profileSnap.data() : {};
    const ratingAdjustment = Number(profile.ratingAdjustment || 0) + points;
    const ratingScore = clampScore(3 + Math.min(2, Number(profile.bookCount || 0) * 0.2) + ratingAdjustment);
    tx.set(db.collection('profiles').doc(book.borrowerId), {
      ratingAdjustment, ratingScore,
      timelyReturns: Number(profile.timelyReturns || 0) + (points > 0 ? 1 : 0),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    tx.update(bookRef, outcome === 'lost' ? {
      status: 'Lost', lostAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()
    } : {
      status: 'Available', borrowerId: FieldValue.delete(), borrowerName: FieldValue.delete(),
      lentAt: FieldValue.delete(), loanDueAt: FieldValue.delete(), activeRequestId: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp()
    });
    tx.set(discoveryRef(bookId), { status: outcome === 'lost' ? 'Lost' : 'Available', updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    const networkStats = networkStatsSnap.data() || {};
    tx.set(networkStatsRef, {
      activeLoans: Math.max(0, Number(networkStats.activeLoans || 0) - 1),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    if (requestSnap?.exists) tx.update(requestRef, { status: outcome === 'lost' ? 'lost' : 'returned', returnRatingPoints: points, returnedAt: FieldValue.serverTimestamp() });
    return { outcome, points, ownerId: book.ownerId, ownerName: book.ownerName || 'A friend', title: book.title || 'Untitled book', coverUrl: book.coverUrl || '', requestId: book.activeRequestId || '' };
  });
  if (outcome === 'returned') {
    const friends = await acceptedFriendIds(result.ownerId);
    await writeTickerActivities(friends, `available-${bookId}-${result.requestId || 'returned'}`, {
      type: 'book-available', actorId: result.ownerId, actorName: result.ownerName,
      ownerId: result.ownerId, title: result.title
    }).catch(err => console.error('Could not write return activity', err));
    await writePublicBookActivity(`available-${bookId}-${result.requestId || 'returned'}`, 'public-book-available', result)
      .catch(err => console.error('Could not write public return activity', err));
  }
  return result;
});

async function refreshBookCount(ownerId) {
  const [profileSnap, countSnap] = await Promise.all([
    db.collection('profiles').doc(ownerId).get(),
    db.collection('books').where('ownerId', '==', ownerId).count().get()
  ]);
  if (!profileSnap.exists) return;
  const profile = profileSnap.data();
  const bookCount = countSnap.data().count;
  const ratingScore = clampScore(3 + Math.min(2, bookCount * 0.2) + Number(profile.ratingAdjustment || 0));
  await profileSnap.ref.update({ bookCount, ratingScore, updatedAt: FieldValue.serverTimestamp() });
}

async function notifyWishers(bookId, book) {
  const titleKey = String(book.title || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!titleKey || !Array.isArray(book.readerIds) || !book.readerIds.length) return;
  const wishes = await db.collection('wishlists').where('titleKey', '==', titleKey).limit(50).get();
  const batch = db.batch();
  wishes.docs.forEach(wish => {
    const data = wish.data();
    if (book.readerIds.includes(data.userId)) {
      batch.set(db.collection('requests').doc(`wishlist-${bookId}-${wish.id}`), {
        type: 'wishlist-match', bookId, title: book.title || 'Untitled book',
        ownerId: book.ownerId, ownerName: book.ownerName || 'A friend',
        requesterId: data.userId, requesterName: data.userName || 'Friend',
        status: 'completed', createdAt: FieldValue.serverTimestamp()
      });
      batch.set(db.collection('tickerActivities').doc(`wishlist-${bookId}-${wish.id}-${data.userId}`), {
        recipientId: data.userId, type: 'wishlist-match', actorId: book.ownerId,
        actorName: book.ownerName || 'A friend', ownerId: book.ownerId,
        title: book.title || 'Untitled book', createdAt: FieldValue.serverTimestamp()
      });
    }
  });
  if (wishes.size) await batch.commit();
}

exports.onBookCreated = onDocumentCreated({ ...runtime, document: 'books/{bookId}' }, event => {
  const book = event.data.data();
  return acceptedFriendIds(book.ownerId).then(readerIds => Promise.all([
    event.data.ref.update({ readerIds }),
    refreshBookCount(book.ownerId),
    notifyWishers(event.params.bookId, { ...book, readerIds }),
    writeTickerActivities(readerIds, `added-${event.params.bookId}`, {
      type: book.status === 'Available' ? 'book-added' : 'book-reading',
      actorId: book.ownerId, actorName: book.ownerName || 'A friend',
      ownerId: book.ownerId, title: book.title || 'Untitled book'
    }),
    writePublicBookActivity(`added-${event.params.bookId}`, 'public-book-added', book)
  ]));
});
exports.onProfileCreated = onDocumentCreated({ ...runtime, document: 'profiles/{userId}' }, event =>
  writeNewMemberActivity(event.params.userId, event.data.data())
);
exports.onBookDeleted = onDocumentDeleted({ ...runtime, document: 'books/{bookId}' }, event => {
  const book = event.data.data();
  return Promise.all([
    discoveryRef(event.params.bookId).delete(),
    refreshBookCount(book.ownerId)
  ]);
});

async function deleteQuery(query) {
  while (true) {
    const snapshot = await query.limit(200).get();
    if (snapshot.empty) return;
    const batch = db.batch();
    snapshot.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
  }
}

async function deleteOwnedBooks(ownerId) {
  while (true) {
    const snapshot = await db.collection('books').where('ownerId', '==', ownerId).limit(200).get();
    if (snapshot.empty) return;
    const batch = db.batch();
    snapshot.docs.forEach(book => {
      batch.delete(book.ref);
      batch.delete(discoveryRef(book.id));
    });
    await batch.commit();
  }
}

async function closePendingAccountRequests(userId) {
  async function close(query, reason) {
    while (true) {
      const snapshot = await query.limit(200).get();
      if (snapshot.empty) return;
      const batch = db.batch();
      snapshot.docs.forEach(doc => batch.update(doc.ref, {
        status: 'cancelled', cancellationReason: reason, respondedAt: FieldValue.serverTimestamp()
      }));
      await batch.commit();
    }
  }
  await Promise.all([
    close(db.collection('requests').where('requesterId', '==', userId).where('status', '==', 'pending'), 'requester-account-deleted'),
    close(db.collection('requests').where('ownerId', '==', userId).where('status', '==', 'pending'), 'owner-account-deleted')
  ]);
}

async function notifyFriendsOfAccountDeletion(userId, readerName) {
  const [sent, received] = await Promise.all([
    db.collection('friendships').where('user1', '==', userId).limit(100).get(),
    db.collection('friendships').where('user2', '==', userId).limit(100).get()
  ]);
  const friendIds = new Set();
  [...sent.docs, ...received.docs].forEach(doc => {
    const friendship = doc.data();
    if (friendship.status === 'accepted') friendIds.add(friendship.user1 === userId ? friendship.user2 : friendship.user1);
  });
  if (!friendIds.size) return;
  const batch = db.batch();
  friendIds.forEach(friendId => batch.set(db.collection('requests').doc(), {
    type: 'account-deleted', ownerId: friendId, requesterId: userId,
    requesterName: readerName || 'A reader', status: 'completed', createdAt: FieldValue.serverTimestamp()
  }));
  await batch.commit();
}

exports.deleteMyAccount = onCall(callableRuntime, async request => {
  const uid = requireUser(request);
  if (request.data?.confirmation !== 'DELETE') throw new HttpsError('invalid-argument', 'Type DELETE to confirm account removal.');
  const [ownedLoans, borrowedLoans, profile] = await Promise.all([
    db.collection('books').where('ownerId', '==', uid).where('status', '==', 'Lent Out').limit(1).get(),
    db.collection('books').where('borrowerId', '==', uid).where('status', '==', 'Lent Out').limit(1).get(),
    db.collection('profiles').doc(uid).get()
  ]);
  if (!ownedLoans.empty || !borrowedLoans.empty) {
    throw new HttpsError('failed-precondition', 'Return or close every active loan before deleting this account.');
  }
  await closePendingAccountRequests(uid);
  await notifyFriendsOfAccountDeletion(uid, profile.exists ? profile.data().libraryName : 'A reader');
  await deleteOwnedBooks(uid);
  await Promise.all([
    deleteQuery(db.collection('friendships').where('user1', '==', uid)),
    deleteQuery(db.collection('friendships').where('user2', '==', uid)),
    deleteQuery(db.collection('wishlists').where('userId', '==', uid)),
    deleteQuery(db.collection('ratingEvents').where('subjectId', '==', uid))
  ]);
  const batch = db.batch();
  if (profile.exists && profile.data().shelfKey) batch.delete(db.collection('shelfNames').doc(profile.data().shelfKey));
  batch.delete(db.collection('profiles').doc(uid));
  await batch.commit();
  await getStorage().bucket().deleteFiles({ prefix: `covers/${uid}/`, force: true }).catch(() => undefined);
  await getAuth().deleteUser(uid);
  return { deleted: true };
});
