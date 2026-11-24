#!/usr/bin/env node
// Grants or removes the `admin: true` Auth custom claim that the gamification admin callables require
// (contract C10). Other custom claims on the user are kept.
//
//   node scripts/set-admin-claim.mjs <uid> [--remove] [--project <projectId>]
//
// Against the Auth emulator: set FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 (and --project demo-housegains).
// Against a real project: set GOOGLE_APPLICATION_CREDENTIALS to a service-account key, or run on a machine
// with application-default credentials, and pass --project.
// The user has to sign in again (or refresh the ID token) before the claim shows up in their token.

import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const args = process.argv.slice(2);
const remove = args.includes('--remove');
const projectFlag = args.indexOf('--project');
const projectId = projectFlag === -1 ? process.env.GCLOUD_PROJECT : args[projectFlag + 1];
const uid = args.find((arg, index) => !arg.startsWith('--') && index !== projectFlag + 1);

if (uid === undefined || (projectFlag !== -1 && projectId === undefined)) {
  console.error('Usage: node scripts/set-admin-claim.mjs <uid> [--remove] [--project <projectId>]');
  process.exit(2);
}

initializeApp(projectId === undefined ? undefined : { projectId });
const auth = getAuth();

try {
  const user = await auth.getUser(uid);
  const claims = { ...(user.customClaims ?? {}) };
  if (remove) delete claims.admin;
  else claims.admin = true;
  await auth.setCustomUserClaims(uid, Object.keys(claims).length === 0 ? null : claims);
  console.log(`${remove ? 'Removed admin claim from' : 'Granted admin claim to'} ${uid} (${user.email ?? 'no email'}).`);
  console.log('Custom claims now:', JSON.stringify(claims));
} catch (error) {
  console.error(`Failed for ${uid}:`, error instanceof Error ? error.message : error);
  process.exit(1);
}
