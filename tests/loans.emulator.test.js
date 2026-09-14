const {test, beforeEach} = require('node:test');
const assert = require('node:assert/strict');
const {createRequire} = require('node:module');
if(!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Local emulator required');
process.env.GCLOUD_PROJECT=`demo-loans-${process.pid}`;
const functions=require('../functions/index');
const dep=createRequire(require.resolve('../functions/package.json'));
const {getFirestore,Timestamp}=dep('firebase-admin/firestore');
const db=getFirestore();
const call=(name,data,uid='owner')=>functions[name].run({auth:{uid},data});
beforeEach(async()=>{
  for(const collection of await db.listCollections()) await db.recursiveDelete(collection);
  const batch=db.batch();
  for(const uid of ['owner','b','c']) batch.set(db.doc(`profiles/${uid}`),{libraryName:uid,bookCount:0,ratingAdjustment:0,ratingScore:3,friendCount:0,onTimeReturnStreak:0,bestOnTimeReturnStreak:0});
  for(const uid of ['b','c']) batch.set(db.doc(`friendships/${uid}__owner`),{user1:uid,user2:'owner',status:'accepted'});
  for(let i=0;i<7;i++) batch.set(db.doc(`books/book${i}`),{title:`Book ${i}`,author:'Author',ownerId:'owner',ownerName:'Owner',status:'Available',coverUrl:i===0?'https://example.com/book-0.jpg':''});
  await batch.commit();
});
test('only one competing approval succeeds for the same copy',async()=>{
  const b=await call('createBorrowRequest',{bookId:'book0'},'b');
  const c=await call('createBorrowRequest',{bookId:'book0'},'c');
  const results=await Promise.allSettled([b,c].map(r=>call('respondToBorrowRequest',{requestId:r.requestId,action:'approved'})));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  const states=await Promise.all([b,c].map(r=>db.doc(`requests/${r.requestId}`).get()));
  assert.deepEqual(states.map(s=>s.data().status).sort(),['approved','denied']);
});
test('loan ticker records retain the book cover for both participants',async()=>{
  const request=await call('createBorrowRequest',{bookId:'book0'},'b');
  await call('respondToBorrowRequest',{requestId:request.requestId,action:'approved'});
  const [ownerActivity,readerActivity,publicActivity]=await Promise.all([
    db.doc(`tickerActivities/borrowed-owner-${request.requestId}-owner`).get(),
    db.doc(`tickerActivities/borrowed-reader-${request.requestId}-b`).get(),
    db.doc('networkTicker/latest-book-borrowed').get()
  ]);
  assert.equal(ownerActivity.data().coverUrl,'https://example.com/book-0.jpg');
  assert.equal(readerActivity.data().coverUrl,'https://example.com/book-0.jpg');
  assert.equal(publicActivity.data().coverUrl,'https://example.com/book-0.jpg');
});
test('return handshake, positive ledger and repeat borrowing work',async()=>{
  const request=await call('createBorrowRequest',{bookId:'book0'},'b');
  await call('respondToBorrowRequest',{requestId:request.requestId,action:'approved'});
  await assert.rejects(call('closeLoan',{bookId:'book0',outcome:'returned'}),e=>e.code==='failed-precondition');
  await assert.rejects(call('requestReturn',{bookId:'book0'},'c'),e=>e.code==='failed-precondition');
  await db.doc('books/book0').update({lentAt:Timestamp.fromMillis(Date.now()-3*86400000)});
  await call('requestReturn',{bookId:'book0'},'b');
  assert.equal((await call('closeLoan',{bookId:'book0',outcome:'returned'})).points,.5);
  assert.equal((await db.doc(`ratingEvents/${request.requestId}-returned`).get()).data().points,.5);
  await assert.rejects(call('closeLoan',{bookId:'book0',outcome:'returned'}),e=>e.code==='failed-precondition');
  assert.ok((await call('createBorrowRequest',{bookId:'book0'},'b')).requestId);
});
test('third loan closes other pending requests and blocks a fourth',async()=>{
  const requests=[];
  for(let i=0;i<4;i++)requests.push(await call('createBorrowRequest',{bookId:`book${i}`},'b'));
  for(let i=0;i<3;i++)await call('respondToBorrowRequest',{requestId:requests[i].requestId,action:'approved'});
  assert.equal((await db.doc(`requests/${requests[3].requestId}`).get()).data().status,'cancelled');
  await assert.rejects(call('createBorrowRequest',{bookId:'book4'},'b'),e=>e.code==='failed-precondition');
  await assert.rejects(call('deleteMyAccount',{confirmation:'DELETE'},'b'),e=>e.code==='failed-precondition');
  await assert.rejects(call('deleteMyAccount',{confirmation:'DELETE'},'owner'),e=>e.code==='failed-precondition');
});
test('not-for-lending books and duplicate pending requests are rejected',async()=>{
  await db.doc('books/book0').update({status:'Reading'});
  await assert.rejects(call('createBorrowRequest',{bookId:'book0'},'b'),e=>e.code==='failed-precondition');
  await call('createBorrowRequest',{bookId:'book1'},'b');
  await assert.rejects(call('createBorrowRequest',{bookId:'book1'},'b'),e=>e.code==='already-exists');
});
test('lost loan records a single negative ledger event',async()=>{
  const request=await call('createBorrowRequest',{bookId:'book0'},'b');
  await call('respondToBorrowRequest',{requestId:request.requestId,action:'approved'});
  assert.equal((await call('closeLoan',{bookId:'book0',outcome:'lost'})).points,-2);
  assert.equal((await db.doc(`ratingEvents/${request.requestId}-lost`).get()).data().points,-2);
  await assert.rejects(call('closeLoan',{bookId:'book0',outcome:'lost'}),e=>e.code==='failed-precondition');
});
test('every fifth qualifying on-time return earns one streak bonus',async()=>{
  for(let i=0;i<5;i++){
    const request=await call('createBorrowRequest',{bookId:'book0'},'b');
    await call('respondToBorrowRequest',{requestId:request.requestId,action:'approved'});
    await db.doc('books/book0').update({lentAt:Timestamp.fromMillis(Date.now()-3*86400000)});
    await call('requestReturn',{bookId:'book0'},'b');
    const result=await call('closeLoan',{bookId:'book0',outcome:'returned'});
    assert.equal(result.points,i===4?1:.5);
  }
  const profile=(await db.doc('profiles/b').get()).data();
  assert.equal(profile.ratingAdjustment,3);
  assert.equal(profile.onTimeReturnStreak,5);
  assert.equal(profile.bestOnTimeReturnStreak,5);
  const bonus=await db.collection('ratingEvents').where('subjectId','==','b').where('outcome','==','streak-bonus').get();
  assert.equal(bonus.size,1);
  assert.equal(bonus.docs[0].data().points,.5);
});
test('a return more than thirty days late receives the additional penalty',async()=>{
  const request=await call('createBorrowRequest',{bookId:'book0'},'b');
  await call('respondToBorrowRequest',{requestId:request.requestId,action:'approved'});
  await db.doc('books/book0').update({
    lentAt:Timestamp.fromMillis(Date.now()-50*86400000),
    loanDueAt:Timestamp.fromMillis(Date.now()-31*86400000)
  });
  await call('requestReturn',{bookId:'book0'},'b');
  const result=await call('closeLoan',{bookId:'book0',outcome:'returned'});
  assert.equal(result.points,-1);
  assert.equal((await db.doc(`ratingEvents/${request.requestId}-returned`).get()).data().points,-1);
});
test('owner confirmation delay does not make a timely return late',async()=>{
  const request=await call('createBorrowRequest',{bookId:'book0'},'b');
  await call('respondToBorrowRequest',{requestId:request.requestId,action:'approved'});
  await db.doc('books/book0').update({
    lentAt:Timestamp.fromMillis(Date.now()-20*86400000),
    loanDueAt:Timestamp.fromMillis(Date.now()-2*86400000),
    returnRequestedAt:Timestamp.fromMillis(Date.now()-3*86400000)
  });
  await db.doc(`requests/return-book0-${request.requestId}`).set({type:'return-request',status:'pending'});
  const result=await call('closeLoan',{bookId:'book0',outcome:'returned'});
  assert.equal(result.points,.5);
});
test('unrelated pending reminders cannot hide duplicate borrow requests',async()=>{
  const batch=db.batch();
  for(let i=0;i<8;i++)batch.set(db.doc(`requests/000-reminder-${i}`),{requesterId:'b',ownerId:'owner',type:'return-reminder',status:'pending'});
  batch.set(db.doc('requests/zzz-borrow'),{requesterId:'b',ownerId:'owner',type:'borrow',status:'pending',bookId:'book0',titleKey:'book 0'});
  await batch.commit();
  await assert.rejects(call('createBorrowRequest',{bookId:'book0'},'b'),e=>e.code==='already-exists');
});
