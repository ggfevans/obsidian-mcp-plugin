import { readFileSync } from 'fs';
import { resolve } from 'path';

let cachedVersion: string | null = null;

export function getVersion(): string {
  if (cachedVersion) {
    return cachedVersion;
  }

  // Fallback version in case reading fails
  let version = '0.2.0';

  try {
    // In an Obsidian plugin, we need to find package.json relative to the plugin directory
    // This works whether we're in development (src/) or production (main.js)
    const packageJsonPath = resolve(__dirname, '..', 'package.json');
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    version = packageJson.version;
    cachedVersion = version;
  } catch (error) {
    console.warn('Could not read version from package.json, using fallback:', version);
  }

  return version;
}