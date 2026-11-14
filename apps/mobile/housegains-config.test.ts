import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { fileURLToPath, URL } from 'node:url';
import configure from './app.config';
const mobileRoot = fileURLToPath(new URL('.', import.meta.url));
test('HouseGains build identity is isolated from the source product', () => {
  const config = configure({ config: { name: 'HouseGains', slug: 'housegains' } } as never);
  assert.equal(config.slug, 'housegains');
  assert.equal(config.scheme, 'housegains');
  assert.ok(config.ios?.bundleIdentifier?.startsWith('com.housegains.app'));
  assert.ok(config.android?.package?.startsWith('com.housegains.app'));
});

test('iPhone-only build with the HouseGains Firebase project per variant', () => {
  const previous = process.env.APP_VARIANT;
  try {
    process.env.APP_VARIANT = 'dev';
    const dev = configure({ config: {} } as never);
    assert.equal(dev.ios?.supportsTablet, false);
    assert.equal((dev.extra as Record<string, unknown>).firebaseProject, 'housegains-dev');
    process.env.APP_VARIANT = 'prod';
    const prod = configure({ config: {} } as never);
    assert.equal((prod.extra as Record<string, unknown>).firebaseProject, 'housegains-prod');
    assert.equal(prod.ios?.bundleIdentifier, 'com.housegains.app');
  } finally {
    if (previous === undefined) delete process.env.APP_VARIANT;
    else process.env.APP_VARIANT = previous;
  }
});

test('no expo-updates native leftovers remain', async () => {
  for (const file of ['Expo.plist', 'Expo.dev.plist']) {
    await assert.rejects(readFile(`${mobileRoot}/ios/HouseGains/Supporting/${file}`, 'utf8'));
  }
  const manifest = await readFile(`${mobileRoot}/android/app/src/main/AndroidManifest.xml`, 'utf8');
  assert.ok(!manifest.includes('expo.modules.updates'));
});
