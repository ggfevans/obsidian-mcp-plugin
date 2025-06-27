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

  // Update version.ts
  const versionTs = `// Version is injected at build time by sync-version.mjs
export function getVersion(): string {
  return '${version}';
}
`;
  writeFileSync('src/version.ts', versionTs);

  console.log(`✅ Synced version ${version} from package.json to manifest.json and version.ts`);
} catch (error) {
  console.error('❌ Failed to sync version:', error.message);
  process.exit(1);
}