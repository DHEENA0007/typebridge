# TypeBridge Analysis & Roadmap

## What it is

TypeBridge is a cross-language schema compiler:

```
TypeScript / JSON Schema ─► parser ─► IR (SchemaDocument) ─► generators ─► Python / Rust / Go / Kotlin / Swift / TS(Zod) / GraphQL / OpenAPI / MCP / JSON Schema / Markdown
```

- IR (`src/ir/types.ts`): structs, enums, aliases, unions; type nodes for primitive, reference, array, map, optional, union, literal; field constraints and parser diagnostics.
- CLI (`src/cli/index.ts`): `generate`, `check` (CI drift gate), `watch`, `diff`, `stats`, `mock`, `doctor`, `repl` / `chat`, `mcp-server`, `studio`, plus a GitHub Action.
- Adding a language means adding one file under `src/generators/`.

## Status & Roadmap

### Correctness / robustness
- [x] **Test suite on `node:test`**: Unit & CLI integration tests in `src/tests/compiler.test.ts`.
- [x] **Inheritance & intersections**: `interface extends` and `A & B` intersections resolved in `src/parsers/typescript.ts`.
- [x] **Parser diagnostics**: File, line, and column diagnostics (`ParserDiagnostic`) for unsupported syntax and broken imports.
- [x] **Cross-file imports**: Multi-file `import` and `export ... from` resolution via `parseTypeScriptFile`.
- [ ] **Remaining TS constructs**: Generics, tuples (`[A, B]`), `readonly`, and discriminated unions.
- [ ] **Name handling**: Reserved-keyword escaping per target language and configurable naming conventions.

### Features
- [x] **JSDoc annotations**: `@format`, `@minimum`/`@min`, `@maximum`/`@max`, `@minLength`, `@maxLength`, `@pattern`, `@default`, `@deprecated` mapped to JSON Schema, Zod, and Pydantic `Field(...)`.
- [x] **JSON Schema reverse parser**: `parseJsonSchema` (`src/parsers/json-schema.ts`) + `.json` auto-detection in CLI.
- [ ] **More reverse inputs**: OpenAPI 3.1, GraphQL SDL, and Protobuf to IR.
- [x] **Kotlin & Swift targets**: `kotlinx.serialization` (`src/generators/kotlin.ts`) and Swift `Codable` (`src/generators/swift.ts`).
- [ ] **More targets**: C#, Java, Protobuf, Valibot, SQL DDL.
- [x] **Round-trip validation**: CI `roundtrip-check` validates `typebridge check`, `python3 -m py_compile`, and `go vet`.
- [ ] **Formatting**: Run output through `ruff`, `rustfmt`, `gofmt` when available.

### Developer experience
- [x] **npm release with provenance**: `.github/workflows/release.yml`.
- [x] **Structured `--format json` output**: Supported on `doctor` and `stats`.
- [x] **Interactive REPL & MCP server**: `typebridge repl` (`src/cli/repl.ts`) and `typebridge mcp-server` (`src/cli/mcp-server.ts`).
- [ ] **ESLint and Prettier** configs in `npm run lint`.
- [ ] **VS Code extension / LSP** for live preview of generated output.
- [ ] **Bundled browser playground**: Bundle the real compiler into `examples/playground.html` so it never diverges from the CLI.

### Advanced direction
- [x] **Schema evolution checks**: `typebridge diff <base> <new>`.
- [x] **MCP / AI tooling**: `typebridge -t mcp` tool schemas and live `typebridge mcp-server`.
- [ ] **Plugin API** so third parties can register generators without forking.
