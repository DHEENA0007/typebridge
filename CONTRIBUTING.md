# Contributing to TypeBridge

Thank you for your interest in contributing to TypeBridge!

TypeBridge is built on a modular architecture designed to make contributions as fast and frictionless as possible. Whether you're fixing a bug, improving a generator, or adding support for a new programming language, we welcome your PR.

---

## Quickstart (Under 2 Minutes)

1. **Fork and clone** the repository:
   ```bash
   git clone https://github.com/DHEENA0007/typebridge.git
   cd typebridge
   ```
2. **Install dependencies, lint, and build**:
   ```bash
   npm install
   npm run lint
   npm run build
   ```
3. **Run the test suite**:
   ```bash
   npm test
   ```

---

## Project Architecture

TypeBridge uses a three-tier architecture:

```
Source Code (TypeScript, JSON Schema)
       │
       ▼ (Parsers: src/parsers/)
Universal Type Intermediate Representation (src/ir/types.ts)
       │
       ▼ (Generators: src/generators/)
Target Code (Python, Rust, Go, Kotlin, Swift, TypeScript/Zod, GraphQL, OpenAPI, MCP, JSON Schema, Markdown)
```

1. **`src/ir/types.ts`**: The universal language-neutral Abstract Syntax Tree (`SchemaDocument`, `TypeDefinition`, `TypeNode`).
2. **`src/parsers/`**: Translates source definitions (`typescript.ts`, `json-schema.ts`) into the Universal Type AST.
3. **`src/generators/`**: Translates the Universal Type AST into idiomatic language code.
4. **`src/cli/`**: The command-line interface (`generate`, `check`, `watch`, `diff`, `stats`, `mock`, `doctor`, `repl`, `mcp-server`, `studio`).

---

## How to Add a New Generator in 15 Minutes

Adding a new language or format generator (e.g., **C#**, **Java**, **Protobuf**, **Valibot**, **Prisma**, **SQL/DDL**) is completely self-contained:

1. Create a new file in `src/generators/<your_target>.ts` (use `src/generators/kotlin.ts` or `src/generators/go.ts` as a template):
   ```typescript
   import { SchemaDocument } from '../ir/types';

   export interface TargetGeneratorOptions {
     namespace?: string;
   }

   export function generateTargetLang(
     doc: SchemaDocument,
     options: TargetGeneratorOptions = {}
   ): string {
     // Transform doc.definitions into idiomatic target code
     return '';
   }
   ```
2. Export and register your target in `src/generators/index.ts` (`SupportedTarget`, `GenerateOptions`, `compile()`).
3. Add your target keyword to `KNOWN_TARGETS` and `aliases` in `src/cli/repl.ts`, plus help text in `src/cli/index.ts`.
4. Add unit tests in `src/tests/compiler.test.ts`.
5. Run `npm run lint && npm run build && npm test` and open a Pull Request!

---

## Open Contributor Tasks (Good First Issues)

Looking for somewhere to start? Check out our [Good First Issues](https://github.com/DHEENA0007/typebridge/labels/good-first-issue) or pick one of these scoped tasks and open an issue using the **New Language / Format Generator** or **Feature Request** template:

| Area | Task | Difficulty | Key Files |
| :--- | :--- | :--- | :--- |
| **Generator** | **C# (`System.Text.Json`)** `record` / `enum` generator | Good First Issue | `src/generators/csharp.ts`, `src/generators/index.ts` |
| **Generator** | **Java (`Jackson`)** `record` / `enum` generator | Good First Issue | `src/generators/java.ts`, `src/generators/index.ts` |
| **Generator** | **Protobuf (`.proto` v3)** `message` / `enum` generator | Intermediate | `src/generators/protobuf.ts`, `src/generators/index.ts` |
| **Generator** | **Valibot** TypeScript schema generator | Good First Issue | `src/generators/valibot.ts`, `src/generators/index.ts` |
| **Generator** | **SQL / PostgreSQL DDL** `CREATE TABLE` generator | Good First Issue | `src/generators/sql.ts`, `src/generators/index.ts` |
| **Parser** | **OpenAPI 3.1 → IR** reverse parser | Intermediate | `src/parsers/openapi.ts`, `src/parsers/index.ts` |
| **Parser** | **GraphQL SDL → IR** reverse parser | Intermediate | `src/parsers/graphql.ts`, `src/parsers/index.ts` |
| **Parser** | Support TypeScript **tuples** (`[string, number]`) & **`readonly`** | Good First Issue | `src/ir/types.ts`, `src/parsers/typescript.ts` |
| **Correctness** | Reserved-keyword escaping per target (`type`, `class`, `in`, `match`) | Good First Issue | `src/generators/*.ts` |
| **CLI / DX** | Multi-file dependency watching in `typebridge watch` | Intermediate | `src/cli/index.ts`, `src/parsers/typescript.ts` |
| **CLI / DX** | Auto-format generated output with `ruff` / `rustfmt` / `gofmt` when installed | Good First Issue | `src/cli/index.ts` |
| **Tooling** | ESLint + Prettier config & `npm run lint` integration | Good First Issue | `package.json` |

---

## Pull Request Guidelines

1. **Branch Naming**: `feat/add-csharp-generator` or `fix/pydantic-optional-none`.
2. **Commit Messages**: We use [Conventional Commits](https://www.conventionalcommits.org/):
   - `feat: add C# System.Text.Json generator`
   - `fix: escape reserved keywords in Rust generator`
   - `docs: update quickstart instructions in README`
3. **Checks**: Ensure `npm run lint`, `npm run build`, and `npm test` all pass before opening your PR.
