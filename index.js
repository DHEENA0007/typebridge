#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const cliEntry = path.join(__dirname, 'dist', 'cli', 'index.js');

if (!fs.existsSync(cliEntry)) {
  console.error('TypeBridge is not built yet. Run `npm run build` first.');
  process.exit(1);
}

// Default to opening the interactive shell when invoked as `node index.js`
if (process.argv.length <= 2) {
  process.argv.push('repl');
}

require(cliEntry);
