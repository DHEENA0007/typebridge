# Contributing to TypeBridge

Thank you for your interest in contributing to TypeBridge! 🚀

TypeBridge is built on a modular architecture designed to make contributions as fast and frictionless as possible. Whether you're fixing a typo, improving a generator, or adding support for a new programming language, we welcome your PR!

---

## Quickstart (Under 2 Minutes)

1. **Fork and clone** the repository:
   ```bash
   git clone https://github.com/DHEENA0007/typebridge.git
   cd typebridge
   ```
2. **Install dependencies and build**:
   ```bash
   npm install
   npm run build
   ```
3. **Run the test suite**:
   ```bash
   npm test
   ```

> **Tip**: You can also click **"Open in GitHub Codespaces"** on the repo homepage to start coding immediately in a pre-configured browser IDE!

---

## Project Architecture

TypeBridge uses a three-tier architecture:

```
Source Code (TS, JSON Schema) 
       │
       ▼ (Parsers: src/parsers/)
Universal Type Intermediate Representation (src/ir/types.ts)
       │
       ▼ (Generators: src/generators/)
Target Code (Python, Rust, Go, TypeScript, JSON Schema)
```

1. **`src/ir/types.ts`**: The universal language-neutral Abstract Syntax Tree (AST).
2. **`src/parsers/`**: Translates source definitions into the Universal Type AST.
3. **`src/generators/`**: Translates the Universal Type AST into idiomatic language code.
4. **`src/cli/`**: The command-line interface (`typebridge generate`, `typebridge check`).

---

## ⚡ How to Add a New Generator in 15 Minutes

Adding a new language or framework generator (e.g., C#, Kotlin, Swift, GraphQL, Prisma) is completely self-contained!

1. Create a new file in `src/generators/<your_target>.ts`:
   ```typescript
   import { SchemaDocument } from '../ir/types';

   export interface GeneratorOptions {
     indent?: number;
   }

   export function generateTargetLang(
     doc: SchemaDocument,
     options: GeneratorOptions = {}
   ): string {
     // Transform doc.definitions into code string
     return generatedCode;
   }
   ```
2. Export your generator in `src/generators/index.ts`.
3. Add a unit test in `tests/generators.test.ts`.
4. Run `npm test` and submit your Pull Request!

---

## Good First Issues

Looking for somewhere to start? Check out our [Good First Issues](https://github.com/typebridge/typebridge/labels/good-first-issue) label. These issues include detailed guidance on the exact files and lines of code to modify.

---

## Pull Request Guidelines

1. **Branch Naming**: `feat/add-swift-generator` or `fix/pydantic-optional-none`.
2. **Commit Messages**: We use [Conventional Commits](https://www.conventionalcommits.org/):
   - `feat: add support for Go struct tags`
   - `fix: handle nested nullable unions in python generator`
   - `docs: update quickstart instructions in README`
3. **Tests**: Ensure `npm test` passes and `npm run lint` reports 0 errors before opening your PR.

All contributors are credited in our `README.md` via the `@all-contributors` bot!
