#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('Building worker scripts...');

const workerSrcDir = path.join(__dirname, 'src', 'workers');
const workerDistDir = path.join(__dirname, 'dist', 'workers');

// Create dist/workers directory if it doesn't exist
if (!fs.existsSync(workerDistDir)) {
  fs.mkdirSync(workerDistDir, { recursive: true });
}

// Compile TypeScript worker files
try {
  execSync(`npx tsc src/workers/*.ts --outDir dist/workers --module commonjs --target es2020 --lib es2020 --skipLibCheck --types node`, {
    stdio: 'inherit'
  });
  console.log('✅ Worker scripts built successfully');
} catch (error) {
  console.error('❌ Failed to build worker scripts:', error.message);
  process.exit(1);
}