#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import { parseTypeScriptFile } from '../parsers/typescript';
import { parseJsonSchema } from '../parsers/json-schema';
import { SchemaDocument } from '../ir/types';
import { compile, SupportedTarget } from '../generators';
import { loadConfig, TypeBridgeConfig } from '../config';
import { getSchemaStats, diffSchemas } from '../analyzer';
import { generateMockJson } from '../mock';
import { startStudioServer } from '../server/studio';
import { runDoctor } from './doctor';
import { startMcpServer } from './mcp-server';
import { startRepl } from './repl';

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
  diff <base> <new>  Analyze breaking API changes between two schema versions
  stats              Display schema metrics and JSDoc documentation coverage
  mock [file] [type] Synthesize realistic mock JSON data from schema
  studio / serve     Launch local real-time web compiler studio
  repl / chat        Launch interactive Claude-style TypeBridge shell
  doctor             Check config, schema diagnostics, sync, and local toolchains
  mcp-server         Start stdio Model Context Protocol (MCP) server for AI clients
  init               Scaffold starter configuration and models

Options:
  -c, --config   Path to configuration file (defaults to typebridge.config.json)
  -i, --input    Source schema file path (e.g. models.ts)
  -t, --target   Target: python, rust, go, typescript, json-schema, markdown, graphql, openapi, mcp, kotlin, swift
  -o, --output   Destination output file path
  --format       Output format: text (default) or json (for stats, diff, doctor, check)
  --json         Shorthand for --format json
  --dry-run      Preview generated files without writing them
  -p, --port     Port for studio server (defaults to 3456)
  -n, --count    Number of mock data items to synthesize (defaults to 1)
  -w, --watch    Watch for changes after running
  -h, --help     Show usage help
  -v, --version  Show version number

Examples:
  typebridge                                   # Batch compile using typebridge.config.json
  typebridge studio                            # Launch local web studio playground
  typebridge mock schema/models.ts User -n 3   # Generate 3 mock JSON objects for User
  typebridge diff schema/v1.ts schema/v2.ts    # Detect breaking schema changes
  typebridge stats -i schema/models.ts         # Inspect documentation coverage & stats
  typebridge init                              # Scaffold starter project
`);
}


interface ParsedArgs {
  command?: string;
  config?: string;
  input?: string;
  target?: string;
  output?: string;
  port?: number;
  count?: number;
  watch?: boolean;
  dryRun?: boolean;
  format?: 'text' | 'json';
  help?: boolean;
  version?: boolean;
  positional: string[];
}

function parseArgs(args: string[]): ParsedArgs {
  const result: ParsedArgs = { positional: [] };
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
    } else if (arg === '--dry-run') {
      result.dryRun = true;
    } else if (arg === '--json') {
      result.format = 'json';
    } else if (arg === '--format') {
      result.format = args[++i] === 'json' ? 'json' : 'text';
    } else if (arg === '-c' || arg === '--config') {
      result.config = args[++i];
    } else if (arg === '-i' || arg === '--input') {
      result.input = args[++i];
    } else if (arg === '-t' || arg === '--target') {
      result.target = args[++i];
    } else if (arg === '-o' || arg === '--output') {
      result.output = args[++i];
    } else if (arg === '-p' || arg === '--port') {
      result.port = parseInt(args[++i], 10);
    } else if (arg === '-n' || arg === '--count') {
      result.count = parseInt(args[++i], 10);
    } else if (!arg.startsWith('-')) {
      result.positional.push(arg);
    }
  }

  return result;
}


function colorize(text: string, color: 'red' | 'green' | 'cyan' | 'yellow'): string {
  const enabled = !process.env.NO_COLOR && process.env.FORCE_COLOR !== '0' && (process.stdout.isTTY || process.env.FORCE_COLOR === '1');
  if (!enabled) return text;
  const codes = { red: '\u001b[31m', green: '\u001b[32m', cyan: '\u001b[36m', yellow: '\u001b[33m' };
  return codes[color] + text + '\u001b[0m';
}
function printLineDiff(filePath: string, current: string, generated: string): void {
  const oldLines = current.split(/\r?\n/), newLines = generated.split(/\r?\n/);
  console.log(colorize('\n--- ' + filePath + ' (current)\n+++ ' + filePath + ' (generated)', 'cyan'));
  if ((oldLines.length + 1) * (newLines.length + 1) > 500000) {
    for (const line of oldLines) console.log(colorize('-' + line, 'red'));
    for (const line of newLines) console.log(colorize('+' + line, 'green'));
    return;
  }
  const lcs = Array.from({ length: oldLines.length + 1 }, () => new Uint32Array(newLines.length + 1));
  for (let i = oldLines.length - 1; i >= 0; i--) for (let j = newLines.length - 1; j >= 0; j--)
    lcs[i][j] = oldLines[i] === newLines[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  let i = 0, j = 0;
  while (i < oldLines.length || j < newLines.length) {
    if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) { console.log(' ' + oldLines[i]); i++; j++; }
    else if (j < newLines.length && (i === oldLines.length || lcs[i][j + 1] >= lcs[i + 1][j])) { console.log(colorize('+' + newLines[j], 'green')); j++; }
    else { console.log(colorize('-' + oldLines[i], 'red')); i++; }
  }
}
function parseAndReport(inputPath: string): SchemaDocument {
  if (inputPath.toLowerCase().endsWith('.json')) {
    const raw = fs.readFileSync(inputPath, 'utf-8');
    return parseJsonSchema(raw, path.basename(inputPath));
  }
  const doc = parseTypeScriptFile(inputPath);
  if (doc.diagnostics && doc.diagnostics.length > 0) {
    for (const d of doc.diagnostics) {
      const label = d.severity === 'error' ? 'error' : 'warning';
      console.error(colorize(`${d.file}:${d.line}:${d.column} - ${label}: ${d.message}`, d.severity === 'error' ? 'red' : 'yellow'));
    }
  }
  return doc;
}

function compileSingle(inputPath: string, target: SupportedTarget, options: Record<string, any> = {}): string {
  const doc = parseAndReport(inputPath);
  return compile(doc, target, options as any);
}

function executeBatchGenerate(config: TypeBridgeConfig, baseDir: string, dryRun = false) {
  const startTime = Date.now();
  const inputPath = path.resolve(baseDir, config.input);
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input file not found: ${inputPath}`);
  }

  const doc = parseAndReport(inputPath);

  for (const item of config.targets) {
    const outputPath = path.resolve(baseDir, item.output);
    const generated = compile(doc, item.target, (item.options || {}) as any);
    const relativePath = path.relative(baseDir, outputPath);
    if (dryRun) {
      const exists = fs.existsSync(outputPath), current = exists ? fs.readFileSync(outputPath, 'utf-8') : '';
      if (!exists || current.trim() !== generated.trim()) {
        console.log(colorize('[DRY RUN] Would ' + (exists ? 'update ' : 'create ') + relativePath + ' (' + item.target + ')', 'cyan'));
        printLineDiff(relativePath, current, generated);
      } else console.log('[DRY RUN] No changes: ' + relativePath + ' (' + item.target + ')');
      continue;
    }
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(outputPath, generated, 'utf-8');
    console.log(`  ✓ Compiled ${item.target} -> ${relativePath}`);
  }

  const duration = Date.now() - startTime;
  console.log(dryRun ? `TypeBridge: Dry run complete for ${config.targets.length} targets in ${duration}ms. No files were written.` : `TypeBridge: Synchronized ${config.targets.length} targets in ${duration}ms.`);
}

function executeBatchCheck(config: TypeBridgeConfig, baseDir: string): boolean {
  const inputPath = path.resolve(baseDir, config.input);
  if (!fs.existsSync(inputPath)) {
    console.error(`Error: Source schema file not found: ${inputPath}`);
    return false;
  }

  const doc = parseAndReport(inputPath);
  let hasDrift = false;

  for (const item of config.targets) {
    const outputPath = path.resolve(baseDir, item.output);
    const relOutput = path.relative(baseDir, outputPath);

    if (!fs.existsSync(outputPath)) {
      console.error(`  ✗ [DRIFT] Output file missing: ${relOutput}`);
      printLineDiff(relOutput, '', compile(doc, item.target, (item.options || {}) as any));
      hasDrift = true;
      continue;
    }

    const expected = compile(doc, item.target, (item.options || {}) as any);
    const actual = fs.readFileSync(outputPath, 'utf-8');

    if (expected.trim() !== actual.trim()) {
      console.error(`  ✗ [DRIFT] Schema drift detected in: ${relOutput}`);
      printLineDiff(relOutput, actual, expected);
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

function executeInit() {
  const configPath = path.resolve(process.cwd(), 'typebridge.config.json');
  const schemaDir = path.resolve(process.cwd(), 'schema');
  const schemaPath = path.resolve(schemaDir, 'models.ts');

  if (fs.existsSync(configPath)) {
    console.log('typebridge.config.json already exists.');
    return;
  }

  if (!fs.existsSync(schemaDir)) {
    fs.mkdirSync(schemaDir, { recursive: true });
  }

  if (!fs.existsSync(schemaPath)) {
    const starterSchema = `/**
 * User account authorization levels
 */
export type UserRole = 'ADMIN' | 'MEMBER' | 'GUEST';

/**
 * Shared user profile representation
 */
export interface UserProfile {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  age?: number;
  tags: string[];
  createdAt: Date;
}
`;
    fs.writeFileSync(schemaPath, starterSchema, 'utf-8');
    console.log('  ✓ Created schema/models.ts');
  }

  const starterConfig: TypeBridgeConfig = {
    input: 'schema/models.ts',
    targets: [
      { target: 'python', output: 'backend/models.py', options: { usePydantic: true } },
      { target: 'rust', output: 'src/models.rs' },
      { target: 'go', output: 'pkg/models/models.go', options: { packageName: 'models' } },
      { target: 'json-schema', output: 'dist/schema.json' },
      { target: 'markdown', output: 'docs/MODELS.md' }
    ]
  };

  fs.writeFileSync(configPath, JSON.stringify(starterConfig, null, 2), 'utf-8');
  console.log('  ✓ Created typebridge.config.json');
  console.log('\nTypeBridge initialized! Run `npx typebridge` to compile.');
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

  // Command: init
  if (command === 'init') {
    executeInit();
    return;
  }

  // Command: repl / chat
  if (command === 'repl' || command === 'chat') {
    startRepl(args.input || args.positional[0]);
    return;
  }

  // Command: mcp-server
  if (command === 'mcp-server') {
    startMcpServer();
    return;
  }

  // Command: doctor
  if (command === 'doctor') {
    const report = runDoctor(process.cwd());
    if (args.format === 'json') {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log('\nTypeBridge Doctor\n' + '─'.repeat(40));
      for (const check of report.checks) {
        const icon = check.status === 'pass' ? colorize('✓', 'green') : check.status === 'warn' ? colorize('!', 'yellow') : colorize('✗', 'red');
        console.log(`  ${icon} ${check.name}: ${check.detail}`);
        if (check.suggestion) console.log(colorize(`    → ${check.suggestion}`, 'cyan'));
      }
      console.log('');
    }
    if (!report.ok) process.exit(1);
    return;
  }

  // Command: diff <base> <new>
  if (command === 'diff') {
    const fileA = args.positional[0] || args.input;
    const fileB = args.positional[1];
    if (!fileA || !fileB) {
      console.error('Error: "diff" requires two schema files: `typebridge diff <baseSchema> <newSchema>`');
      process.exit(1);
    }
    const pathA = path.resolve(process.cwd(), fileA);
    const pathB = path.resolve(process.cwd(), fileB);
    if (!fs.existsSync(pathA) || !fs.existsSync(pathB)) {
      console.error('Error: One or both schema files do not exist.');
      process.exit(1);
    }
    const docA = parseAndReport(pathA);
    const docB = parseAndReport(pathB);
    const result = diffSchemas(docA, docB);

    console.log(`\nTypeBridge Schema Diff: ${fileA} ➔ ${fileB}\n`);
    if (result.nonBreaking.length > 0) {
      console.log('Non-Breaking Changes:');
      for (const item of result.nonBreaking) console.log(`  + ${item}`);
      console.log('');
    }
    if (result.breaking.length > 0) {
      console.log('🚨 Breaking Changes Detected:');
      for (const item of result.breaking) console.log(`  ✗ ${item}`);
      console.log('\nResult: Incompatible schema modification. CI gate failed.');
      process.exit(1);
    } else {
      console.log('✓ All changes are backward-compatible.');
      return;
    }
  }

  // Command: stats
  if (command === 'stats') {
    const loaded = loadConfig(process.cwd());
    const targetFile = args.input || (loaded ? loaded.config.input : 'schema/models.ts');
    const targetPath = path.resolve(process.cwd(), targetFile);
    if (!fs.existsSync(targetPath)) {
      console.error(`Error: Schema file not found: ${targetPath}`);
      process.exit(1);
    }
    const doc = parseAndReport(targetPath);
    const stats = getSchemaStats(doc);

    if (args.format === 'json') {
      console.log(JSON.stringify({ file: targetFile, ...stats, diagnostics: doc.diagnostics || [] }, null, 2));
      return;
    }

    console.log(`\n📊 Schema Analysis: ${targetFile}`);
    console.log('─'.repeat(40));
    console.log(`  Models (Structs):       ${stats.modelsCount}`);
    console.log(`  Enums:                  ${stats.enumsCount}`);
    console.log(`  Total Fields:           ${stats.totalFieldsCount}`);
    console.log(`  Documented Fields:      ${stats.documentedFieldsCount} / ${stats.totalFieldsCount}`);
    console.log(`  JSDoc Doc Coverage:     ${stats.docCoveragePercent}%`);
    console.log('─'.repeat(40));
    return;
  }

  // Command: mock [file] [type]
  if (command === 'mock') {
    const loaded = loadConfig(process.cwd());
    const targetFile =
      args.input ||
      args.positional[0] ||
      (loaded ? loaded.config.input : 'schema/models.ts');
    const targetPath = path.resolve(process.cwd(), targetFile);
    if (!fs.existsSync(targetPath)) {
      console.error(`Error: Schema file not found: ${targetPath}`);
      process.exit(1);
    }
    const doc = parseAndReport(targetPath);
    const typeName = args.positional[1];
    const count = args.count || 1;
    const jsonOutput = generateMockJson(doc, typeName, { count });
    console.log(jsonOutput);
    return;
  }

  // Command: studio / serve
  if (command === 'studio' || command === 'serve') {
    const loaded = loadConfig(process.cwd());
    const targetFile =
      args.input ||
      args.positional[0] ||
      (loaded ? path.resolve(path.dirname(loaded.configPath), loaded.config.input) : undefined);
    const port = args.port || 3456;
    startStudioServer({ port, initialFile: targetFile });
    return;
  }

  // Load config if exists
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
      executeBatchGenerate(config, baseDir, args.dryRun);
      if (args.watch) {
        const inputPath = path.resolve(baseDir, config.input);
        startWatch(inputPath, () => executeBatchGenerate(config, baseDir, args.dryRun));
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
      executeBatchGenerate(config, baseDir, args.dryRun);
      const inputPath = path.resolve(baseDir, config.input);
      startWatch(inputPath, () => executeBatchGenerate(config, baseDir, args.dryRun));
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
      printLineDiff(args.output, '', compileSingle(inputPath, target));
      process.exit(1);
    }

    const expected = compileSingle(inputPath, target);
    const actual = fs.readFileSync(outputPath, 'utf-8');

    if (expected.trim() !== actual.trim()) {
      console.error(`Schema drift detected: '${args.output}' is out of sync with '${args.input}'.`);
      printLineDiff(args.output, actual, expected);
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
      if (args.dryRun) {
        const exists = fs.existsSync(outputPath), current = exists ? fs.readFileSync(outputPath, 'utf-8') : '';
        if (!exists || current.trim() !== generated.trim()) {
          console.log(colorize('[DRY RUN] Would ' + (exists ? 'update ' : 'create ') + args.output + ' (' + target + ')', 'cyan'));
          printLineDiff(args.output, current, generated);
        } else console.log('[DRY RUN] No changes: ' + args.output + ' (' + target + ')');
      } else {
        const outputDir = path.dirname(outputPath);
        if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
        fs.writeFileSync(outputPath, generated, 'utf-8');
        console.log(`✓ Compiled ${args.input} -> ${args.output} (${target})`);
      }
    } else {
      if (args.dryRun) console.log('[DRY RUN] Generated output preview (no file was written).');
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
