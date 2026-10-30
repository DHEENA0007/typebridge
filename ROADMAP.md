# TypeBridge Analysis & Roadmap

## What it is

TypeBridge is a cross-language schema compiler (~1.5k lines of TypeScript):

```
TypeScript source ─► parser (TS compiler API) ─► IR (SchemaDocument) ─► generators ─► Python / Rust / Go / TS(Zod) / JSON Schema
```

- IR (`src/ir/types.ts`): structs, enums, aliases, unions; type nodes for primitive, reference, array, map, optional, union, literal.
- CLI: `generate`, `check` (CI drift gate), `watch`, config-file batch mode, plus a GitHub Action.
- Adding a language means adding one file under `src/generators/`.

## Gaps and improvements

### Correctness / robustness
- **Test coverage is thin**: one 100-line test file run via plain `node`. Move to `node:test` or Vitest. Add golden-file snapshot tests per generator, using `examples/generated/`.
- **IR is limited**: no generics, intersections (`A & B`), `extends` inheritance, tuples, `Record` variants, `readonly`, discriminated unions or constraints (min/max/pattern/format).
- **Parser errors**: report file, line and column diagnostics instead of silently skipping unsupported syntax.
- **Cross-file imports**: support multi-file schemas and `import`/`export from` resolution.
- **Name handling**: reserved-keyword escaping per target language, and configurable naming conventions.

### Features
- **JSDoc annotations** such as `@format email`, `@minimum 0`, `@default`, `@deprecated`, mapped to Pydantic `Field(...)`, Zod refinements and JSON Schema keywords.
- **More inputs**: JSON Schema and OpenAPI to IR (reverse direction), then Protobuf and GraphQL.
- **More targets**: Kotlin, Swift, C#, Java, Zod-only, Valibot, OpenAPI and Protobuf output.
- **Round-trip validation**: in CI, compile the generated Python, Rust and Go (`pyright`, `cargo check`, `go vet`) to prove the output is valid.
- **Formatting**: run output through the native formatter (`ruff`, `rustfmt`, `gofmt`) when available.

### Developer experience
- Ship **ESLint and Prettier** configs, and a `lint` script that does more than `tsc --noEmit`.
- Publish to npm with **provenance** and automated releases (changesets or release-please).
- Add a **VS Code extension / LSP** for live preview of generated output.
- Make the playground bundle the real compiler (esbuild to a browser build) so it never diverges from the CLI.
- Add a `--format json` diagnostics output for tooling integration.

### Advanced direction
- **Schema evolution checks**: `typebridge diff old new` that flags breaking changes (removed fields, type narrowing) for API compatibility.
- **Plugin API** so third parties can register generators without forking.
- **Runtime validators and serializers** (opt-in) for targets without them.
- **MCP / AI tooling**: emit tool definitions for LLM function calling (OpenAI, Anthropic, Gemini) from the same types.

## Suggested order

1. Test harness and golden snapshots
2. Parser diagnostics and the missing TS constructs (`extends`, intersections, tuples, generics)
3. JSDoc constraints
4. Compile-the-output CI checks
5. New targets / reverse inputs
6. Plugin API and `diff` command
