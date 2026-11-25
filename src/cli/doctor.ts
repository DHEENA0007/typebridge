import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadConfig } from '../config';
import { parseTypeScriptFile } from '../parsers/typescript';
import { getSchemaStats } from '../analyzer';
import { compile } from '../generators';

export interface DoctorCheck {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  detail: string;
  suggestion?: string;
}

export interface DoctorReport {
  ok: boolean;
  checks: DoctorCheck[];
}

function hasBinary(cmd: string, args: string[] = ['--version']): string | null {
  const res = spawnSync(cmd, args, { encoding: 'utf8' });
  if (res.status === 0 && !res.error) {
    return (res.stdout || res.stderr || '').trim().split('\n')[0] || 'installed';
  }
  return null;
}

/**
 * Runs workspace, schema, drift, and local toolchain diagnostics.
 */
export function runDoctor(cwd: string = process.cwd()): DoctorReport {
  const checks: DoctorCheck[] = [];

  // 1. Config check
  const loaded = loadConfig(cwd);
  if (!loaded) {
    checks.push({
      name: 'Configuration',
      status: 'warn',
      detail: 'No typebridge.config.json found in current directory.',
      suggestion: 'Run `typebridge init` to scaffold a starter configuration and schema.',
    });
  } else {
    checks.push({
      name: 'Configuration',
      status: 'pass',
      detail: `Loaded ${path.relative(cwd, loaded.configPath)} (${loaded.config.targets.length} targets).`,
    });

    // 2. Source schema & parser diagnostics
    const baseDir = path.dirname(loaded.configPath);
    const inputPath = path.resolve(baseDir, loaded.config.input);
    if (!fs.existsSync(inputPath)) {
      checks.push({
        name: 'Source Schema',
        status: 'fail',
        detail: `Input file not found: ${loaded.config.input}`,
        suggestion: `Create ${loaded.config.input} or update "input" in typebridge.config.json.`,
      });
    } else {
      const doc = parseTypeScriptFile(inputPath);
      const diags = doc.diagnostics || [];
      if (diags.length > 0) {
        checks.push({
          name: 'Parser Diagnostics',
          status: 'warn',
          detail: `${diags.length} diagnostic(s) found (first: ${diags[0].file}:${diags[0].line}:${diags[0].column} ${diags[0].message}).`,
          suggestion: 'Review unsupported TypeScript constructs or missing relative imports.',
        });
      } else {
        checks.push({
          name: 'Source Schema',
          status: 'pass',
          detail: `Parsed ${doc.definitions.length} definition(s) from ${loaded.config.input} with 0 diagnostics.`,
        });
      }

      // 3. Documentation coverage
      const stats = getSchemaStats(doc);
      checks.push({
        name: 'JSDoc Coverage',
        status: stats.docCoveragePercent >= 50 ? 'pass' : 'warn',
        detail: `${stats.documentedFieldsCount}/${stats.totalFieldsCount} fields documented (${stats.docCoveragePercent}%).`,
        ...(stats.docCoveragePercent < 50
          ? { suggestion: 'Add /** ... */ JSDoc comments to fields for richer Python/Rust/OpenAPI/MCP output.' }
          : {}),
      });

      // 4. Drift check
      let drifted = 0;
      for (const item of loaded.config.targets) {
        const outPath = path.resolve(baseDir, item.output);
        if (!fs.existsSync(outPath)) {
          drifted++;
          continue;
        }
        const expected = compile(doc, item.target, (item.options || {}) as any);
        const actual = fs.readFileSync(outPath, 'utf-8');
        if (expected.trim() !== actual.trim()) drifted++;
      }

      checks.push({
        name: 'Schema Sync',
        status: drifted === 0 ? 'pass' : 'warn',
        detail:
          drifted === 0
            ? `All ${loaded.config.targets.length} target outputs are in sync.`
            : `${drifted} of ${loaded.config.targets.length} target output(s) are missing or out of sync.`,
        ...(drifted > 0 ? { suggestion: 'Run `typebridge` to regenerate out-of-sync targets.' } : {}),
      });
    }
  }

  // 5. Local target toolchains
  const toolchains: Array<[string, string[]]> = [
    ['python3', ['--version']],
    ['go', ['version']],
    ['rustc', ['--version']],
  ];
  const foundTools: string[] = [];
  for (const [bin, args] of toolchains) {
    const ver = hasBinary(bin, args);
    if (ver) foundTools.push(`${bin} (${ver})`);
  }
  checks.push({
    name: 'Local Toolchains',
    status: 'pass',
    detail: foundTools.length > 0 ? foundTools.join(', ') : 'Node.js runtime only (no Python/Go/Rust compilers detected).',
  });

  return {
    ok: checks.every((c) => c.status !== 'fail'),
    checks,
  };
}
