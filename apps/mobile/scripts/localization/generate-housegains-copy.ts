import { writeFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { SUPPORTED_LOCALES } from '../../localization/core';
import { HOUSEGAINS_DICTIONARIES } from '../../localization/housegains/catalog';

const cell = (value: string) => value.replaceAll('|', '\\|').replaceAll('\n', '<br>');
const rows = Object.keys(HOUSEGAINS_DICTIONARIES['en-US'])
  .sort()
  .map(
    (key) =>
      `| \`${key}\` | ${SUPPORTED_LOCALES.map((locale) => cell(HOUSEGAINS_DICTIONARIES[locale][key])).join(' | ')} |`,
  );
const text = [
  '# HouseGains localized copy',
  '',
  'Active app copy in English, Portuguese, Spanish, French, German and Italian. Generated from locale dictionaries; edit those dictionaries, then run this script. Household/member names and custom task content remain user-authored data.',
  '',
  `| Key | ${SUPPORTED_LOCALES.join(' | ')} |`,
  `| ${Array(SUPPORTED_LOCALES.length + 1)
    .fill('---')
    .join(' | ')} |`,
  ...rows,
  '',
].join('\n');
writeFileSync(
  fileURLToPath(new URL('../../docs/screens/housegains-localized-copy.md', import.meta.url)),
  text,
);
console.log(`Wrote ${rows.length} keys across ${SUPPORTED_LOCALES.length} languages.`);
