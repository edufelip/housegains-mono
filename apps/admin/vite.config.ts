/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Firebase Hosting only serves folders inside the Firebase project (apps/firebase), so the
  // build lands where firebase.json's `admin` target points.
  build: {
    outDir: '../firebase/hosting/admin',
    emptyOutDir: true,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['src/test/setup.ts'],
  },
});
