// Extra long-series fixture for the local demo only.
const { createRequire } = require('node:module');
const dep = createRequire(require.resolve('../functions/package.json'));
if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080') throw new Error('Local emulator required');
dep('firebase-admin/app').initializeApp({ projectId: 'cloudlibrary-7b9ac' });
const db = dep('firebase-admin/firestore').getFirestore();
(async () => {
  const batch = db.batch();
  for (let number = 1; number <= 40; number++) {
    batch.set(db.collection('books').doc(`demo-series-${String(number).padStart(2, '0')}`), {
      ownerId: 'bella', ownerName: 'BellaBooks', readerIds: ['bella', 'alex'],
      title: `${['Amber', 'Hidden', 'Crystal', 'Distant'][Math.floor((number - 1) / 10)]} ${['Door', 'Tower', 'Valley', 'Garden', 'Castle', 'Bridge', 'Island', 'Mountain', 'City', 'Library'][(number - 1) % 10]}`, author: 'Demo Author', seriesName: 'Magic Tree House',
      seriesNumber: number, status: 'Available', genre: 'Fiction', coverUrl: '', quietImport: true
    });
  }
  await batch.commit();
  console.log('Added 40 clearly labelled demo series books; discovery populated by actual emulator triggers.');
})().catch(error => { console.error(error); process.exitCode = 1; });
