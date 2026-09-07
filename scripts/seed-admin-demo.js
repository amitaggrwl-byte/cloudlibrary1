const { createRequire } = require('node:module');
const dep = createRequire(require.resolve('../functions/package.json'));
if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080') throw new Error('Local emulator required');
dep('firebase-admin/app').initializeApp({ projectId: 'cloudlibrary-7b9ac' });
const { getFirestore, Timestamp } = dep('firebase-admin/firestore');
const db = getFirestore();
(async () => {
  const batch=db.batch();
  for(let i=0;i<12;i++) batch.set(db.doc(`feedback/admin-demo-${i}`),{reporterId:'bella',reporterShelf:'BellaBooks',category:'question',message:`Demo feedback ${i}: how do I add a book?`,status:'open',createdAt:Timestamp.fromMillis(Date.now()-i*1000)});
  await batch.commit();console.log('Seeded 12 local admin feedback items.');
})().catch(error=>{console.error(error);process.exitCode=1;});
