// Fails if any store listing field in docs/store/listing.md is missing or over its limit.
// Also checks App Store keywords: comma-separated, no spaces after commas, no word that
// already appears in the App Store name, no duplicates.
// Usage: node docs/store/check-lengths.mjs
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const LISTING = join(here, 'listing.md');
const LOCALES = ['en-US', 'pt-BR', 'es-ES', 'fr-FR', 'de-DE', 'it-IT'];

const LIMITS = {
  'App Store|name': 30,
  'App Store|subtitle': 30,
  'App Store|promotional text': 170,
  'App Store|description': 4000,
  'App Store|keywords': 100,
  'Google Play|title': 30,
  'Google Play|short description': 80,
  'Google Play|full description': 4000,
};

// Parse "## <locale>" / "### <platform>" / "#### <field>" blocks. Any other "##" heading closes the locale.
function parse(text) {
  const out = {};
  let locale = null;
  let platform = null;
  let field = null;
  let buf = [];
  const flush = () => {
    if (locale && platform && field) {
      out[locale] ??= {};
      out[locale][`${platform}|${field}`] = buf.join('\n').trim();
    }
    buf = [];
  };
  for (const line of text.split('\n')) {
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (!h) {
      buf.push(line);
      continue;
    }
    flush();
    const [, level, title] = h;
    const t = title.trim();
    if (level === '##') {
      locale = LOCALES.includes(t) ? t : null;
      platform = null;
      field = null;
    } else if (level === '###') {
      platform = locale && (t === 'App Store' || t === 'Google Play') ? t : null;
      field = null;
    } else if (level === '####') {
      field = platform ? t : null;
    } else {
      field = null;
    }
  }
  flush();
  return out;
}

const len = (s) => [...s].length; // code points, close to how stores count characters
const words = (s) => s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);

const text = readFileSync(LISTING, 'utf8');
const data = parse(text);
const problems = [];

for (const locale of LOCALES) {
  const fields = data[locale];
  if (!fields) {
    problems.push(`${locale}: section missing`);
    continue;
  }
  for (const [key, limit] of Object.entries(LIMITS)) {
    const value = fields[key];
    if (value === undefined || value === '') {
      problems.push(`${locale} ${key}: missing`);
      continue;
    }
    if (len(value) > limit) problems.push(`${locale} ${key}: ${len(value)} > ${limit}`);
  }
  const name = fields['App Store|name'] ?? '';
  const keywords = fields['App Store|keywords'] ?? '';
  if (keywords) {
    if (/,\s|\s,/.test(keywords)) problems.push(`${locale} keywords: spaces around commas`);
    if (/\n/.test(keywords)) problems.push(`${locale} keywords: must be one line`);
    const tokens = keywords.split(',').map((t) => t.trim());
    const nameWords = new Set(words(name));
    const seen = new Set();
    for (const token of tokens) {
      if (!token) problems.push(`${locale} keywords: empty keyword`);
      if (seen.has(token.toLowerCase())) problems.push(`${locale} keywords: duplicate "${token}"`);
      seen.add(token.toLowerCase());
      for (const w of words(token)) {
        if (nameWords.has(w)) problems.push(`${locale} keywords: "${w}" already in the app name`);
      }
    }
  }
}

if (problems.length) {
  console.error(`Store listing check failed (${problems.length} problem${problems.length === 1 ? '' : 's'}):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

console.log('Store listing lengths OK');
for (const locale of LOCALES) {
  const f = data[locale];
  const parts = Object.entries(LIMITS).map(([k, limit]) => `${k.split('|')[1]} ${len(f[k])}/${limit}`);
  console.log(`  ${locale}: ${parts.join(', ')}`);
}
