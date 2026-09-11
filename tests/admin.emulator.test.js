const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('This test requires the local emulator.');
process.env.GCLOUD_PROJECT = `demo-admin-${process.pid}`;
const functions = require('../functions/index');
const dep = createRequire(require.resolve('../functions/package.json'));
const { getFirestore, Timestamp } = dep('firebase-admin/firestore');
const db = getFirestore();
const call = (name, data = {}, uid = 'admin') => functions[name].run({ auth: { uid }, data });
before(async () => {
  const batch = db.batch();
  batch.set(db.doc('appConfig/community'), { adminUserIds: ['admin'], circleLimit: 6 });
  batch.set(db.doc('profiles/admin'), { libraryName: 'Test admin' });
  for (let i=0;i<65;i++) batch.set(db.doc(`feedback/f${i}`), {status:'open',message:`Test ${i}`,createdAt:Timestamp.fromMillis(1000+i)});
  batch.set(db.doc('feedback/answered'), {status:'answered',createdAt:Timestamp.fromMillis(2000)});
  for(let i=0;i<14;i++) batch.set(db.doc(`circles/c${i}`),{name:`Circle ${String(i).padStart(2,'0')}`,category:'School',active:true});
  batch.set(db.doc('circles/archived'),{name:'Old circle',category:'School',active:false});
  for(let i=0;i<205;i++) batch.set(db.doc(`books/b${String(i).padStart(3,'0')}`),{ownerId:'admin',title:`Test book ${i}`,status:'Available'});
  for(let i=0;i<105;i++) batch.set(db.doc(`profiles/p${String(i).padStart(3,'0')}`),{libraryName:`Reader ${i}`,ownerName:`Reader ${i}`,shelfKey:`reader${i}`,circleTags:i%2?['Grade 5']:[],searchTokens:['stale']});
  await batch.commit();
});
test('feedback pagination reaches older items without duplicates',async()=>{
  let after=null,ids=[];
  do {const result=await call('getAdminItems',{kind:'feedback',status:'open',after});assert.ok(result.items.length<=10);assert.equal(typeof result.items[0].createdAt,'number');ids.push(...result.items.map(i=>i.id));after=result.next;}while(after);
  assert.equal(ids.length,65);assert.equal(new Set(ids).size,65);assert.equal(ids[0],'f64');assert.equal(ids.at(-1),'f0');
});
test('admin-only list and maintenance endpoints reject non-admin readers',async()=>{
  for(const name of ['getAdminItems','getAdminDashboard','rebuildDiscoveryIndex','rebuildProfileSearchIndex']) await assert.rejects(call(name,{kind:'feedback',status:'open'},'reader'),error=>error.code==='permission-denied');
});
test('circle filters paginate and separate archived entries',async()=>{
  const first=await call('getAdminItems',{kind:'circles',status:'active',category:'School'});
  const second=await call('getAdminItems',{kind:'circles',status:'active',category:'School',after:first.next});
  assert.equal(first.items.length+second.items.length,14);assert.equal(second.next,null);
  const archived=await call('getAdminItems',{kind:'circles',status:'archived',category:'School'});assert.deepEqual(archived.items.map(i=>i.id),['archived']);
});
test('joining and leaving a circle keeps profile search tokens in sync',async()=>{
  await db.doc('profiles/reader').set({libraryName:'ReaderShelf',ownerName:'Ria',shelfKey:'readershelf',circleTags:[],searchTokens:['reader']});
  await call('joinCircle',{circleId:'c0'},'reader');
  const joined=(await db.doc('profiles/reader').get()).data();
  assert.deepEqual(joined.circleTags,['Circle 00']);
  assert.ok(joined.searchTokens.includes('circle'));
  assert.ok(joined.searchTokens.includes('readershelf'));
  const matches=await db.collection('profiles').where('searchTokens','array-contains','circle').limit(10).get();
  assert.ok(matches.docs.some(doc=>doc.id==='reader'));
  await call('leaveCircle',{circleId:'c0'},'reader');
  const left=(await db.doc('profiles/reader').get()).data();
  assert.deepEqual(left.circleTags,[]);
  assert.ok(!left.searchTokens.includes('circle'));
  assert.ok(left.searchTokens.includes('readershelf'));
});
test('health excludes answered feedback and keeps missing totals absent',async()=>{
  const result=await call('getAdminDashboard');assert.equal(result.health.pendingFeedback,65);assert.equal(result.health.totals.totalBooks,undefined);
});
test('search maintenance processes every batch and records completion',async()=>{
  let after=null,total=0,batches=0;
  do {const result=await call('rebuildDiscoveryIndex',{after});assert.ok(result.indexed<=100);total+=result.indexed;after=result.next;batches++;}while(after);
  assert.equal(total,205);assert.equal(batches,3);
  assert.equal((await db.collection('bookDiscovery').count().get()).data().count,205);
  assert.ok((await db.doc('appConfig/adminMaintenance').get()).data().searchCompletedAt);
});
test('profile search maintenance paginates and indexes circle names',async()=>{
  const expected=(await db.collection('profiles').count().get()).data().count;
  let after=null,total=0,batches=0;
  do {const result=await call('rebuildProfileSearchIndex',{after});assert.ok(result.indexed<=100);total+=result.indexed;after=result.next;batches++;}while(after);
  assert.equal(total,expected);assert.ok(batches>=2);
  const indexed=(await db.doc('profiles/p001').get()).data();
  assert.ok(indexed.searchTokens.includes('reader'));
  assert.ok(indexed.searchTokens.includes('grade'));
  assert.ok(indexed.searchTokens.includes('5'));
  assert.ok((await db.doc('appConfig/adminMaintenance').get()).data().profileSearchCompletedAt);
});
