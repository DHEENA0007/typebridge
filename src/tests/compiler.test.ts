import { test, describe } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseTypeScript, parseTypeScriptFile } from '../parsers/typescript';
import { compile } from '../generators';

const sampleTs = `
export type UserRole = 'ADMIN' | 'MEMBER' | 'GUEST';

export interface UserProfile {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  age?: number;
  tags: string[];
}
`;

describe('TypeBridge Compiler Suite', () => {
  test('parses TypeScript interface and enum correctly', () => {
    const doc = parseTypeScript(sampleTs, 'sample.ts');
    assert.strictEqual(doc.definitions.length, 2);

    const enumDef = doc.definitions[0];
    assert.strictEqual(enumDef.name, 'UserRole');
    assert.strictEqual(enumDef.kind, 'enum');

    const structDef = doc.definitions[1];
    assert.strictEqual(structDef.name, 'UserProfile');
    assert.strictEqual(structDef.kind, 'struct');
    if (structDef.kind === 'struct') {
      assert.strictEqual(structDef.fields.length, 6);
      const ageField = structDef.fields.find((f) => f.name === 'age');
      assert.ok(ageField);
      assert.strictEqual(ageField.optional, true);
    }
  });

  test('compiles to Python Pydantic v2', () => {
    const doc = parseTypeScript(sampleTs, 'sample.ts');
    const py = compile(doc, 'python');
    assert.ok(py.includes('class UserRole(str, Enum):'));
    assert.ok(py.includes('class UserProfile(BaseModel):'));
    assert.ok(py.includes('id: str'));
    assert.ok(py.includes('age: Optional[float] = None'));
    assert.ok(py.includes('tags: List[str]'));
  });

  test('compiles to Rust with Serde', () => {
    const doc = parseTypeScript(sampleTs, 'sample.ts');
    const rust = compile(doc, 'rust');
    assert.ok(rust.includes('#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]'));
    assert.ok(rust.includes('pub enum UserRole {'));
    assert.ok(rust.includes('pub struct UserProfile {'));
    assert.ok(rust.includes('pub id: String,'));
    assert.ok(rust.includes('pub age: Option<f64>,'));
    assert.ok(rust.includes('pub tags: Vec<String>,'));
  });

  test('compiles to Go structs with JSON tags', () => {
    const doc = parseTypeScript(sampleTs, 'sample.ts');
    const go = compile(doc, 'go');
    assert.ok(go.includes('type UserRole string'));
    assert.ok(go.includes('type UserProfile struct {'));
    assert.ok(go.includes('Id string `json:"id"`'));
    assert.ok(go.includes('Age *float64 `json:"age,omitempty"`'));
    assert.ok(go.includes('Tags []string `json:"tags"`'));
  });

  test('compiles to TypeScript with Zod schemas', () => {
    const doc = parseTypeScript(sampleTs, 'sample.ts');
    const ts = compile(doc, 'typescript', { typescript: { includeZod: true } });
    assert.ok(ts.includes('export interface UserProfile {'));
    assert.ok(ts.includes('export const UserProfileSchema = z.object({'));
    assert.ok(ts.includes('id: z.string(),'));
    assert.ok(ts.includes('age: z.number().optional(),'));
    assert.ok(ts.includes('tags: z.array(z.string()),'));
  });

  test('compiles to standard JSON Schema', () => {
    const doc = parseTypeScript(sampleTs, 'sample.ts');
    const jsonStr = compile(doc, 'json-schema');
    const parsed = JSON.parse(jsonStr);
    assert.strictEqual(parsed.type, 'object');
    assert.ok(parsed.properties.id);
    assert.strictEqual(parsed.properties.id.type, 'string');
    assert.ok(parsed.$defs.UserRole);
    assert.deepStrictEqual(parsed.$defs.UserRole.enum, ['ADMIN', 'MEMBER', 'GUEST']);
  });

  test('compiles to Markdown documentation table', () => {
    const doc = parseTypeScript(sampleTs, 'sample.ts');
    const md = compile(doc, 'markdown');
    assert.ok(md.includes('# sample.ts'));
    assert.ok(md.includes('## UserProfile'));
    assert.ok(md.includes('| Field | Type | Required | Description |'));
    assert.ok(md.includes('| `username` | `string` | **Yes** |'));
    assert.ok(md.includes('| `age` | `number` | No |'));
  });

  test('compiles to GraphQL SDL', () => {
    const doc = parseTypeScript(sampleTs, 'sample.ts');
    const gql = compile(doc, 'graphql');
    assert.ok(gql.includes('type UserProfile {'));
    assert.ok(gql.includes('id: ID!'));
    assert.ok(gql.includes('username: String!'));
    assert.ok(gql.includes('age: Float'));
    assert.ok(gql.includes('tags: [String!]!'));
    assert.ok(gql.includes('enum UserRole {'));
    assert.ok(gql.includes('ADMIN'));
  });

  test('compiles to OpenAPI 3.1 and MCP Tools', () => {
    const doc = parseTypeScript(sampleTs, 'sample.ts');
    const oasStr = compile(doc, 'openapi');
    const oas = JSON.parse(oasStr);
    assert.strictEqual(oas.openapi, '3.1.0');
    assert.ok(oas.components.schemas.UserProfile);
    assert.strictEqual(oas.components.schemas.UserProfile.type, 'object');

    const mcpStr = compile(doc, 'mcp');
    const mcp = JSON.parse(mcpStr);
    assert.ok(Array.isArray(mcp.tools));
    assert.strictEqual(mcp.tools[0].name, 'create_user_profile');
  });

  test('generates realistic mock JSON data', async () => {
    const { generateMockData } = await import('../mock');
    const doc = parseTypeScript(sampleTs, 'sample.ts');
    const mock = generateMockData(doc, 'UserProfile', { count: 1 });
    assert.ok(mock.id);
    assert.ok(mock.username);
    assert.ok(mock.email.includes('@'));
    assert.ok(['ADMIN', 'MEMBER', 'GUEST'].includes(mock.role));
    assert.ok(Array.isArray(mock.tags));
  });

  test('loads typebridge.config.json correctly', async () => {
    const { loadConfig } = await import('../config');
    const loaded = loadConfig();
    assert.ok(loaded);
    assert.strictEqual(loaded.config.input, 'examples/schema.ts');
    assert.strictEqual(loaded.config.targets.length, 7);
    assert.ok(loaded.config.targets.some((t: any) => t.target === 'python'));
    assert.ok(loaded.config.targets.some((t: any) => t.target === 'rust'));
    assert.ok(loaded.config.targets.some((t: any) => t.target === 'go'));
    assert.ok(loaded.config.targets.some((t: any) => t.target === 'json-schema'));
    assert.ok(loaded.config.targets.some((t: any) => t.target === 'markdown'));
    assert.ok(loaded.config.targets.some((t: any) => t.target === 'graphql'));
    assert.ok(loaded.config.targets.some((t: any) => t.target === 'openapi'));
  });

  test('diffSchemas detects breaking vs non-breaking changes', async () => {
    const { diffSchemas } = await import('../analyzer');
    const v1 = parseTypeScript(`
      export interface User { id: string; email?: string; }
    `);
    const v2Breaking = parseTypeScript(`
      export interface User { id: string; email: string; }
    `);
    const v2Compatible = parseTypeScript(`
      export interface User { id: string; email?: string; nickname?: string; }
    `);

    const resBreaking = diffSchemas(v1, v2Breaking);
    assert.strictEqual(resBreaking.isCompatible, false);
    assert.ok(resBreaking.breaking.some((b) => b.includes('changed from optional to required')));

    const resCompatible = diffSchemas(v1, v2Compatible);
    assert.strictEqual(resCompatible.isCompatible, true);
    assert.strictEqual(resCompatible.breaking.length, 0);
    assert.strictEqual(resCompatible.nonBreaking.length, 1);
  });

  test('getSchemaStats computes documentation coverage', async () => {
    const { getSchemaStats } = await import('../analyzer');
    const doc = parseTypeScript(`
      /** User account */
      export interface User {
        /** Unique identifier */
        id: string;
        username: string;
      }
    `);
    const stats = getSchemaStats(doc);
    assert.strictEqual(stats.modelsCount, 1);
    assert.strictEqual(stats.totalFieldsCount, 2);
    assert.strictEqual(stats.documentedFieldsCount, 1);
    assert.strictEqual(stats.docCoveragePercent, 50);
  });

  test('CLI dry-run previews generated output without writing files', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'typebridge-dry-run-'));
    try {
      fs.writeFileSync(path.join(dir, 'schema.ts'), 'export interface User { id: string; }\n');
      fs.writeFileSync(path.join(dir, 'user.json'), '{ "old": true }\n');
      const cli = path.resolve(__dirname, '../cli/index.js');
      const result = spawnSync(process.execPath, [cli, 'generate', '-i', 'schema.ts', '-t', 'json-schema', '-o', 'user.json', '--dry-run'], { cwd: dir, encoding: 'utf8', env: { ...process.env, FORCE_COLOR: '1' } });
      assert.strictEqual(result.status, 0, result.stderr);
      assert.ok(result.stdout.includes('[DRY RUN] Would update user.json'));
      assert.ok(result.stdout.includes('\u001b[32m') || result.stdout.includes('\u001b[31m'));
      assert.strictEqual(fs.readFileSync(path.join(dir, 'user.json'), 'utf8'), '{ "old": true }\n');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  test('CLI check prints a colorized line diff when generated output drifts', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'typebridge-check-diff-'));
    try {
      fs.writeFileSync(path.join(dir, 'schema.ts'), 'export interface User { id: string; }\n');
      fs.writeFileSync(path.join(dir, 'user.json'), '{ "old": true }\n');
      const cli = path.resolve(__dirname, '../cli/index.js');
      const result = spawnSync(process.execPath, [cli, 'check', '-i', 'schema.ts', '-t', 'json-schema', '-o', 'user.json'], { cwd: dir, encoding: 'utf8', env: { ...process.env, FORCE_COLOR: '1' } });
      assert.strictEqual(result.status, 1);
      assert.ok(result.stderr.includes('Schema drift detected'));
      assert.ok(result.stdout.includes('--- user.json (current)'));
      assert.ok(result.stdout.includes('\u001b[31m-'));
      assert.ok(result.stdout.includes('\u001b[32m+'));
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  test('resolves interface extends and field overrides (including forward references)', () => {
    const doc = parseTypeScript(`
      export interface AdminUser extends BaseEntity, Auditable {
        role: string;
        id: number; // overrides string from BaseEntity
      }
      export interface BaseEntity {
        id: string;
      }
      export interface Auditable {
        createdAt: Date;
      }
    `, 'extends.ts');

    const admin = doc.definitions.find((d) => d.name === 'AdminUser');
    assert.ok(admin && admin.kind === 'struct');
    assert.deepStrictEqual(
      admin.fields.map((f) => f.name),
      ['id', 'createdAt', 'role']
    );
    const idField = admin.fields.find((f) => f.name === 'id');
    assert.deepStrictEqual(idField?.type, { kind: 'primitive', primitive: 'number' });
  });

  test('resolves intersection type aliases into merged structs', () => {
    const doc = parseTypeScript(`
      export interface Timestamped {
        createdAt: Date;
      }
      export type Order = Timestamped & {
        orderId: string;
        total: number;
      };
    `, 'intersection.ts');

    const order = doc.definitions.find((d) => d.name === 'Order');
    assert.ok(order && order.kind === 'struct');
    assert.deepStrictEqual(
      order.fields.map((f) => f.name),
      ['createdAt', 'orderId', 'total']
    );
  });

  test('resolves multi-file imports and circular references via parseTypeScriptFile', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'typebridge-multifile-'));
    try {
      fs.writeFileSync(
        path.join(dir, 'shared.ts'),
        `export type Role = 'ADMIN' | 'USER';\nexport interface Base { id: string; }\n`
      );
      fs.writeFileSync(
        path.join(dir, 'index.ts'),
        `import { Base, Role } from './shared';\nexport interface Account extends Base { role: Role; }\n`
      );

      const doc = parseTypeScriptFile(path.join(dir, 'index.ts'));
      assert.strictEqual(doc.diagnostics, undefined);
      assert.ok(doc.definitions.some((d) => d.name === 'Role'));
      assert.ok(doc.definitions.some((d) => d.name === 'Base'));
      const account = doc.definitions.find((d) => d.name === 'Account');
      assert.ok(account && account.kind === 'struct');
      assert.deepStrictEqual(
        account.fields.map((f) => f.name),
        ['id', 'role']
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('reports parser diagnostics with file, line, and column for unsupported syntax', () => {
    const doc = parseTypeScript(`
export interface Broken {
  callback: (x: string) => void;
}
    `.trim(), 'broken.ts');

    assert.ok(doc.diagnostics && doc.diagnostics.length > 0);
    const diag = doc.diagnostics[0];
    assert.strictEqual(diag.file, 'broken.ts');
    assert.strictEqual(diag.line, 2);
    assert.ok(diag.column > 1);
    assert.ok(diag.message.includes('Unsupported TypeScript type'));
  });

  test('CLI doctor --format json returns structured health report', () => {
    const cli = path.resolve(__dirname, '../cli/index.js');
    const result = spawnSync(process.execPath, [cli, 'doctor', '--format', 'json'], {
      cwd: path.resolve(__dirname, '../..'),
      encoding: 'utf8',
    });
    assert.strictEqual(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.strictEqual(report.ok, true);
    assert.ok(Array.isArray(report.checks));
    assert.ok(report.checks.some((c: any) => c.name === 'Configuration' && c.status === 'pass'));
    assert.ok(report.checks.some((c: any) => c.name === 'Schema Sync' && c.status === 'pass'));
  });

  test('CLI stats --format json returns structured metrics and diagnostics', () => {
    const cli = path.resolve(__dirname, '../cli/index.js');
    const result = spawnSync(process.execPath, [cli, 'stats', '--format', 'json'], {
      cwd: path.resolve(__dirname, '../..'),
      encoding: 'utf8',
    });
    assert.strictEqual(result.status, 0, result.stderr);
    const stats = JSON.parse(result.stdout);
    assert.ok(stats.modelsCount > 0);
    assert.ok(Array.isArray(stats.diagnostics));
  });

  test('MCP server handles initialize, tools/list, and tools/call', async () => {
    const { handleMcpMessage } = await import('../cli/mcp-server');

    const initRes = handleMcpMessage({ jsonrpc: '2.0', id: 1, method: 'initialize' });
    assert.ok(initRes && initRes.result.serverInfo.name === 'typebridge');

    const listRes = handleMcpMessage({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    assert.ok(listRes && Array.isArray(listRes.result.tools));
    assert.ok(listRes.result.tools.some((t: any) => t.name === 'compile_schema'));

    const callRes = handleMcpMessage({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'check_drift', arguments: { cwd: path.resolve(__dirname, '../..') } },
    });
    assert.ok(callRes && callRes.result.content[0].type === 'text');
    const payload = JSON.parse(callRes.result.content[0].text);
    assert.strictEqual(payload.ok, true);
  });

  test('extracts JSDoc validation constraints and emits them to JSON Schema, Zod, and Pydantic', () => {
    const doc = parseTypeScript(`
      export interface SignupInput {
        /**
         * User email address
         * @format email
         * @maxLength 120
         */
        email: string;
        /**
         * User age
         * @minimum 18
         * @maximum 120
         * @default 21
         */
        age?: number;
        /** @deprecated */
        legacyCode?: string;
      }
    `, 'signup.ts');

    const jsonSchema = JSON.parse(compile(doc, 'json-schema'));
    assert.strictEqual(jsonSchema.properties.email.format, 'email');
    assert.strictEqual(jsonSchema.properties.email.maxLength, 120);
    assert.strictEqual(jsonSchema.properties.age.minimum, 18);
    assert.strictEqual(jsonSchema.properties.age.maximum, 120);
    assert.strictEqual(jsonSchema.properties.age.default, 21);
    assert.strictEqual(jsonSchema.properties.legacyCode.deprecated, true);

    const tsZod = compile(doc, 'typescript', { typescript: { includeZod: true } });
    assert.ok(tsZod.includes('.email()'));
    assert.ok(tsZod.includes('.max(120)'));
    assert.ok(tsZod.includes('.min(18)'));
    assert.ok(tsZod.includes('.default(21)'));

    const py = compile(doc, 'python');
    assert.ok(py.includes('max_length=120'));
    assert.ok(py.includes('ge=18'));
    assert.ok(py.includes('le=120'));
    assert.ok(py.includes('default=21'));
  });

  test('reverse-parses JSON Schema into IR and compiles to Kotlin and Swift', async () => {
    const { parseJsonSchema } = await import('../parsers/json-schema');
    const jsonSchema = JSON.stringify({
      title: 'Product',
      type: 'object',
      required: ['id', 'price'],
      properties: {
        id: { type: 'string', format: 'uuid' },
        price: { type: 'number', minimum: 0 },
        tags: { type: 'array', items: { type: 'string' } },
      },
    });

    const doc = parseJsonSchema(jsonSchema, 'product.json');
    assert.strictEqual(doc.definitions.length, 1);

    const kt = compile(doc, 'kotlin');
    assert.ok(kt.includes('@Serializable'));
    assert.ok(kt.includes('data class Product('));
    assert.ok(kt.includes('val id: String,'));
    assert.ok(kt.includes('val price: Double,'));
    assert.ok(kt.includes('val tags: List<String>? = null'));

    const swift = compile(doc, 'swift');
    assert.ok(swift.includes('public struct Product: Codable, Sendable {'));
    assert.ok(swift.includes('public let id: UUID'));
    assert.ok(swift.includes('public let price: Double'));
    assert.ok(swift.includes('public let tags: [String]?'));
  });

});
