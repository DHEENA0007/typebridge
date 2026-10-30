<div align="center">

# 🌉 TypeBridge

**Universal, zero-overhead schema compiler. Seamlessly synchronize data types across TypeScript, Python, Rust, Go, and JSON Schema.**

[![CI](https://github.com/typebridge/typebridge/actions/workflows/ci.yml/badge.svg)](https://github.com/typebridge/typebridge/actions/workflows/ci.yml)
[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/typebridge/typebridge/badge)](https://securityscorecards.dev/viewer/?url=github.com/typebridge/typebridge)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![npm version](https://img.shields.io/npm/v/typebridge.svg)](https://www.npmjs.com/package/typebridge)
[![Contributor Covenant](https://img.shields.io/badge/Contributor%20Covenant-2.1-4baaaa.svg)](CODE_OF_CONDUCT.md)

[Features](#-features) •
[Quickstart](#-quickstart) •
[CLI Usage](#-cli-usage) •
[Architecture](#-architecture) •
[Contributing](#-contributing) •
[Governance](#-governance)

</div>

---

## 💡 Why TypeBridge?

Modern applications are polyglot: backends in **Python (FastAPI)**, microservices in **Go** or **Rust**, frontends in **TypeScript (React/Next.js)**, and AI agents calling **JSON Schema / MCP tools**.

Today, developers manually duplicate data models across languages:
* A change in a Python Pydantic model silently breaks the frontend TypeScript types.
* API schema drift causes painful runtime exceptions in production.
* Writing boilerplate serializers across 3+ languages is tedious and error-prone.

**TypeBridge compiles your types once and generates idiomatic, zero-overhead code across all target languages.**

---

## ✨ Features

- ⚡ **Zero Overhead**: Generates native language constructs (Rust `struct` with Serde, Python `pydantic.BaseModel`, Go `struct`, TypeScript `interface` & Zod).
- 🔄 **Bidirectional & Multi-Target**: Define models in TypeScript or JSON Schema, and generate Python, Rust, Go, or OpenAPI instantly.
- 🛡️ **CI Synchronization Engine (`typebridge check`)**: Fail CI builds if frontend and backend types drift out of sync.
- 🔌 **Extensible Plugin Engine**: Add a new language generator in under 15 minutes.
- 🏢 **Enterprise Ready**: Full support for nested structs, optionality, enums, unions, type aliases, and JSDoc docstrings.

---

## 🚀 Quickstart

### 1. Installation

Install globally or as a project dev-dependency:

```bash
npm install -D typebridge
# or run directly via npx:
npx typebridge --help
```

### 2. Define Your Types (e.g., `schema/models.ts`)

```typescript
/**
 * User account profile representation
 */
export interface UserProfile {
  id: string;
  username: string;
  email: string;
  age?: number;
  isActive: boolean;
  role: 'admin' | 'member' | 'guest';
  tags: string[];
}
```

### 3. Generate Polyglot Code

```bash
# Generate Python Pydantic models
npx typebridge generate --input schema/models.ts --target python --output backend/models.py

# Generate Rust Serde structs
npx typebridge generate --input schema/models.ts --target rust --output src/models.rs

# Generate Go structs
npx typebridge generate --input schema/models.ts --target go --output pkg/models/models.go
```

---

## 💻 CLI Usage

```
Usage: typebridge [command] [options]

Commands:
  generate    Compile input schema into target language models
  check       Verify that generated files are in sync with source schema (CI gate)

Options:
  -i, --input    Input schema file (e.g. types.ts or schema.json)
  -t, --target   Target language (python, rust, go, ts, json-schema)
  -o, --output   Output destination file or directory
  -h, --help     Display help information
  -v, --version  Display TypeBridge version
```

### Automatic CI Drift Gate

Add this to your GitHub Actions pipeline to prevent schema drift:

```yaml
- name: Verify Schema Synchronization
  run: npx typebridge check --input schema/models.ts --target python --output backend/models.py
```

If any team member modified the source schema without updating the generated models, CI will fail with an exact diff!

---

## 🏛️ Architecture

TypeBridge decouples parsing from generation through a universal **Intermediate Representation (AST)**:

```
┌─────────────────────────────────┐
│ Source Types (TypeScript / JSON)│
└────────────────┬────────────────┘
                 │
                 ▼ Parsers (`src/parsers/`)
┌─────────────────────────────────┐
│     Universal Type AST (IR)     │
└────────────────┬────────────────┘
                 │
                 ▼ Generators (`src/generators/`)
 ┌───────────────┼───────────────┬───────────────┐
 │               │               │               │
 ▼               ▼               ▼               ▼
Python          Rust            Go          TypeScript / Zod
(Pydantic v2)  (Serde structs) (Go structs) (Strict types)
```

---

## 🤝 Contributing

We welcome contributors of all experience levels! 

- Read our **[Contributing Guide](CONTRIBUTING.md)** to get started in under 2 minutes.
- Check out **[Good First Issues](https://github.com/typebridge/typebridge/labels/good-first-issue)** to claim your first PR.
- Want to add a new language generator? See [How to Add a Generator in 15 Minutes](CONTRIBUTING.md#-how-to-add-a-new-generator-in-15-minutes).

---

## 📜 Governance & Security

TypeBridge is governed under an open, meritocratic model adhering to foundation standards:
- **[Governance & Contributor Ladder](GOVERNANCE.md)**
- **[Security Policy & Vulnerability Disclosure](SECURITY.md)**
- **[Code of Conduct](CODE_OF_CONDUCT.md)**

---

## 📄 License

Licensed under the [Apache License, Version 2.0](LICENSE).
