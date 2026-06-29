#!/usr/bin/env node
//
// reset-storage.mjs
//
// Companion to the reset SQL. Walks `historical-images` and `ads-banners`
// Supabase Storage buckets and deletes every object inside (including nested
// folders like `{eventId}/cover.jpg`). The buckets themselves are kept.
//
// Run:
//   node scripts/reset-storage.mjs --dry-run   # list only, no deletes
//   node scripts/reset-storage.mjs             # actually delete
//
// Required:
//   • Working dir = dad-cms project root
//   • SUPABASE_SERVICE_ROLE_KEY in env, or in .env.e2e

import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://dttqbktyqhzdmimzkoeb.supabase.co';
const BUCKETS      = ['historical-images', 'ads-banners'];

function loadKey() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return process.env.SUPABASE_SERVICE_ROLE_KEY;
  const envPath = path.join(process.cwd(), '.env.e2e');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^SUPABASE_SERVICE_ROLE_KEY=(.+)$/);
      if (m) return m[1].trim();
    }
  }
  throw new Error('SUPABASE_SERVICE_ROLE_KEY not found (env or .env.e2e).');
}

// Recursively list every file path inside a bucket, walking nested folders.
// Returns paths in `folder/file.ext` form, ready for .remove().
async function listAllFiles(supabase, bucket, prefix = '') {
  const all = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, {
      limit: 1000, offset, sortBy: { column: 'name', order: 'asc' },
    });
    if (error) throw new Error(`List ${bucket}/${prefix || '(root)'} failed: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const item of data) {
      const fullPath = prefix ? `${prefix}/${item.name}` : item.name;
      // Storage returns folders as entries with metadata=null.
      if (item.id === null || item.metadata === null) {
        const nested = await listAllFiles(supabase, bucket, fullPath);
        all.push(...nested);
      } else {
        all.push(fullPath);
      }
    }
    if (data.length < 1000) break;
    offset += 1000;
  }
  return all;
}

async function main() {
  const dry = process.argv.includes('--dry-run');
  const supabase = createClient(SUPABASE_URL, loadKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let totalFiles = 0;
  const plans = [];
  for (const bucket of BUCKETS) {
    console.log(`▶ Scanning ${bucket}…`);
    const files = await listAllFiles(supabase, bucket);
    console.log(`   ${files.length} file(s)`);
    plans.push({ bucket, files });
    totalFiles += files.length;
  }

  console.log(`\n📦 Total: ${totalFiles} file(s) across ${BUCKETS.length} bucket(s).`);

  if (dry) {
    console.log('\n🔍 --dry-run: nothing deleted.');
    return;
  }

  if (totalFiles === 0) {
    console.log('Nothing to delete.');
    return;
  }

  for (const { bucket, files } of plans) {
    if (files.length === 0) continue;
    console.log(`\n▶ Deleting ${files.length} from ${bucket}…`);
    // .remove() takes an array, batch in chunks of 1000 to be safe.
    let removed = 0;
    while (removed < files.length) {
      const batch = files.slice(removed, removed + 1000);
      const { error } = await supabase.storage.from(bucket).remove(batch);
      if (error) throw new Error(`Remove batch failed in ${bucket}: ${error.message}`);
      removed += batch.length;
      console.log(`   ${removed}/${files.length}`);
    }
  }

  console.log('\n✅ Storage reset complete. Buckets retained, contents emptied.');
}

main().catch(err => { console.error('\n❌ FAILED:', err.message); process.exit(1); });
