import { test, describe } from 'node:test';
import * as assert from 'node:assert';
import { parseTypeScript } from '../parsers/typescript';
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

  test('loads typebridge.config.json correctly', async () => {
    const { loadConfig } = await import('../config');
    const loaded = loadConfig();
    assert.ok(loaded);
    assert.strictEqual(loaded.config.input, 'examples/schema.ts');
    assert.strictEqual(loaded.config.targets.length, 4);
    assert.ok(loaded.config.targets.some((t: any) => t.target === 'python'));
    assert.ok(loaded.config.targets.some((t: any) => t.target === 'rust'));
    assert.ok(loaded.config.targets.some((t: any) => t.target === 'go'));
    assert.ok(loaded.config.targets.some((t: any) => t.target === 'json-schema'));
  });
});
