<div align="center">

# TypeBridge

### High-Performance Universal Schema & Cross-Language Type Compiler

[![CI](https://github.com/DHEENA0007/typebridge/actions/workflows/ci.yml/badge.svg)](https://github.com/DHEENA0007/typebridge/actions/workflows/ci.yml)
[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/DHEENA0007/typebridge/badge)](https://securityscorecards.dev/viewer/?url=github.com/DHEENA0007/typebridge)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![TypeScript Strict](https://img.shields.io/badge/TypeScript-Strict%20Mode-3178c6.svg)](https://www.typescriptlang.org/)
[![Node Version](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![OpenSSF Best Practices](https://img.shields.io/badge/OpenSSF-Scorecard%20Verified-blueviolet.svg)](SECURITY.md)

</div>

---

## Abstract

In modern distributed systems, data models are routinely fragmented across heterogeneous stacks: Python for machine learning and asynchronous backends, Go and Rust for high-throughput microservices, TypeScript for client-side applications, and JSON Schema for Model Context Protocol (MCP) tool interfaces.

Manually maintaining type definitions across multiple language ecosystems introduces severe operational liabilities:
- **Silent Schema Drift**: Field additions, mutations, or optionality changes fail to propagate across service boundaries, resulting in serialization failures and runtime exceptions.
- **Boilerplate Proliferation**: Engineering teams write, test, and maintain redundant data structures and serialization logic in multiple languages.
- **Inconsistent Validation Semantics**: Discrepancies between validation engines (e.g., Pydantic vs. Zod vs. native JSON schema validators) create security vulnerabilities at ingress points.

**TypeBridge** eliminates this complexity through an AST-driven Intermediate Representation (IR). It parses canonical type declarations and emits idiomatic, native, zero-runtime-overhead type definitions and validation schemas across all target languages.

---

## Table of Contents

- [Architectural Design](#architectural-design)
- [Language & Framework Target Matrix](#language--framework-target-matrix)
- [Specification by Example](#specification-by-example)
- [Installation & Quickstart](#installation--quickstart)
- [CLI Reference](#cli-reference)
- [Continuous Integration & Drift Prevention](#continuous-integration--drift-prevention)
- [Programmatic API](#programmatic-api)
- [Extensibility: Writing Custom Generators](#extensibility-writing-custom-generators)
- [Security & Compliance](#security--compliance)
- [Governance](#governance)
- [License](#license)

---

## Architectural Design

TypeBridge employs a decoupled, multi-pass compiler architecture designed for deterministic code generation and high extensibility.

```
┌────────────────────────────────────────────────────────┐
│                     Source Ingress                     │
│        TypeScript AST (ts.Compiler) / JSON Schema      │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼ [Lexical & Semantic Analysis]
┌────────────────────────────────────────────────────────┐
│           TypeBridge Intermediate Representation       │
│                (Universal Type AST - IR)               │
│                                                        │
│  - StructDefinition (Fields, Optionality, Modifiers)   │
│  - EnumDefinition (String & Numeric Variants)          │
│  - UnionDefinition (Discriminated & Scalar Unions)     │
│  - Primitive & Complex Node Resolution                 │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼ [Emitter Dispatch Pipeline]
   ┌────────────────┬────────────────┬────────────────┬────────────────┐
   │                │                │                │                │
   ▼                ▼                ▼                ▼                ▼
 Python Backend   Rust Backend      Go Backend       TS / Zod Backend  JSON Schema
(Pydantic v2 /   (Serde-annotated   (Idiomatic       (Strict Types &   (Draft 2020-12 /
 Dataclasses)     structs & enums)   structs + tags)  Zod schemas)      OpenAPI 3.1)
```

### Compiler Phases

1. **Source Ingress & Extraction**: Uses the native TypeScript Compiler API (`ts.createSourceFile`) to extract interfaces, types, literal unions, and docstrings without executing arbitrary runtime code.
2. **Intermediate Representation (IR)**: Normalizes source types into a language-agnostic AST (`src/ir/types.ts`). TypeBridge IR models primitives, references, nested collections, maps, optionality, and metadata independently of any target language syntax.
3. **Emitter Pipeline**: Passes the normalized AST to target-specific generators. Each emitter enforces target-language idioms (e.g., snake_case conversion with JSON field aliases in Python, Serde attributes in Rust, and struct tags in Go).

---

## Language & Framework Target Matrix

| Target Language | Output Architecture | Validation & Serialization Engine | Target Version |
| :--- | :--- | :--- | :--- |
| **Python** | `BaseModel` / `@dataclass` | [Pydantic v2](https://docs.pydantic.dev/) / Standard Library | Python $\ge$ 3.10 |
| **Rust** | `pub struct`, `pub enum` | [Serde](https://serde.rs/) (`Serialize`, `Deserialize`) | Rust Edition 2021+ |
| **Go** | `type ... struct`, `const` | Standard library `encoding/json` struct tags | Go $\ge$ 1.20 |
| **TypeScript** | `interface`, `type`, `enum` | [Zod v3](https://zod.dev/) validation schemas | TypeScript $\ge$ 4.8 |
| **JSON Schema** | Standard Schema Specification | Draft 2020-12 / OpenAPI 3.1.0 compatible | Universal |

---

## Specification by Example

### 1. Canonical Source Definition (`schema/domain.ts`)

```typescript
/**
 * Account authorization levels within the organization
 */
export type UserRole = 'ADMIN' | 'MEMBER' | 'GUEST';

/**
 * Core authenticated user profile entity
 */
export interface UserProfile {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  age?: number;
  tags: string[];
  metadata?: Record<string, string>;
  createdAt: Date;
}
```

### 2. Compiled Target Outputs

#### Python Output (`backend/models.py`)
```python
# Auto-generated by TypeBridge. DO NOT EDIT DIRECTLY.
from __future__ import annotations
from typing import Optional, List, Dict, Any, Union
from enum import Enum
from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, Field, ConfigDict

class UserRole(str, Enum):
    """Account authorization levels within the organization"""
    ADMIN = "ADMIN"
    MEMBER = "MEMBER"
    GUEST = "GUEST"

class UserProfile(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    """Core authenticated user profile entity"""
    id: str
    username: str
    email: str
    role: UserRole
    is_active: bool = Field(..., alias="isActive")
    age: Optional[float] = None
    tags: List[str]
    metadata: Optional[Dict[str, str]] = None
    created_at: datetime = Field(..., alias="createdAt")
```

#### Rust Output (`src/models.rs`)
```rust
// Auto-generated by TypeBridge. DO NOT EDIT DIRECTLY.
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use chrono::{DateTime, Utc};
use uuid::Uuid;

/// Account authorization levels within the organization
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum UserRole {
    Admin,
    Member,
    Guest,
}

/// Core authenticated user profile entity
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct UserProfile {
    pub id: String,
    pub username: String,
    pub email: String,
    pub role: UserRole,
    #[serde(rename = "isActive")]
    pub is_active: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub age: Option<f64>,
    pub tags: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<HashMap<String, String>>,
    #[serde(rename = "createdAt")]
    pub created_at: DateTime<Utc>,
}
```

#### Go Output (`pkg/models/models.go`)
```go
// Code generated by TypeBridge. DO NOT EDIT.
package models

import (
	"time"
)

// UserRole - Account authorization levels within the organization
type UserRole string

const (
	UserRoleAdmin  UserRole = "ADMIN"
	UserRoleMember UserRole = "MEMBER"
	UserRoleGuest  UserRole = "GUEST"
)

// UserProfile - Core authenticated user profile entity
type UserProfile struct {
	Id        string             `json:"id"`
	Username  string             `json:"username"`
	Email     string             `json:"email"`
	Role      UserRole           `json:"role"`
	IsActive  bool               `json:"isActive"`
	Age       *float64           `json:"age,omitempty"`
	Tags      []string           `json:"tags"`
	Metadata  *map[string]string `json:"metadata,omitempty"`
	CreatedAt time.Time          `json:"createdAt"`
}
```

---

## Installation & Quickstart

TypeBridge can be used directly without installation via `npx` or installed locally within your project.

### Global / Local Installation

```bash
# Local development dependency
npm install --save-dev typebridge

# Global binary installation
npm install -g typebridge
```

### Basic Compilation

```bash
# Compile to Python Pydantic models
typebridge generate --input schema/domain.ts --target python --output backend/models.py

# Compile to Rust Serde structs
typebridge generate --input schema/domain.ts --target rust --output src/models.rs

# Compile to Go structs
typebridge generate --input schema/domain.ts --target go --output pkg/models/models.go

# Compile to JSON Schema (OpenAPI / MCP Tools)
typebridge generate --input schema/domain.ts --target json-schema --output dist/schema.json
```

---

## CLI Reference

```
typebridge [command] [options]
```

### Commands

| Command | Description |
| :--- | :--- |
| `generate` | Parses the source file and writes compiled code to the target destination. |
| `check` | Verifies that existing output files match the compiled schema. Exits with code `1` upon drift detection. Ideal for continuous integration. |

### Flags & Options

| Flag | Shorthand | Type | Required | Description |
| :--- | :--- | :--- | :--- | :--- |
| `--input` | `-i` | `string` | **Yes** | Path to the source schema file (`.ts`, `.json`). |
| `--target` | `-t` | `string` | **Yes** | Target emitter (`python`, `rust`, `go`, `typescript`, `json-schema`). |
| `--output` | `-o` | `string` | No | Destination file path. If omitted in `generate`, output is written to `stdout`. |
| `--help` | `-h` | `boolean` | No | Outputs command usage instructions. |
| `--version` | `-v` | `boolean` | No | Prints compiler version. |

---

## Continuous Integration & Drift Prevention

### Reusable GitHub Action

TypeBridge provides a native GitHub Action to prevent schema divergence across microservice and client repositories.

Add the following step to your `.github/workflows/ci.yml`:

```yaml
jobs:
  schema-validation:
    name: Verify Schema Synchronization
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Verify Backend Python Schema Sync
        uses: DHEENA0007/typebridge@main
        with:
          command: 'check'
          input: 'schema/domain.ts'
          target: 'python'
          output: 'backend/models.py'

      - name: Verify Microservice Rust Schema Sync
        uses: DHEENA0007/typebridge@main
        with:
          command: 'check'
          input: 'schema/domain.ts'
          target: 'rust'
          output: 'services/core/src/models.rs'
```

If a developer alters `schema/domain.ts` without updating the generated targets, the CI job will fail and output the exact discrepancy.

---

## Programmatic API

TypeBridge exports its compiler pipeline for integration into build systems, Vite plugins, or custom code-generation tools.

```typescript
import { parseTypeScript, compile } from 'typebridge';

const tsSource = `
  export interface DeviceReading {
    deviceId: string;
    temperature: number;
    timestamp: Date;
  }
`;

// 1. Parse source code into normalized AST
const document = parseTypeScript(tsSource, 'sensor.ts');

// 2. Compile to target representations
const pythonCode = compile(document, 'python', {
  python: { usePydantic: true }
});

const rustCode = compile(document, 'rust');
const goCode = compile(document, 'go', {
  go: { packageName: 'telemetry' }
});
```

---

## Extensibility: Writing Custom Generators

The TypeBridge Intermediate Representation makes adding new language backends (e.g., Swift, Kotlin, C#, Protobuf, GraphQL) completely modular. 

Implement the generator interface in a single isolated module:

```typescript
import { SchemaDocument } from '../ir/types';

export interface GeneratorOptions {
  indentation?: number;
}

export function generateSwift(
  doc: SchemaDocument,
  options: GeneratorOptions = {}
): string {
  const buffer: string[] = ['// Auto-generated by TypeBridge'];
  
  for (const def of doc.definitions) {
    if (def.kind === 'struct') {
      buffer.push(`public struct ${def.name}: Codable {`);
      for (const field of def.fields) {
        // Map IR types to Swift types
        buffer.push(`    public let ${field.name}: ...`);
      }
      buffer.push('}');
    }
  }

  return buffer.join('\n');
}
```

To contribute a new target, open an issue using the [New Generator Template](.github/ISSUE_TEMPLATE/new_generator.yml).

---

## Security & Compliance

TypeBridge is maintained in accordance with OpenSSF (Open Source Security Foundation) critical infrastructure standards:

- **Vulnerability Disclosure**: Managed through coordinated disclosure. See [SECURITY.md](SECURITY.md).
- **Supply Chain Security**: All dependencies are locked with `package-lock.json` and scanned for vulnerabilities via automated GitHub Actions.
- **Scorecard Audited**: Automated OpenSSF Scorecard evaluations run weekly to verify branch protections, code reviews, and dependency health.
- **Zero Runtime Dependencies in Production**: Generated code contains no runtime references to TypeBridge itself, eliminating supply-chain attack vectors in production deployments.

---

## Governance

TypeBridge operates under an open, meritocratic contributor model aligned with standard foundation policies (CNCF / OpenJS).

For full details on the project committer ladder, review privileges, and RFC processes, consult [GOVERNANCE.md](GOVERNANCE.md) and [CONTRIBUTING.md](CONTRIBUTING.md).

All participants are expected to adhere to the [Code of Conduct](CODE_OF_CONDUCT.md).

---

## License

TypeBridge is licensed under the **[Apache License, Version 2.0](LICENSE)**.

```
Copyright 2026 TypeBridge Contributors

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0
```
