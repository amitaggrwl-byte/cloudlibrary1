const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { FieldValue, Timestamp, getFirestore } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onDocumentCreated, onDocumentUpdated, onDocumentDeleted } = require('firebase-functions/v2/firestore');

initializeApp();
const db = getFirestore();
const runtime = { region: 'asia-south1', memory: '256MiB', timeoutSeconds: 30, maxInstances: 2 };
const callableRuntime = { ...runtime, invoker: 'public' };
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_CIRCLE_LIMIT = 5;
const MAX_CIRCLE_LIMIT = 20;
const MAX_ACTIVE_LOANS = 3;
const MAX_PENDING_BORROW_REQUESTS = 5;
const MAX_PENDING_REQUESTS_PER_TITLE = 2;
const STARTER_CIRCLES = [
  ['hxls', 'HXLS', 'School'],
  ['grade-1', 'Grade 1', 'Grade'], ['grade-2', 'Grade 2', 'Grade'], ['grade-3', 'Grade 3', 'Grade'],
  ['grade-4', 'Grade 4', 'Grade'], ['grade-5', 'Grade 5', 'Grade'], ['grade-6', 'Grade 6', 'Grade'],
  ['grade-7', 'Grade 7', 'Grade'], ['grade-8', 'Grade 8', 'Grade'], ['grade-9', 'Grade 9', 'Grade'],
  ['grade-10', 'Grade 10', 'Grade'], ['grade-11', 'Grade 11', 'Grade'], ['grade-12', 'Grade 12', 'Grade'],
  ['gurgaon', 'Gurgaon', 'Locality'], ['dlf-phase-5', 'DLF Phase 5', 'Locality'],
  ['sushant-lok', 'Sushant Lok', 'Locality'], ['south-city', 'South City', 'Locality'],
  ['nirvana-country', 'Nirvana Country', 'Locality'], ['golf-course-road', 'Golf Course Road', 'Locality'],
  ['fantasy-adventures', 'Fantasy & Adventures', 'Genre'], ['mystery-detectives', 'Mystery Detectives', 'Genre'],
  ['science-explorers', 'Science Explorers', 'Genre'], ['comics-manga', 'Comics & Manga', 'Genre'],
  ['mythology-legends', 'Mythology & Legends', 'Genre'], ['book-club', 'Book Club', 'Club'],
  ['comic-club', 'Comic Club', 'Club'], ['science-club', 'Science Club', 'Club'],
  ['harry-potter', 'Harry Potter Readers', 'Fan group'], ['percy-jackson', 'Percy Jackson Readers', 'Fan group'],
  ['wimpy-kid', 'Wimpy Kid Readers', 'Fan group'], ['roald-dahl', 'Roald Dahl Readers', 'Fan group']
];

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

function readerScore(bookCount, ratingAdjustment) {
  // A full shelf helps, but dependable lending matters more than sheer volume.
  return clampScore(3 + Math.min(1.5, Number(bookCount || 0) * 0.15) + Number(ratingAdjustment || 0));
}

function normalizedTitle(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function suggestionBucket(bookId) {
  // A stable, evenly spread position gives each book a chance to be suggested
  // without changing its place every time the owner edits its details.
  let hash = 2166136261;
  for (const character of String(bookId || '')) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967296;
}

function discoveryRef(bookId) {
  return db.collection('bookDiscovery').doc(bookId);
}

function friendshipId(firstUserId, secondUserId) {
  return [firstUserId, secondUserId].sort().join('__');
}

function friendshipRef(firstUserId, secondUserId) {
  return db.collection('friendships').doc(friendshipId(firstUserId, secondUserId));
}

function incrementNetworkStat(field, amount = 1) {
  return db.collection('networkStats').doc('current').set({
    [field]: FieldValue.increment(amount),
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
}

async function requireCommunityAdmin(request) {
  const uid = requireUser(request);
  const config = await db.collection('appConfig').doc('community').get();
  const adminUserIds = config.data()?.adminUserIds;
  if (!Array.isArray(adminUserIds) || !adminUserIds.includes(uid)) {
    throw new HttpsError('permission-denied', 'Only a CloudLibrary administrator can refresh community statistics.');
  }
  return uid;
}

function circleLimitFromConfig(config) {
  const configuredLimit = Number(config?.circleLimit || DEFAULT_CIRCLE_LIMIT);
  return Math.max(1, Math.min(MAX_CIRCLE_LIMIT, configuredLimit));
}

async function collectionCount(query) {
  const snapshot = await query.count().get();
  return Number(snapshot.data().count || 0);
}

function discoveryData(bookId, book) {
  const tokens = new Set();
  [book.title, book.author, book.seriesName].filter(Boolean).forEach(value => {
    String(value).toLowerCase().match(/[a-z0-9]+/g)?.forEach(word => {
      for (let index = 1; index <= Math.min(word.length, 24); index += 1) tokens.add(word.slice(0, index));
    });
  });
  return {
    bookId,
    // This compact record powers community discovery. It contains only the
    // shelf name and book-facing metadata, never an email or account detail.
    ownerId: book.ownerId,
    ownerName: book.ownerName || 'A reader',
    title: book.title || 'Untitled book',
    author: book.author || '',
    seriesName: book.seriesName || '',
    seriesNumber: Number.isFinite(Number(book.seriesNumber)) ? Number(book.seriesNumber) : null,
    genre: book.genre || '',
    publishedYear: Number.isFinite(Number(book.publishedYear)) ? Number(book.publishedYear) : null,
    rating: Math.max(0, Math.min(5, Number(book.rating || 0))),
    coverUrl: book.coverUrl || '',
    status: book.status || 'Available',
    // Lets the client pick one inexpensive, varied community suggestion
    // without scanning the whole discovery collection.
    suggestionBucket: suggestionBucket(bookId),
    searchTokens: [...tokens],
    updatedAt: FieldValue.serverTimestamp()
  };
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

async function confirmedFriendship(tx, firstUserId, secondUserId) {
  const friendship = await tx.get(friendshipRef(firstUserId, secondUserId));
  if (friendship.exists && friendship.data().status === 'accepted') return true;
  // Temporary migration bridge for relationship records created before the
  // deterministic friendship key was introduced.
  const [sent, received] = await Promise.all([
    tx.get(db.collection('friendships').where('user1', '==', firstUserId).where('user2', '==', secondUserId).limit(1)),
    tx.get(db.collection('friendships').where('user1', '==', secondUserId).where('user2', '==', firstUserId).limit(1))
  ]);
  return [...sent.docs, ...received.docs].some(doc => doc.data().status === 'accepted');
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
    bookId: book.bookId || book.id || '',
    title: book.title || 'Untitled book',
    seriesName: book.seriesName || '',
    coverUrl: book.coverUrl || '',
    createdAt: FieldValue.serverTimestamp()
  });
}

async function clearBookTicker(bookId) {
  const [publicItems, friendItems] = await Promise.all([
    db.collection('networkTicker').where('bookId', '==', bookId).limit(10).get(),
    db.collection('tickerActivities').where('bookId', '==', bookId).limit(200).get()
  ]);
  const batch = db.batch();
  [...publicItems.docs, ...friendItems.docs].forEach(doc => batch.delete(doc.ref));
  if (!publicItems.empty || !friendItems.empty) await batch.commit();
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
      tx.set(db.collection('networkStats').doc('current'), { totalFriendships: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
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
    tx.delete(friendshipRef);
    tx.set(db.collection('networkStats').doc('current'), { totalFriendships: FieldValue.increment(-1), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return { removed: true };
  });
});

// Older builds used random document IDs for friendships. A reader may safely
// normalize only their own records; no relationship is created or accepted by
// this migration, it merely gives the existing record its predictable key.
exports.normalizeMyFriendships = onCall(callableRuntime, async request => {
  const uid = requireUser(request);
  const friendshipIds = Array.isArray(request.data?.friendshipIds) ? request.data.friendshipIds : [];
  if (!friendshipIds.length) return { migrated: 0 };
  if (friendshipIds.length > 100 || friendshipIds.some(id => typeof id !== 'string' || !id)) {
    throw new HttpsError('invalid-argument', 'Invalid friendship migration request.');
  }
  const sourceRefs = friendshipIds.map(id => db.collection('friendships').doc(id));
  const sourceDocs = await db.getAll(...sourceRefs);
  const targets = sourceDocs.map(snap => {
    if (!snap.exists) return null;
    const friendship = snap.data();
    if (friendship.user1 !== uid && friendship.user2 !== uid) {
      throw new HttpsError('permission-denied', 'You can only migrate your own friendships.');
    }
    return { source: snap, target: friendshipRef(friendship.user1, friendship.user2), data: friendship };
  }).filter(Boolean);
  if (!targets.length) return { migrated: 0 };
  const targetDocs = await db.getAll(...targets.map(item => item.target));
  const batch = db.batch();
  let migrated = 0;
  targets.forEach((item, index) => {
    if (item.source.id === item.target.id) return;
    if (!targetDocs[index].exists) batch.set(item.target, item.data);
    batch.delete(item.source.ref);
    migrated += 1;
  });
  if (migrated) await batch.commit();
  return { migrated };
});

exports.joinCircle = onCall(callableRuntime, async request => {
  const uid = requireUser(request);
  const circleId = requireString(request.data?.circleId, 'circleId');
  const circleRef = db.collection('circles').doc(circleId);
  const membershipRef = db.collection('circleMemberships').doc(`${uid}_${circleId}`);
  return db.runTransaction(async tx => {
    const [circleSnap, profileSnap, memberships, configSnap] = await Promise.all([
      tx.get(circleRef), tx.get(db.collection('profiles').doc(uid)),
      tx.get(db.collection('circleMemberships').where('userId', '==', uid).limit(MAX_CIRCLE_LIMIT + 1)),
      tx.get(db.collection('appConfig').doc('community'))
    ]);
    if (!circleSnap.exists || circleSnap.data().active !== true) throw new HttpsError('not-found', 'This circle is not available.');
    if (!profileSnap.exists) throw new HttpsError('failed-precondition', 'Create your reader profile before joining circles.');
    if (memberships.docs.some(doc => doc.id === membershipRef.id)) return { joined: false, alreadyMember: true };
    const circleLimit = circleLimitFromConfig(configSnap.data());
    if (memberships.size >= circleLimit) throw new HttpsError('resource-exhausted', `You can join up to ${circleLimit} circles.`);
    const circle = circleSnap.data();
    const tags = Array.isArray(profileSnap.data().circleTags) ? profileSnap.data().circleTags : [];
    tx.set(membershipRef, { userId: uid, circleId, circleName: circle.name || 'Circle', category: circle.category || 'Community', joinedAt: FieldValue.serverTimestamp() });
    tx.update(profileSnap.ref, { circleTags: [...new Set([...tags, circle.name || 'Circle'])].slice(0, circleLimit), updatedAt: FieldValue.serverTimestamp() });
    return { joined: true };
  });
});

exports.getCircleSettings = onCall(callableRuntime, async request => {
  const uid = requireUser(request);
  const configSnap = await db.collection('appConfig').doc('community').get();
  const config = configSnap.data() || {};
  return {
    circleLimit: circleLimitFromConfig(config),
    isAdmin: Array.isArray(config.adminUserIds) && config.adminUserIds.includes(uid),
    isConfigured: configSnap.exists
  };
});

exports.installStarterCircles = onCall(callableRuntime, async request => {
  await requireCommunityAdmin(request);
  const refs = STARTER_CIRCLES.map(([circleId]) => db.collection('circles').doc(circleId));
  const existing = await db.getAll(...refs);
  const batch = db.batch();
  let created = 0;
  existing.forEach((snap, index) => {
    const [circleId, name, category] = STARTER_CIRCLES[index];
    if (snap.exists) {
      if (snap.data().category === 'Society') batch.update(snap.ref, { category: 'Locality', updatedAt: FieldValue.serverTimestamp() });
      return;
    }
    batch.set(snap.ref, { circleId, name, category, active: true, bootstrap: true, createdAt: FieldValue.serverTimestamp() });
    created += 1;
  });
  if (created || existing.some(snap => snap.exists && snap.data().category === 'Society')) {
    await batch.commit();
    if (created) await incrementNetworkStat('totalCircles', created);
  }
  return { created, total: STARTER_CIRCLES.length };
});

exports.createCircle = onCall(callableRuntime, async request => {
  await requireCommunityAdmin(request);
  const name = requireString(request.data?.name, 'Circle name').slice(0, 60);
  const category = requireString(request.data?.category, 'Circle category').slice(0, 40);
  const circleRef = db.collection('circles').doc();
  await circleRef.set({ circleId: circleRef.id, name, category, active: true, bootstrap: false, createdAt: FieldValue.serverTimestamp() });
  return { id: circleRef.id, name, category };
});

exports.archiveCircle = onCall(callableRuntime, async request => {
  await requireCommunityAdmin(request);
  const circleId = requireString(request.data?.circleId, 'circleId');
  const circleRef = db.collection('circles').doc(circleId);
  const circle = await circleRef.get();
  if (!circle.exists) throw new HttpsError('not-found', 'This circle no longer exists.');
  await circleRef.update({ active: false, archivedAt: FieldValue.serverTimestamp() });
  return { archived: true };
});

exports.leaveCircle = onCall(callableRuntime, async request => {
  const uid = requireUser(request);
  const circleId = requireString(request.data?.circleId, 'circleId');
  const membershipRef = db.collection('circleMemberships').doc(`${uid}_${circleId}`);
  return db.runTransaction(async tx => {
    const [membershipSnap, profileSnap] = await Promise.all([tx.get(membershipRef), tx.get(db.collection('profiles').doc(uid))]);
    if (!membershipSnap.exists || membershipSnap.data().userId !== uid) throw new HttpsError('not-found', 'You are not in this circle.');
    const tags = Array.isArray(profileSnap.data()?.circleTags) ? profileSnap.data().circleTags : [];
    tx.delete(membershipRef);
    if (profileSnap.exists) tx.update(profileSnap.ref, { circleTags: tags.filter(tag => tag !== membershipSnap.data().circleName), updatedAt: FieldValue.serverTimestamp() });
    return { left: true };
  });
});

// This is intentionally manual and administrator-only. It provides a cheap
// one-time baseline for an existing community without adding live scans to
// every reader's dashboard.
exports.rebuildCommunityStats = onCall(callableRuntime, async request => {
  await requireCommunityAdmin(request);
  const settledBorrowStatuses = ['approved', 'returned', 'lost'];
  const [totalMembers, totalBooks, totalFriendships, totalLoans, totalReturns, activeLoans, totalCircles] = await Promise.all([
    collectionCount(db.collection('profiles')),
    collectionCount(db.collection('books')),
    collectionCount(db.collection('friendships').where('status', '==', 'accepted')),
    collectionCount(db.collection('requests').where('type', '==', 'borrow').where('status', 'in', settledBorrowStatuses)),
    collectionCount(db.collection('requests').where('type', '==', 'borrow').where('status', '==', 'returned')),
    collectionCount(db.collection('books').where('status', '==', 'Lent Out')),
    collectionCount(db.collection('circles').where('active', '==', true))
  ]);
  const stats = { totalMembers, totalBooks, totalFriendships, totalLoans, totalReturns, activeLoans, totalCircles };
  await db.collection('networkStats').doc('current').set({
    ...stats,
    rebuiltAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
  return stats;
});

exports.rebuildDiscoveryIndex = onCall(callableRuntime, async request => {
  await requireCommunityAdmin(request);
  const books = await db.collection('books').limit(500).get();
  const batch = db.batch();
  books.docs.forEach(book => batch.set(discoveryRef(book.id), discoveryData(book.id, book.data())));
  if (!books.empty) await batch.commit();
  return { indexed: books.size };
});

exports.getAdminDashboard = onCall(callableRuntime, async request => {
  const uid = await requireCommunityAdmin(request);
  const [configSnap, feedbackSnap, circlesSnap] = await Promise.all([
    db.collection('appConfig').doc('community').get(),
    db.collection('feedback').limit(50).get(),
    db.collection('circles').limit(100).get()
  ]);
  const config = configSnap.data() || {};
  const adminUserIds = Array.isArray(config.adminUserIds) ? config.adminUserIds : [uid];
  const adminProfiles = await db.getAll(...adminUserIds.slice(0, 20).map(id => db.collection('profiles').doc(id)));
  const feedback = feedbackSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
    .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
  return {
    admins: adminProfiles.map(doc => ({ uid: doc.id, name: doc.data()?.libraryName || 'Deleted profile' })),
    feedback,
    circleLimit: circleLimitFromConfig(config),
    circles: circlesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
  };
});

exports.resolveFeedback = onCall(callableRuntime, async request => {
  await requireCommunityAdmin(request);
  const feedbackId = requireString(request.data?.feedbackId, 'feedbackId');
  const status = request.data?.status;
  if (!['resolved', 'open'].includes(status)) throw new HttpsError('invalid-argument', 'Invalid feedback status.');
  const feedbackRef = db.collection('feedback').doc(feedbackId);
  const feedback = await feedbackRef.get();
  if (!feedback.exists) throw new HttpsError('not-found', 'Feedback item no longer exists.');
  await feedbackRef.set({ status, resolvedAt: status === 'resolved' ? FieldValue.serverTimestamp() : FieldValue.delete() }, { merge: true });
  return { status };
});

exports.replyToFeedback = onCall(callableRuntime, async request => {
  await requireCommunityAdmin(request);
  const feedbackId = requireString(request.data?.feedbackId, 'feedbackId');
  const reply = requireString(request.data?.reply, 'Reply').slice(0, 1000);
  const feedbackRef = db.collection('feedback').doc(feedbackId);
  const feedback = await feedbackRef.get();
  if (!feedback.exists) throw new HttpsError('not-found', 'Feedback item no longer exists.');
  await feedbackRef.set({ adminReply: reply, status: 'answered', repliedAt: FieldValue.serverTimestamp() }, { merge: true });
  return { status: 'answered' };
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

// Borrow requests are deliberately created by trusted code rather than from
// the browser. This makes limits reliable even when several owners respond at
// once or a reader has multiple tabs open.
exports.createBorrowRequest = onCall(callableRuntime, async request => {
  const uid = requireUser(request);
  const bookId = requireString(request.data?.bookId, 'bookId');
  const bookRef = db.collection('books').doc(bookId);
  const requestRef = db.collection('requests').doc();
  return db.runTransaction(async tx => {
    const [bookSnap, profileSnap, activeLoans, pendingRequests] = await Promise.all([
      tx.get(bookRef),
      tx.get(db.collection('profiles').doc(uid)),
      tx.get(db.collection('books').where('borrowerId', '==', uid).where('status', '==', 'Lent Out').limit(MAX_ACTIVE_LOANS + 1)),
      tx.get(db.collection('requests').where('requesterId', '==', uid).where('status', '==', 'pending').limit(MAX_PENDING_BORROW_REQUESTS + 1))
    ]);
    if (!bookSnap.exists || bookSnap.data().status !== 'Available') {
      throw new HttpsError('failed-precondition', 'This book is no longer available.');
    }
    const book = bookSnap.data();
    if (book.ownerId === uid) throw new HttpsError('invalid-argument', 'You cannot borrow a book from your own shelf.');
    if (!profileSnap.exists) throw new HttpsError('failed-precondition', 'Create your reader profile before borrowing books.');
    if (!(await confirmedFriendship(tx, book.ownerId, uid))) {
      throw new HttpsError('permission-denied', 'Connect as friends before requesting this book.');
    }
    if (activeLoans.size >= MAX_ACTIVE_LOANS) {
      throw new HttpsError('failed-precondition', `You already have ${MAX_ACTIVE_LOANS} active loans. Return one before requesting another book.`);
    }
    const pendingBorrowRequests = pendingRequests.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      .filter(item => item.type === 'borrow');
    if (pendingBorrowRequests.some(item => item.bookId === bookId)) {
      throw new HttpsError('already-exists', 'You already have a pending request for this copy.');
    }
    if (pendingBorrowRequests.length >= MAX_PENDING_BORROW_REQUESTS) {
      throw new HttpsError('resource-exhausted', `You already have ${MAX_PENDING_BORROW_REQUESTS} pending book requests. Wait for an answer or cancel one first.`);
    }
    const titleKey = normalizedTitle(book.title);
    if (pendingBorrowRequests.filter(item => item.titleKey === titleKey || normalizedTitle(item.title) === titleKey).length >= MAX_PENDING_REQUESTS_PER_TITLE) {
      throw new HttpsError('resource-exhausted', `You can ask up to ${MAX_PENDING_REQUESTS_PER_TITLE} friends for the same title at a time.`);
    }
    const borrower = profileSnap.data();
    tx.set(requestRef, {
      type: 'borrow', bookId, title: book.title || 'Untitled book', titleKey,
      ownerId: book.ownerId, ownerName: book.ownerName || 'A friend',
      requesterId: uid, requesterName: borrower.libraryName || 'Reader',
      status: 'pending', createdAt: FieldValue.serverTimestamp()
    });
    return { requestId: requestRef.id, title: book.title || 'Untitled book' };
  });
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
    const ownerProfileRef = db.collection('profiles').doc(uid);
    const bookStatsRef = db.collection('bookLoanStats').doc(loan.bookId);
    const networkStatsRef = db.collection('networkStats').doc('current');
    const [bookSnap, activeLoans, pendingRequests, pendingForBorrower, borrowerStatsSnap, ownerStatsSnap, ownerProfileSnap, bookStatsSnap, networkStatsSnap, friendshipConfirmed] = await Promise.all([
      tx.get(bookRef),
      tx.get(db.collection('books').where('borrowerId', '==', loan.requesterId).where('status', '==', 'Lent Out').limit(MAX_ACTIVE_LOANS + 1)),
      tx.get(db.collection('requests').where('bookId', '==', loan.bookId).where('status', '==', 'pending').limit(100)),
      tx.get(db.collection('requests').where('requesterId', '==', loan.requesterId).where('status', '==', 'pending').limit(MAX_PENDING_BORROW_REQUESTS + 1)),
      tx.get(borrowerStatsRef), tx.get(ownerStatsRef), tx.get(ownerProfileRef), tx.get(bookStatsRef), tx.get(networkStatsRef)
      , confirmedFriendship(tx, uid, loan.requesterId)
    ]);
    if (!bookSnap.exists || bookSnap.data().ownerId !== uid || bookSnap.data().status !== 'Available') throw new HttpsError('failed-precondition', 'This book is no longer available.');
    if (!friendshipConfirmed) throw new HttpsError('permission-denied', 'Only a confirmed friend can borrow this book.');
    if (activeLoans.size >= MAX_ACTIVE_LOANS) {
      throw new HttpsError('failed-precondition', `${loan.requesterName || 'This reader'} already has ${MAX_ACTIVE_LOANS} active loans. They need to return one before you can lend this book.`);
    }
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
      totalLent: Number(ownerStats.totalLent || 0) + 1,
      mostBorrowedTitle: nextBookLoanCount >= Number(ownerStats.mostBorrowedCount || 0) ? bookSnap.data().title || 'Untitled book' : ownerStats.mostBorrowedTitle || '',
      mostBorrowedCount: ownerMostBorrowed,
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    tx.set(ownerProfileRef, {
      totalLent: Number(ownerProfileSnap.data()?.totalLent || 0) + 1,
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
    // Once the third live loan begins, old unanswered requests can no longer
    // be approved. Close them immediately and retain their history instead of
    // leaving owners with a button that will only fail later.
    if (activeLoans.size + 1 >= MAX_ACTIVE_LOANS) {
      pendingForBorrower.docs.filter(doc => doc.id !== requestId && doc.data().type === 'borrow').forEach(doc => {
        tx.update(doc.ref, { status: 'cancelled', cancellationReason: 'borrow-limit-reached', respondedAt: FieldValue.serverTimestamp() });
      });
    }
    return {
      action, dueAt: dueAt.toDate().toISOString(), ownerId: uid,
      ownerName: bookSnap.data().ownerName || 'A friend', borrowerId: loan.requesterId,
      borrowerName: loan.requesterName || 'Reader', bookId: loan.bookId,
      title: bookSnap.data().title || 'Untitled book', seriesName: bookSnap.data().seriesName || '', coverUrl: bookSnap.data().coverUrl || ''
    };
  });
  if (result.action === 'approved') {
    await Promise.all([
      writeTickerActivities([result.ownerId], `borrowed-owner-${requestId}`, {
        type: 'book-borrowed-owner', bookId: result.bookId, actorId: result.borrowerId, actorName: result.borrowerName, title: result.title, seriesName: result.seriesName || ''
      }),
      writeTickerActivities([result.borrowerId], `borrowed-reader-${requestId}`, {
        type: 'book-borrowed-reader', bookId: result.bookId, actorId: result.ownerId, actorName: result.ownerName, title: result.title, seriesName: result.seriesName || ''
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
    const returnRequestRef = db.collection('requests').doc(`return-${bookId}-${book.activeRequestId || book.borrowerId}`);
    const [profileSnap, requestSnap, networkStatsSnap, returnRequestSnap] = await Promise.all([
      tx.get(db.collection('profiles').doc(book.borrowerId)),
      requestRef ? tx.get(requestRef) : Promise.resolve(null),
      tx.get(networkStatsRef),
      tx.get(returnRequestRef)
    ]);
    if (outcome === 'returned' && (!returnRequestSnap.exists || returnRequestSnap.data().status !== 'pending')) throw new HttpsError('failed-precondition', 'The borrower needs to request a return before you confirm it.');
    const now = Date.now();
    const heldFor = now - (book.lentAt?.toMillis?.() || now);
    const onTime = !book.loanDueAt?.toMillis || now <= book.loanDueAt.toMillis();
    const points = outcome === 'lost' ? -2 : (heldFor >= 2 * DAY_MS && onTime ? 0.5 : (onTime ? 0 : -0.5));
    const profile = profileSnap.exists ? profileSnap.data() : {};
    const ratingAdjustment = Number(profile.ratingAdjustment || 0) + points;
    const ratingScore = readerScore(profile.bookCount, ratingAdjustment);
    tx.set(db.collection('profiles').doc(book.borrowerId), {
      ratingAdjustment, ratingScore,
      timelyReturns: Number(profile.timelyReturns || 0) + (points > 0 ? 1 : 0),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    tx.update(bookRef, outcome === 'lost' ? {
      status: 'Lost', returnRequestedAt: FieldValue.delete(), lostAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()
    } : {
      status: 'Available', borrowerId: FieldValue.delete(), borrowerName: FieldValue.delete(),
      lentAt: FieldValue.delete(), loanDueAt: FieldValue.delete(), activeRequestId: FieldValue.delete(), returnRequestedAt: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp()
    });
    tx.set(discoveryRef(bookId), { status: outcome === 'lost' ? 'Lost' : 'Available', updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    const networkStats = networkStatsSnap.data() || {};
    tx.set(networkStatsRef, {
      activeLoans: Math.max(0, Number(networkStats.activeLoans || 0) - 1),
      totalReturns: Number(networkStats.totalReturns || 0) + (outcome === 'returned' ? 1 : 0),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    if (requestSnap?.exists) tx.update(requestRef, { status: outcome === 'lost' ? 'lost' : 'returned', returnRatingPoints: points, returnedAt: FieldValue.serverTimestamp() });
    if (outcome === 'returned') tx.update(returnRequestRef, { status: 'confirmed', confirmedAt: FieldValue.serverTimestamp() });
    if (outcome === 'lost' && returnRequestSnap.exists && returnRequestSnap.data().status === 'pending') tx.update(returnRequestRef, { status: 'cancelled', cancellationReason: 'book-reported-lost', respondedAt: FieldValue.serverTimestamp() });
    tx.set(db.collection('ratingEvents').doc(`${book.activeRequestId || bookId}-${outcome}`), {
        subjectId: book.borrowerId,
        bookId,
        title: book.title || 'Untitled book',
        outcome,
        points,
        reason: outcome === 'lost' ? 'Book reported lost' : (points > 0 ? 'Returned on time after two days' : (points < 0 ? 'Returned after the due date' : 'Returned within the first two days - no score change')),
        createdAt: FieldValue.serverTimestamp()
    });
    return { outcome, points, ownerId: book.ownerId, ownerName: book.ownerName || 'A friend', title: book.title || 'Untitled book', seriesName: book.seriesName || '', coverUrl: book.coverUrl || '', requestId: book.activeRequestId || '' };
  });
  if (outcome === 'returned') {
    const friends = await acceptedFriendIds(result.ownerId);
    await writeTickerActivities(friends, `available-${bookId}-${result.requestId || 'returned'}`, {
      type: 'book-available', actorId: result.ownerId, actorName: result.ownerName,
      bookId, ownerId: result.ownerId, title: result.title, seriesName: result.seriesName || ''
    }).catch(err => console.error('Could not write return activity', err));
    await writePublicBookActivity(`available-${bookId}-${result.requestId || 'returned'}`, 'public-book-available', { ...result, bookId })
      .catch(err => console.error('Could not write public return activity', err));
  }
  return result;
});

exports.requestReturn = onCall(callableRuntime, async request => {
  const uid = requireUser(request);
  const bookId = requireString(request.data?.bookId, 'bookId');
  const bookRef = db.collection('books').doc(bookId);
  return db.runTransaction(async tx => {
    const bookSnap = await tx.get(bookRef);
    if (!bookSnap.exists) throw new HttpsError('not-found', 'Book no longer exists.');
    const book = bookSnap.data();
    if (book.status !== 'Lent Out' || book.borrowerId !== uid) throw new HttpsError('failed-precondition', 'You are not the current borrower of this book.');
    const returnRef = db.collection('requests').doc(`return-${bookId}-${book.activeRequestId || uid}`);
    const existing = await tx.get(returnRef);
    if (existing.exists && existing.data().status === 'pending') return { alreadyRequested: true };
    tx.set(returnRef, {
      type: 'return-request', bookId, title: book.title || 'Untitled book', ownerId: book.ownerId,
      ownerName: book.ownerName || 'Owner', requesterId: uid, requesterName: book.borrowerName || 'Borrower',
      status: 'pending', createdAt: FieldValue.serverTimestamp()
    });
    tx.update(bookRef, { returnRequestedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    return { requested: true };
  });
});

async function refreshBookCount(ownerId) {
  const [profileSnap, countSnap] = await Promise.all([
    db.collection('profiles').doc(ownerId).get(),
    db.collection('books').where('ownerId', '==', ownerId).count().get()
  ]);
  if (!profileSnap.exists) return;
  const profile = profileSnap.data();
  const bookCount = countSnap.data().count;
  const ratingScore = readerScore(bookCount, profile.ratingAdjustment);
  await profileSnap.ref.update({ bookCount, ratingScore, updatedAt: FieldValue.serverTimestamp() });
}

async function notifyWishers(bookId, book, friendIds) {
  const titleKey = String(book.title || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!titleKey || !friendIds.length) return;
  const wishes = await db.collection('wishlists').where('titleKey', '==', titleKey).limit(50).get();
  const batch = db.batch();
  wishes.docs.forEach(wish => {
    const data = wish.data();
    if (friendIds.includes(data.userId)) {
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
  const coreWrites = [
    discoveryRef(event.params.bookId).set(discoveryData(event.params.bookId, book)),
    incrementNetworkStat('totalBooks'),
    refreshBookCount(book.ownerId)
  ];
  if (book.quietImport) return Promise.all(coreWrites);
  return acceptedFriendIds(book.ownerId).then(friendIds => Promise.all([
    ...coreWrites,
      notifyWishers(event.params.bookId, book, friendIds),
      writeTickerActivities(friendIds, `added-${event.params.bookId}`, {
        type: book.status === 'Available' ? 'book-added' : 'book-reading',
        actorId: book.ownerId, actorName: book.ownerName || 'A friend',
        bookId: event.params.bookId, ownerId: book.ownerId, title: book.title || 'Untitled book', seriesName: book.seriesName || ''
      }),
      writePublicBookActivity(`added-${event.params.bookId}`, 'public-book-added', { ...book, bookId: event.params.bookId })
  ]));
});
exports.onBookUpdated = onDocumentUpdated({ ...runtime, document: 'books/{bookId}' }, event =>
  discoveryRef(event.params.bookId).set(discoveryData(event.params.bookId, event.data.after.data()))
);
exports.onProfileCreated = onDocumentCreated({ ...runtime, document: 'profiles/{userId}' }, event =>
  Promise.all([writeNewMemberActivity(event.params.userId, event.data.data()), incrementNetworkStat('totalMembers')])
);
exports.onProfileDeleted = onDocumentDeleted({ ...runtime, document: 'profiles/{userId}' }, () => incrementNetworkStat('totalMembers', -1));
exports.onCircleCreated = onDocumentCreated({ ...runtime, document: 'circles/{circleId}' }, event =>
  event.data.data().bootstrap ? null : incrementNetworkStat('totalCircles')
);
exports.onCircleDeleted = onDocumentDeleted({ ...runtime, document: 'circles/{circleId}' }, () => incrementNetworkStat('totalCircles', -1));
exports.onBookDeleted = onDocumentDeleted({ ...runtime, document: 'books/{bookId}' }, event => {
  const book = event.data.data();
  return Promise.all([
    discoveryRef(event.params.bookId).delete(),
    refreshBookCount(book.ownerId),
    incrementNetworkStat('totalBooks', -1),
    clearBookTicker(event.params.bookId)
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
    deleteQuery(db.collection('savedBooks').where('userId', '==', uid)),
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
