// =============================================================
// FIREBASE · Initialization
// -------------------------------------------------------------
// The web API key is PUBLIC by design — Firebase identifies the
// project, not authenticates it. Real security is enforced via
// Firestore security rules + authorized domains in console.
// See: https://firebase.google.com/docs/projects/api-keys
// =============================================================

import { initializeApp } from 'firebase/app';
import {
  getAuth, browserLocalPersistence, setPersistence,
} from 'firebase/auth';
import {
  getFirestore, initializeFirestore,
  persistentLocalCache, persistentMultipleTabManager,
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyAnwN2qnrtBO82KfSLDuwkb4YZwVnxlyME',
  authDomain: 'heartflow-d5820.firebaseapp.com',
  projectId: 'heartflow-d5820',
  storageBucket: 'heartflow-d5820.firebasestorage.app',
  messagingSenderId: '899478145128',
  appId: '1:899478145128:web:75ca6b78a46a582747d3dd',
};

export const app  = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Persist auth across reloads (default but be explicit)
setPersistence(auth, browserLocalPersistence).catch(() => {});

// Firestore with offline-first cache + multi-tab support
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
});
