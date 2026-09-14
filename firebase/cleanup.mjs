import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

export async function cleanReplacedObjects({db, bucket, apply = false}) {
  if ((await db.collection('system').doc('state').get()).data()?.status === 'migrating') throw new Error('Espera a que termine la migración.');
  const jobs = await db.collection('objectCleanup').limit(100).get();
  let removable = 0, removed = 0, retained = 0;
  for (const job of jobs.docs) {
    const {key} = job.data();
    if (typeof key !== 'string' || !/^families\/[a-zA-Z0-9_./-]+$/.test(key) || key.includes('..')) throw new Error('La cola contiene una ruta no permitida.');
    const refs = await Promise.all(['object_key', 'thumbnail_key'].map(field => db.collection('families').where(field, '==', key).limit(1).get()));
    if (refs.some(ref => !ref.empty)) { retained++; continue; }
    // Family uploads use immutable UUID keys and never reattach replaced objects.
    removable++;
    if (apply) { await bucket.file(key).delete({ignoreNotFound: true}); await job.ref.delete(); removed++; }
  }
  return {reviewed: jobs.size, removable, removed, retained, morePossible: jobs.size === 100};
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2), projectId = args[args.indexOf('--project') + 1];
    if (!args.includes('--project') || !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId)) throw new Error('Indica --project con el ID exacto de Firebase.');
    const name = args.includes('--bucket') ? args[args.indexOf('--bucket') + 1] : projectId + '.firebasestorage.app';
    const require = createRequire(new URL('./functions/package.json', import.meta.url)), {initializeApp, deleteApp} = require('firebase-admin/app');
    const {getFirestore} = require('firebase-admin/firestore'), {getStorage} = require('firebase-admin/storage');
    const app = initializeApp({projectId, storageBucket: name});
    try { console.log(JSON.stringify(await cleanReplacedObjects({db: getFirestore(app), bucket: getStorage(app).bucket(), apply: args.includes('--apply')}), null, 2)); }
    finally { await deleteApp(app); }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
