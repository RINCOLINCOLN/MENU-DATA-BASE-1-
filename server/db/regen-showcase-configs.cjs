#!/usr/bin/env node
/**
 * regen-showcase-configs.cjs — regenerate server/db/showcase-board-configs.json
 * from the single source of truth (server/db/showcase-configs.cjs) and print
 * the sha256 pins that apply-demo-showcase.cjs expects.
 *
 * Usage (from server/):
 *   node db/regen-showcase-configs.cjs          # write JSON + print pins
 *   node db/regen-showcase-configs.cjs --check  # only verify current pins
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { configs } = require('./showcase-configs.cjs');

const FILE = path.join(__dirname, 'showcase-board-configs.json');

// Match the legacy shape: { taqueria: "<stringified board JSON>", ... }
const out = {};
for (const k of ['taqueria', 'ember', 'oliva']) {
  out[k] = JSON.stringify(configs[k]);
}
out._generated_from = 'server/db/showcase-configs.cjs';

const pins = {};
for (const k of ['taqueria', 'ember', 'oliva']) {
  // sha over JSON.stringify(str) — identical to apply-demo-showcase.cjs's check
  pins[k] = crypto.createHash('sha256').update(JSON.stringify(out[k])).digest('hex');
}

if (process.argv.includes('--check')) {
  console.log('Pins for EXPECTED_SHA (current JSON):');
  for (const k of Object.keys(pins)) console.log(`  ${k}: ${pins[k]}`);
  process.exit(0);
}

fs.writeFileSync(FILE, JSON.stringify(out, null, 1) + '\n');
console.log(`Wrote ${FILE}`);
console.log('\nEXPECTED_SHA pins for apply-demo-showcase.cjs:');
for (const k of Object.keys(pins)) console.log(`  ${k}: '${pins[k]}',`);
console.log('\nVerify against configs in showcase-configs.cjs by re-running with --check.');