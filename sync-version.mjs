#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'fs';

try {
  // Read version from package.json
  const packageJson = JSON.parse(readFileSync('package.json', 'utf-8'));
  const version = packageJson.version;

  // Read and update manifest.json
  const manifest = JSON.parse(readFileSync('manifest.json', 'utf-8'));
  manifest.version = version;

  // Write updated manifest.json
  writeFileSync('manifest.json', JSON.stringify(manifest, null, 2) + '\n');

  console.log(`✅ Synced version ${version} from package.json to manifest.json`);
} catch (error) {
  console.error('❌ Failed to sync version:', error.message);
  process.exit(1);
}