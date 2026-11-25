import * as readline from 'node:readline';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseTypeScriptFile } from '../parsers/typescript';
import { compile, SupportedTarget } from '../generators';
import { getSchemaStats } from '../analyzer';
import { generateMockJson } from '../mock';
import { loadConfig } from '../config';
import { runDoctor } from './doctor';

const KNOWN_TARGETS: SupportedTarget[] = [
  'python', 'rust', 'go', 'typescript', 'json-schema', 'markdown', 'graphql', 'openapi', 'mcp', 'kotlin', 'swift',
];

function style(text: string, code: string): string {
  if (process.env.NO_COLOR || !process.stdout.isTTY) return text;
  return `\u001b[${code}m${text}\u001b[0m`;
}

function printBanner(activeFile: string | null) {
  console.log('');
  console.log(style('╭──────────────────────────────────────────────────────────────╮', '35'));
  console.log(style('│', '35') + '  ' + style('TypeBridge Interactive Shell', '1;37') + '  ' + style('v0.1.0', '2') + '                       ' + style('│', '35'));
  console.log(style('│', '35') + '  ' + style('Schema: ', '2') + style(activeFile || '(none loaded — use /load <file>)', activeFile ? '36' : '33').padEnd(50) + style('│', '35'));
  console.log(style('╰──────────────────────────────────────────────────────────────╯', '35'));
  console.log(style('  Type a slash command (/help, /compile python, /doctor) or ask naturally.', '2'));
  console.log('');
}

function printReplHelp() {
  console.log(`
  ${style('Slash Commands:', '1')}
    /load <file>           Load a TypeScript schema file
    /compile <target>      Compile active schema (${KNOWN_TARGETS.join(', ')})
    /inspect [Type]        List all models or inspect a specific model's fields
    /stats                 Show model count & JSDoc documentation coverage
    /mock [Type] [count]   Generate realistic mock JSON data
    /doctor                Run workspace, sync & toolchain diagnostics
    /help                  Show this help
    /exit                  Exit interactive shell

  ${style('Natural Prompts:', '1')}
    "compile to rust", "generate pydantic", "show stats", "mock 3 UserProfile", "check health"
`);
}

/**
 * Starts an interactive Claude-style REPL session for TypeBridge.
 */
export function startRepl(initialFile?: string): void {
  let activeFile: string | null = null;

  if (initialFile && fs.existsSync(path.resolve(process.cwd(), initialFile))) {
    activeFile = path.resolve(process.cwd(), initialFile);
  } else {
    const loaded = loadConfig(process.cwd());
    if (loaded) {
      const candidate = path.resolve(path.dirname(loaded.configPath), loaded.config.input);
      if (fs.existsSync(candidate)) activeFile = candidate;
    }
  }

  printBanner(activeFile ? path.relative(process.cwd(), activeFile) : null);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: style('typebridge ❯ ', '1;35'),
  });

  rl.prompt();

  rl.on('line', (rawLine) => {
    const input = rawLine.trim();
    if (!input) {
      rl.prompt();
      return;
    }

    try {
      const handled = handleReplInput(input, activeFile, (newFile) => {
        activeFile = newFile;
      });
      if (handled === 'exit') {
        rl.close();
        return;
      }
    } catch (err: any) {
      console.error(style(`  ✗ ${err?.message || String(err)}`, '31'));
    }

    rl.prompt();
  });

  rl.on('close', () => {
    console.log(style('\nGoodbye!', '2'));
    process.exit(0);
  });
}

function handleReplInput(
  input: string,
  activeFile: string | null,
  setActiveFile: (f: string) => void
): 'exit' | void {
  const lower = input.toLowerCase();

  if (lower === '/exit' || lower === '/quit' || lower === 'exit' || lower === 'quit') {
    return 'exit';
  }

  if (lower === '/help' || lower === 'help') {
    printReplHelp();
    return;
  }

  if (lower.startsWith('/load ')) {
    const target = path.resolve(process.cwd(), input.slice(6).trim());
    if (!fs.existsSync(target)) {
      console.error(style(`  ✗ File not found: ${target}`, '31'));
      return;
    }
    setActiveFile(target);
    const doc = parseTypeScriptFile(target);
    console.log(style(`  ✓ Loaded ${path.relative(process.cwd(), target)} (${doc.definitions.length} definitions)`, '32'));
    return;
  }

  if (lower === '/doctor' || lower.includes('doctor') || lower.includes('health')) {
    const report = runDoctor(process.cwd());
    for (const check of report.checks) {
      const icon = check.status === 'pass' ? style('✓', '32') : check.status === 'warn' ? style('!', '33') : style('✗', '31');
      console.log(`  ${icon} ${style(check.name, '1')}: ${check.detail}`);
      if (check.suggestion) console.log(style(`    → ${check.suggestion}`, '2'));
    }
    return;
  }

  if (!activeFile) {
    console.log(style('  ! No schema loaded. Run `/load <path/to/schema.ts>` first.', '33'));
    return;
  }

  const doc = parseTypeScriptFile(activeFile);

  if (lower === '/stats' || lower.includes('stats') || lower.includes('coverage')) {
    const stats = getSchemaStats(doc);
    console.log(`  Models: ${stats.modelsCount} | Enums: ${stats.enumsCount} | Fields: ${stats.totalFieldsCount} | JSDoc Coverage: ${stats.docCoveragePercent}%`);
    return;
  }

  if (lower.startsWith('/inspect') || lower.includes('what types') || lower.includes('list models') || lower.startsWith('inspect ')) {
    const nameArg = input.replace(/^\/?inspect\s*/i, '').trim();
    if (!nameArg || lower.includes('what types') || lower.includes('list models')) {
      for (const def of doc.definitions) {
        console.log(`  • ${style(def.name, '36')} (${def.kind})`);
      }
      return;
    }
    const found = doc.definitions.find((d) => d.name.toLowerCase() === nameArg.toLowerCase());
    if (!found) {
      console.log(style(`  ✗ Type "${nameArg}" not found.`, '33'));
      return;
    }
    console.log(JSON.stringify(found, null, 2));
    return;
  }

  if (lower.startsWith('/mock') || lower.startsWith('mock ')) {
    const parts = input.replace(/^\/?mock\s*/i, '').trim().split(/\s+/).filter(Boolean);
    let count = 1;
    let typeName: string | undefined;
    for (const p of parts) {
      if (/^\d+$/.test(p)) count = parseInt(p, 10);
      else typeName = p;
    }
    console.log(generateMockJson(doc, typeName, { count }));
    return;
  }

  // Match `/compile <target>` or natural language like "compile to python", "generate pydantic"
  let matchedTarget: SupportedTarget | undefined;
  if (lower.startsWith('/compile ')) {
    matchedTarget = input.slice(9).trim().toLowerCase() as SupportedTarget;
  } else {
    const aliases: Record<string, SupportedTarget> = {
      pydantic: 'python',
      python: 'python',
      rust: 'rust',
      serde: 'rust',
      golang: 'go',
      go: 'go',
      zod: 'typescript',
      typescript: 'typescript',
      'json-schema': 'json-schema',
      json: 'json-schema',
      markdown: 'markdown',
      docs: 'markdown',
      graphql: 'graphql',
      openapi: 'openapi',
      mcp: 'mcp',
      kotlin: 'kotlin',
      swift: 'swift',
    };
    for (const [kw, tgt] of Object.entries(aliases)) {
      if (new RegExp(`\\b${kw}\\b`, 'i').test(lower)) {
        matchedTarget = tgt;
        break;
      }
    }
  }

  if (matchedTarget) {
    const output = compile(doc, matchedTarget);
    console.log(output);
    return;
  }

  console.log(style(`  ? Didn't recognize "${input}". Type /help for commands.`, '33'));
}
