import * as readline from 'node:readline';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseTypeScriptFile } from '../parsers/typescript';
import { compile, SupportedTarget } from '../generators';
import { getSchemaStats, diffSchemas } from '../analyzer';
import { generateMockJson } from '../mock';
import { loadConfig } from '../config';

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Record<string, any>;
}

const TOOLS = [
  {
    name: 'compile_schema',
    description: 'Compile a TypeScript schema file into a target language or format (python, rust, go, typescript, json-schema, markdown, graphql, openapi, mcp).',
    inputSchema: {
      type: 'object',
      properties: {
        input: { type: 'string', description: 'Path to the TypeScript schema file.' },
        target: { type: 'string', description: 'Target language or format.' },
      },
      required: ['input', 'target'],
    },
  },
  {
    name: 'schema_stats',
    description: 'Analyze a TypeScript schema file and return model counts, field counts, JSDoc coverage, and parser diagnostics.',
    inputSchema: {
      type: 'object',
      properties: {
        input: { type: 'string', description: 'Path to the TypeScript schema file.' },
      },
      required: ['input'],
    },
  },
  {
    name: 'diff_schemas',
    description: 'Compare two TypeScript schema files for breaking and non-breaking API changes.',
    inputSchema: {
      type: 'object',
      properties: {
        base: { type: 'string', description: 'Path to the base schema file.' },
        next: { type: 'string', description: 'Path to the updated schema file.' },
      },
      required: ['base', 'next'],
    },
  },
  {
    name: 'generate_mock',
    description: 'Generate realistic mock JSON data from a TypeScript schema file.',
    inputSchema: {
      type: 'object',
      properties: {
        input: { type: 'string', description: 'Path to the TypeScript schema file.' },
        typeName: { type: 'string', description: 'Optional model/interface name to generate.' },
        count: { type: 'number', description: 'Number of mock items (default 1).' },
      },
      required: ['input'],
    },
  },
  {
    name: 'check_drift',
    description: 'Check if all targets in typebridge.config.json are synchronized with the source schema.',
    inputSchema: {
      type: 'object',
      properties: {
        cwd: { type: 'string', description: 'Optional working directory containing typebridge.config.json.' },
      },
    },
  },
];

/**
 * Handles a single JSON-RPC 2.0 MCP message and returns the response object (or null for notifications).
 */
export function handleMcpMessage(req: JsonRpcRequest): Record<string, any> | null {
  if (req.id === undefined) {
    return null; // notification (e.g. notifications/initialized)
  }

  try {
    if (req.method === 'initialize') {
      return {
        jsonrpc: '2.0',
        id: req.id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'typebridge', version: '0.1.0' },
        },
      };
    }

    if (req.method === 'tools/list') {
      return {
        jsonrpc: '2.0',
        id: req.id,
        result: { tools: TOOLS },
      };
    }

    if (req.method === 'tools/call') {
      const toolName = req.params?.name;
      const args = req.params?.arguments || {};
      const text = executeTool(toolName, args);
      return {
        jsonrpc: '2.0',
        id: req.id,
        result: {
          content: [{ type: 'text', text }],
        },
      };
    }

    return {
      jsonrpc: '2.0',
      id: req.id,
      error: { code: -32601, message: `Method not found: ${req.method}` },
    };
  } catch (err: any) {
    return {
      jsonrpc: '2.0',
      id: req.id,
      error: { code: -32000, message: err?.message || String(err) },
    };
  }
}

function executeTool(name: string, args: Record<string, any>): string {
  switch (name) {
    case 'compile_schema': {
      const inputPath = path.resolve(process.cwd(), String(args.input));
      const doc = parseTypeScriptFile(inputPath);
      return compile(doc, String(args.target) as SupportedTarget);
    }
    case 'schema_stats': {
      const inputPath = path.resolve(process.cwd(), String(args.input));
      const doc = parseTypeScriptFile(inputPath);
      const stats = getSchemaStats(doc);
      return JSON.stringify({ ...stats, diagnostics: doc.diagnostics || [] }, null, 2);
    }
    case 'diff_schemas': {
      const docA = parseTypeScriptFile(path.resolve(process.cwd(), String(args.base)));
      const docB = parseTypeScriptFile(path.resolve(process.cwd(), String(args.next)));
      return JSON.stringify(diffSchemas(docA, docB), null, 2);
    }
    case 'generate_mock': {
      const inputPath = path.resolve(process.cwd(), String(args.input));
      const doc = parseTypeScriptFile(inputPath);
      return generateMockJson(doc, args.typeName, { count: args.count || 1 });
    }
    case 'check_drift': {
      const cwd = args.cwd ? path.resolve(String(args.cwd)) : process.cwd();
      const loaded = loadConfig(cwd);
      if (!loaded) {
        return JSON.stringify({ ok: false, error: 'typebridge.config.json not found' });
      }
      const baseDir = path.dirname(loaded.configPath);
      const doc = parseTypeScriptFile(path.resolve(baseDir, loaded.config.input));
      const targets = loaded.config.targets.map((item) => {
        const outPath = path.resolve(baseDir, item.output);
        if (!fs.existsSync(outPath)) return { target: item.target, output: item.output, status: 'missing' };
        const expected = compile(doc, item.target, (item.options || {}) as any);
        const actual = fs.readFileSync(outPath, 'utf-8');
        return {
          target: item.target,
          output: item.output,
          status: expected.trim() === actual.trim() ? 'in_sync' : 'drifted',
        };
      });
      return JSON.stringify({ ok: targets.every((t) => t.status === 'in_sync'), targets }, null, 2);
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

/**
 * Starts a stdio Model Context Protocol (MCP) server for Claude Code / Desktop / Cursor.
 */
export function startMcpServer(): void {
  const rl = readline.createInterface({
    input: process.stdin,
    crlfDelay: Infinity,
  });

  rl.on('line', (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    try {
      const req = JSON.parse(trimmed) as JsonRpcRequest;
      const res = handleMcpMessage(req);
      if (res) {
        process.stdout.write(JSON.stringify(res) + '\n');
      }
    } catch {
      process.stdout.write(
        JSON.stringify({
          jsonrpc: '2.0',
          id: null,
          error: { code: -32700, message: 'Parse error' },
        }) + '\n'
      );
    }
  });
}
