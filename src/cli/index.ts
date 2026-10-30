#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import { parseTypeScript } from '../parsers/typescript';
import { compile, SupportedTarget } from '../generators';
import { loadConfig, TypeBridgeConfig } from '../config';

const VERSION = '0.1.0';

function printHelp() {
  console.log(`
TypeBridge v${VERSION}
Universal zero-overhead schema compiler

Usage:
  typebridge [command] [options]

Commands:
  generate (default) Compile schemas to target languages
  check              Verify existing outputs match source schema (CI gate)
  watch              Watch schema file and compile on save

Options:
  -c, --config   Path to configuration file (defaults to typebridge.config.json)
  -i, --input    Source schema file path (e.g. models.ts)
  -t, --target   Target: python, rust, go, typescript, json-schema
  -o, --output   Destination output file path
  -w, --watch    Watch for changes after running
  -h, --help     Show usage help
  -v, --version  Show version number

Examples:
  typebridge                                   # Batch compile using typebridge.config.json
  typebridge check                             # Batch verify all targets in CI
  typebridge watch                             # Auto-compile on save
  typebridge generate -i types.ts -t python -o models.py
`);
}

interface ParsedArgs {
  command?: string;
  config?: string;
  input?: string;
  target?: string;
  output?: string;
  watch?: boolean;
  help?: boolean;
  version?: boolean;
}

function parseArgs(args: string[]): ParsedArgs {
  const result: ParsedArgs = {};
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
    } else if (arg === '-w' || arg === '--watch') {
      result.watch = true;
    } else if (arg === '-c' || arg === '--config') {
      result.config = args[++i];
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

function compileSingle(inputPath: string, target: SupportedTarget, options: Record<string, any> = {}): string {
  const sourceCode = fs.readFileSync(inputPath, 'utf-8');
  const doc = parseTypeScript(sourceCode, path.basename(inputPath));
  return compile(doc, target, options as any);
}

function executeBatchGenerate(config: TypeBridgeConfig, baseDir: string) {
  const startTime = Date.now();
  const inputPath = path.resolve(baseDir, config.input);
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input file not found: ${inputPath}`);
  }

  const sourceCode = fs.readFileSync(inputPath, 'utf-8');
  const doc = parseTypeScript(sourceCode, path.basename(inputPath));

  for (const item of config.targets) {
    const outputPath = path.resolve(baseDir, item.output);
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const generated = compile(doc, item.target, (item.options || {}) as any);
    fs.writeFileSync(outputPath, generated, 'utf-8');
    console.log(`  ✓ Compiled ${item.target} -> ${path.relative(baseDir, outputPath)}`);
  }

  const duration = Date.now() - startTime;
  console.log(`TypeBridge: Synchronized ${config.targets.length} targets in ${duration}ms.`);
}

function executeBatchCheck(config: TypeBridgeConfig, baseDir: string): boolean {
  const inputPath = path.resolve(baseDir, config.input);
  if (!fs.existsSync(inputPath)) {
    console.error(`Error: Source schema file not found: ${inputPath}`);
    return false;
  }

  const sourceCode = fs.readFileSync(inputPath, 'utf-8');
  const doc = parseTypeScript(sourceCode, path.basename(inputPath));
  let hasDrift = false;

  for (const item of config.targets) {
    const outputPath = path.resolve(baseDir, item.output);
    const relOutput = path.relative(baseDir, outputPath);

    if (!fs.existsSync(outputPath)) {
      console.error(`  ✗ [DRIFT] Output file missing: ${relOutput}`);
      hasDrift = true;
      continue;
    }

    const expected = compile(doc, item.target, (item.options || {}) as any);
    const actual = fs.readFileSync(outputPath, 'utf-8');

    if (expected.trim() !== actual.trim()) {
      console.error(`  ✗ [DRIFT] Schema drift detected in: ${relOutput}`);
      hasDrift = true;
    } else {
      console.log(`  ✓ In sync: ${relOutput} (${item.target})`);
    }
  }

  return !hasDrift;
}

function startWatch(inputPath: string, onTrigger: () => void) {
  console.log(`TypeBridge: Watching ${inputPath} for changes... (Press Ctrl+C to exit)`);
  let timeout: NodeJS.Timeout | null = null;

  fs.watch(inputPath, (eventType) => {
    if (eventType === 'change') {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => {
        console.log(`\n[${new Date().toLocaleTimeString()}] Change detected in ${path.basename(inputPath)}, recompiling...`);
        try {
          onTrigger();
        } catch (err: any) {
          console.error(`TypeBridge Compile Error: ${err.message}`);
        }
      }, 100);
    }
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.version) {
    console.log(`typebridge v${VERSION}`);
    process.exit(0);
  }

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  const command = args.command || (args.watch ? 'watch' : 'generate');

  // Check if a configuration file exists or is specified
  const loaded = args.config
    ? {
        config: JSON.parse(fs.readFileSync(path.resolve(process.cwd(), args.config), 'utf-8')),
        configPath: path.resolve(process.cwd(), args.config),
      }
    : loadConfig(process.cwd());

  // Mode A: Using Configuration File (when -i and -t are not explicitly provided)
  if (loaded && !args.input && !args.target) {
    const { config, configPath } = loaded;
    const baseDir = path.dirname(configPath);

    if (command === 'generate') {
      executeBatchGenerate(config, baseDir);
      if (args.watch) {
        const inputPath = path.resolve(baseDir, config.input);
        startWatch(inputPath, () => executeBatchGenerate(config, baseDir));
      }
      return;
    }

    if (command === 'check') {
      const ok = executeBatchCheck(config, baseDir);
      if (!ok) {
        console.error('\nTypeBridge CI Check Failed: One or more targets are out of sync with the source schema.');
        console.error('Run `npx typebridge` to regenerate models.');
        process.exit(1);
      }
      console.log('\nTypeBridge CI Gate Passed: All schemas are perfectly synchronized.');
      return;
    }

    if (command === 'watch') {
      executeBatchGenerate(config, baseDir);
      const inputPath = path.resolve(baseDir, config.input);
      startWatch(inputPath, () => executeBatchGenerate(config, baseDir));
      return;
    }
  }

  // Mode B: Direct CLI arguments (-i, -t, -o)
  if (!args.input) {
    console.error('Error: Missing required option: -i, --input (or create a typebridge.config.json file)');
    printHelp();
    process.exit(1);
  }

  if (!args.target) {
    console.error('Error: Missing required option: -t, --target');
    process.exit(1);
  }

  const inputPath = path.resolve(process.cwd(), args.input);
  if (!fs.existsSync(inputPath)) {
    console.error(`Error: Input file not found: ${inputPath}`);
    process.exit(1);
  }

  const target = args.target as SupportedTarget;

  if (command === 'check') {
    if (!args.output) {
      console.error('Error: The "check" command requires -o, --output to compare against.');
      process.exit(1);
    }
    const outputPath = path.resolve(process.cwd(), args.output);
    if (!fs.existsSync(outputPath)) {
      console.error(`Error: Output file does not exist: ${args.output}`);
      process.exit(1);
    }

    const expected = compileSingle(inputPath, target);
    const actual = fs.readFileSync(outputPath, 'utf-8');

    if (expected.trim() !== actual.trim()) {
      console.error(`Schema drift detected: '${args.output}' is out of sync with '${args.input}'.`);
      process.exit(1);
    }
    console.log(`In sync: ${args.output} (${target})`);
    return;
  }

  // Generate single target
  const runSingle = () => {
    const generated = compileSingle(inputPath, target);
    if (args.output) {
      const outputPath = path.resolve(process.cwd(), args.output);
      const outputDir = path.dirname(outputPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      fs.writeFileSync(outputPath, generated, 'utf-8');
      console.log(`✓ Compiled ${args.input} -> ${args.output} (${target})`);
    } else {
      process.stdout.write(generated);
    }
  };

  runSingle();

  if (args.watch || command === 'watch') {
    startWatch(inputPath, runSingle);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
