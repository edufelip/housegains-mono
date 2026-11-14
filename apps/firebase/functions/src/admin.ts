import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

if (getApps().length === 0) initializeApp();

export function db(): Firestore {
  return getFirestore();
}
