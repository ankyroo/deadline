import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const root = process.cwd();
const output = resolve(root, 'out');

if (!existsSync(output)) {
  throw new Error('Next.js export folder "out" was not found.');
}

function readSupabaseUrl() {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) return process.env.NEXT_PUBLIC_SUPABASE_URL;

  // Read only the public Supabase URL from the local env file. Other env values
  // are neither parsed nor printed by this script.
  const envFile = resolve(root, '.env.local');
  if (!existsSync(envFile)) return '';

  const line = readFileSync(envFile, 'utf8')
    .split(/\r?\n/)
    .find((entry) => entry.startsWith('NEXT_PUBLIC_SUPABASE_URL='));
  if (!line) return '';

  return line.slice('NEXT_PUBLIC_SUPABASE_URL='.length).trim().replace(/^(['"])(.*)\1$/, '$2');
}

function htmlFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return htmlFiles(path);
    return entry.isFile() && entry.name.endsWith('.html') ? [path] : [];
  });
}

const scriptHashes = new Set();
const inlineScriptPattern = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;

for (const file of htmlFiles(output)) {
  const html = readFileSync(file, 'utf8');
  for (const match of html.matchAll(inlineScriptPattern)) {
    if (/\bsrc\s*=/i.test(match[1]) || !match[2].trim()) continue;
    const digest = createHash('sha256').update(match[2], 'utf8').digest('base64');
    scriptHashes.add(`'sha256-${digest}'`);
  }
}

const configuredUrl = readSupabaseUrl();
if (!configuredUrl) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL is required to generate a least-privilege CSP.');
}

const supabaseUrl = new URL(configuredUrl);
if (supabaseUrl.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(supabaseUrl.hostname)) {
  throw new Error('The Supabase URL must use HTTPS outside local development.');
}

const supabaseOrigin = supabaseUrl.origin;
const websocketOrigin = supabaseUrl.protocol === 'https:'
  ? `wss://${supabaseUrl.host}`
  : `ws://${supabaseUrl.host}`;

const scriptSource = ["'self'", ...scriptHashes].join(' ');
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  `script-src ${scriptSource}`,
  "script-src-attr 'none'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self' ${supabaseOrigin} ${websocketOrigin}`,
  "manifest-src 'self'",
  "worker-src 'self' blob:",
  'upgrade-insecure-requests',
].join('; ');

const headers = [
  '/*',
  '  X-Content-Type-Options: nosniff',
  '  Referrer-Policy: strict-origin-when-cross-origin',
  '  Permissions-Policy: camera=(), microphone=(), geolocation=()',
  '  X-Frame-Options: DENY',
  '  Strict-Transport-Security: max-age=31536000; includeSubDomains; preload',
  `  Content-Security-Policy: ${csp}`,
  '',
].join('\n');

const headersPath = join(output, '_headers');
writeFileSync(headersPath, headers, 'utf8');
console.log(`Wrote ${relative(root, headersPath)} with ${scriptHashes.size} static script hash(es).`);
