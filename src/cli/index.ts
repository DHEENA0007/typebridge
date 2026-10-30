#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import { parseTypeScript } from '../parsers/typescript';
import { compile, SupportedTarget } from '../generators';

const VERSION = '0.1.0';

function printHelp() {
  console.log(`
🌉 TypeBridge v${VERSION}
Universal zero-overhead schema compiler

Usage:
  typebridge generate -i <input> -t <target> -o <output>
  typebridge check    -i <input> -t <target> -o <output>

Commands:
  generate    Compile input schema into target language code
  check       Verify that output file matches compiled schema (CI gate)

Options:
  -i, --input    Source schema file path (e.g. models.ts)
  -t, --target   Target language: python, rust, go, typescript
  -o, --output   Destination output file path
  -h, --help     Show this help message
  -v, --version  Show version number

Examples:
  npx typebridge generate -i src/types.ts -t python -o backend/models.py
  npx typebridge generate -i src/types.ts -t rust -o src/models.rs
  npx typebridge check    -i src/types.ts -t go -o pkg/models/models.go
`);
}

function parseArgs(args: string[]) {
  const result: {
    command?: string;
    input?: string;
    target?: string;
    output?: string;
    help?: boolean;
    version?: boolean;
  } = {};

  let i = 0;
  if (args.length > 0 && !args[0].startsWith('-')) {
    result.command = args[0];
    i = 1;
  }

  for (; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-h' || arg === '--help') {
      result.help = true;
    } else if (arg === '-v' || arg === '--version') {
      result.version = true;
    } else if (arg === '-i' || arg === '--input') {
      result.input = args[++i];
    } else if (arg === '-t' || arg === '--target') {
      result.target = args[++i];
    } else if (arg === '-o' || arg === '--output') {
      result.output = args[++i];
    }
  }

  return result;
}

async function main() {
  const args = process.argv.slice(2);
  const parsed = parseArgs(args);

  if (parsed.version) {
    console.log(`typebridge v${VERSION}`);
    process.exit(0);
  }

  if (parsed.help || (!parsed.command && !parsed.input)) {
    printHelp();
    process.exit(0);
  }

  const command = parsed.command || 'generate';

  if (!parsed.input) {
    console.error('❌ Error: Missing required option: -i, --input');
    process.exit(1);
  }

  if (!parsed.target) {
    console.error('❌ Error: Missing required option: -t, --target');
    process.exit(1);
  }

  const inputPath = path.resolve(process.cwd(), parsed.input);
  if (!fs.existsSync(inputPath)) {
    console.error(`❌ Error: Input file not found: ${inputPath}`);
    process.exit(1);
  }

  const sourceCode = fs.readFileSync(inputPath, 'utf-8');
  const doc = parseTypeScript(sourceCode, path.basename(inputPath));
  const generated = compile(doc, parsed.target as SupportedTarget);

  if (command === 'generate') {
    if (parsed.output) {
      const outputPath = path.resolve(process.cwd(), parsed.output);
      const outputDir = path.dirname(outputPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      fs.writeFileSync(outputPath, generated, 'utf-8');
      console.log(`✅ [TypeBridge] Successfully compiled ${parsed.input} -> ${parsed.output} (${parsed.target})`);
    } else {
      process.stdout.write(generated);
    }
  } else if (command === 'check') {
    if (!parsed.output) {
      console.error('❌ Error: The "check" command requires -o, --output to compare against.');
      process.exit(1);
    }
    const outputPath = path.resolve(process.cwd(), parsed.output);
    if (!fs.existsSync(outputPath)) {
      console.error(`❌ [TypeBridge CI Drift] Output file does not exist: ${parsed.output}`);
      process.exit(1);
    }

    const existingContent = fs.readFileSync(outputPath, 'utf-8');
    if (existingContent.trim() !== generated.trim()) {
      console.error(`❌ [TypeBridge CI Drift] Schema drift detected! '${parsed.output}' is out of sync with '${parsed.input}'.`);
      console.error(`👉 Run 'npx typebridge generate -i ${parsed.input} -t ${parsed.target} -o ${parsed.output}' to synchronize.`);
      process.exit(1);
    }

    console.log(`✅ [TypeBridge CI Gate] All schemas in sync between ${parsed.input} and ${parsed.output}.`);
  } else {
    console.error(`❌ Unknown command: ${command}`);
    printHelp();
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
