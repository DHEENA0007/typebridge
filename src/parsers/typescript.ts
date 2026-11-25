import * as fs from 'node:fs';
import * as path from 'node:path';
import * as ts from 'typescript';
import {
  SchemaDocument,
  TypeDefinition,
  FieldDefinition,
  TypeNode,
  EnumValue,
  ParserDiagnostic,
} from '../ir/types';

interface PendingStructResolution {
  targetName: string;
  sources: Array<{ kind: 'ref'; name: string; file: string; line: number; column: number } | { kind: 'fields'; fields: FieldDefinition[] }>;
  ownFields: FieldDefinition[];
}

interface ParseContext {
  definitions: TypeDefinition[];
  diagnostics: ParserDiagnostic[];
  pendingResolutions: PendingStructResolution[];
}

/**
 * Parses TypeScript source code into the universal SchemaDocument AST.
 */
export function parseTypeScript(sourceCode: string, fileName = 'schema.ts'): SchemaDocument {
  const ctx: ParseContext = {
    definitions: [],
    diagnostics: [],
    pendingResolutions: [],
  };

  parseSourceIntoContext(sourceCode, fileName, ctx);
  resolveInheritanceAndIntersections(ctx);

  return {
    title: fileName,
    definitions: ctx.definitions,
    ...(ctx.diagnostics.length > 0 ? { diagnostics: ctx.diagnostics } : {}),
  };
}

/**
 * Parses a TypeScript entry file and recursively resolves relative `import` / `export from`
 * statements into a single unified SchemaDocument AST.
 */
export function parseTypeScriptFile(entryFilePath: string): SchemaDocument {
  const absEntry = path.resolve(entryFilePath);
  const visited = new Set<string>();
  const ctx: ParseContext = {
    definitions: [],
    diagnostics: [],
    pendingResolutions: [],
  };

  function visitFile(filePath: string) {
    const normalized = path.resolve(filePath);
    if (visited.has(normalized)) return;
    visited.add(normalized);

    if (!fs.existsSync(normalized)) {
      ctx.diagnostics.push({
        severity: 'error',
        message: `Schema file not found: ${normalized}`,
        file: normalized,
        line: 1,
        column: 1,
      });
      return;
    }

    const sourceCode = fs.readFileSync(normalized, 'utf-8');
    const sourceFile = ts.createSourceFile(
      normalized,
      sourceCode,
      ts.ScriptTarget.Latest,
      true
    );

    // Resolve relative imports/re-exports first so base definitions appear in dependency order
    for (const stmt of sourceFile.statements) {
      let specifierNode: ts.Expression | undefined;
      if (ts.isImportDeclaration(stmt)) {
        specifierNode = stmt.moduleSpecifier;
      } else if (ts.isExportDeclaration(stmt) && stmt.moduleSpecifier) {
        specifierNode = stmt.moduleSpecifier;
      }

      if (specifierNode && ts.isStringLiteral(specifierNode)) {
        const spec = specifierNode.text;
        if (spec.startsWith('./') || spec.startsWith('../')) {
          const resolved = resolveRelativeTsModule(path.dirname(normalized), spec);
          if (resolved) {
            visitFile(resolved);
          } else {
            const pos = sourceFile.getLineAndCharacterOfPosition(specifierNode.getStart(sourceFile));
            ctx.diagnostics.push({
              severity: 'warning',
              message: `Could not resolve relative import "${spec}"`,
              file: path.basename(normalized),
              line: pos.line + 1,
              column: pos.character + 1,
            });
          }
        }
      }
    }

    parseSourceFileIntoContext(sourceFile, path.basename(normalized), ctx);
  }

  visitFile(absEntry);
  resolveInheritanceAndIntersections(ctx);

  // Deduplicate definitions by name (last definition wins if re-declared)
  const deduped = new Map<string, TypeDefinition>();
  for (const def of ctx.definitions) {
    deduped.set(def.name, def);
  }

  return {
    title: path.basename(absEntry),
    definitions: Array.from(deduped.values()),
    ...(ctx.diagnostics.length > 0 ? { diagnostics: ctx.diagnostics } : {}),
  };
}

function resolveRelativeTsModule(fromDir: string, specifier: string): string | null {
  const base = path.resolve(fromDir, specifier);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.d.ts`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }
  return null;
}

function parseSourceIntoContext(sourceCode: string, fileName: string, ctx: ParseContext): void {
  const sourceFile = ts.createSourceFile(
    fileName,
    sourceCode,
    ts.ScriptTarget.Latest,
    true
  );
  parseSourceFileIntoContext(sourceFile, fileName, ctx);
}

function parseSourceFileIntoContext(
  sourceFile: ts.SourceFile,
  displayFile: string,
  ctx: ParseContext
): void {
  function visit(node: ts.Node) {
    if (ts.isInterfaceDeclaration(node)) {
      ctx.definitions.push(parseInterface(node, sourceFile, displayFile, ctx));
    } else if (ts.isTypeAliasDeclaration(node)) {
      const parsed = parseTypeAlias(node, sourceFile, displayFile, ctx);
      if (parsed) ctx.definitions.push(parsed);
    } else if (ts.isEnumDeclaration(node)) {
      ctx.definitions.push(parseEnum(node, sourceFile));
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
}

function addDiagnostic(
  ctx: ParseContext,
  node: ts.Node,
  sourceFile: ts.SourceFile,
  displayFile: string,
  severity: 'warning' | 'error',
  message: string
): void {
  const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  ctx.diagnostics.push({
    severity,
    message,
    file: displayFile,
    line: pos.line + 1,
    column: pos.character + 1,
  });
}

function parseInterface(
  node: ts.InterfaceDeclaration,
  sourceFile: ts.SourceFile,
  displayFile: string,
  ctx: ParseContext
): TypeDefinition {
  const name = node.name.text;
  const description = extractJsDoc(node, sourceFile);
  const ownFields: FieldDefinition[] = [];

  for (const member of node.members) {
    if (ts.isPropertySignature(member) && member.name) {
      const fieldName = member.name.getText(sourceFile).replace(/['"]/g, '');
      const optional = member.questionToken !== undefined;
      const fieldDesc = extractJsDoc(member, sourceFile);
      const type = member.type
        ? parseTypeNode(member.type, sourceFile, displayFile, ctx)
        : { kind: 'primitive' as const, primitive: 'any' as const };

      ownFields.push({
        name: fieldName,
        type,
        optional,
        description: fieldDesc,
      });
    } else if (!ts.isPropertySignature(member)) {
      addDiagnostic(
        ctx,
        member,
        sourceFile,
        displayFile,
        'warning',
        `Unsupported interface member in "${name}": ${ts.SyntaxKind[member.kind]}`
      );
    }
  }

  // Record `extends` heritage clauses for resolution once all files are parsed
  if (node.heritageClauses) {
    const sources: PendingStructResolution['sources'] = [];
    for (const clause of node.heritageClauses) {
      if (clause.token === ts.SyntaxKind.ExtendsKeyword) {
        for (const expr of clause.types) {
          const baseName = expr.expression.getText(sourceFile);
          const pos = sourceFile.getLineAndCharacterOfPosition(expr.getStart(sourceFile));
          sources.push({
            kind: 'ref',
            name: baseName,
            file: displayFile,
            line: pos.line + 1,
            column: pos.character + 1,
          });
        }
      }
    }
    if (sources.length > 0) {
      ctx.pendingResolutions.push({
        targetName: name,
        sources,
        ownFields,
      });
    }
  }

  return {
    kind: 'struct',
    name,
    description,
    fields: ownFields,
  };
}

function parseTypeAlias(
  node: ts.TypeAliasDeclaration,
  sourceFile: ts.SourceFile,
  displayFile: string,
  ctx: ParseContext
): TypeDefinition | null {
  const name = node.name.text;
  const description = extractJsDoc(node, sourceFile);

  if (ts.isTypeLiteralNode(node.type)) {
    return {
      kind: 'struct',
      name,
      description,
      fields: parseTypeLiteralMembers(node.type, sourceFile, displayFile, ctx),
    };
  } else if (ts.isIntersectionTypeNode(node.type)) {
    const sources: PendingStructResolution['sources'] = [];
    for (const memberType of node.type.types) {
      if (ts.isTypeLiteralNode(memberType)) {
        sources.push({
          kind: 'fields',
          fields: parseTypeLiteralMembers(memberType, sourceFile, displayFile, ctx),
        });
      } else if (ts.isTypeReferenceNode(memberType)) {
        const refName = memberType.typeName.getText(sourceFile);
        const pos = sourceFile.getLineAndCharacterOfPosition(memberType.getStart(sourceFile));
        sources.push({
          kind: 'ref',
          name: refName,
          file: displayFile,
          line: pos.line + 1,
          column: pos.character + 1,
        });
      } else {
        addDiagnostic(
          ctx,
          memberType,
          sourceFile,
          displayFile,
          'warning',
          `Unsupported intersection member in "${name}": ${ts.SyntaxKind[memberType.kind]}`
        );
      }
    }

    ctx.pendingResolutions.push({
      targetName: name,
      sources,
      ownFields: [],
    });

    return {
      kind: 'struct',
      name,
      description,
      fields: [],
    };
  } else if (ts.isUnionTypeNode(node.type)) {
    // Check if it is a string literal union (e.g. 'admin' | 'member' | 'guest')
    const allLiterals = node.type.types.every(
      (t) => ts.isLiteralTypeNode(t) && ts.isStringLiteral(t.literal)
    );

    if (allLiterals) {
      const values: EnumValue[] = node.type.types.map((t) => {
        const lit = (t as ts.LiteralTypeNode).literal as ts.StringLiteral;
        return {
          name: lit.text.toUpperCase().replace(/[^A-Z0-9_]/g, '_'),
          value: lit.text,
        };
      });
      return {
        kind: 'enum',
        name,
        description,
        values,
      };
    } else {
      const variants = node.type.types.map((t) => parseTypeNode(t, sourceFile, displayFile, ctx));
      return {
        kind: 'union',
        name,
        description,
        variants,
      };
    }
  }

  return {
    kind: 'alias',
    name,
    description,
    targetType: parseTypeNode(node.type, sourceFile, displayFile, ctx),
  };
}

function parseTypeLiteralMembers(
  literal: ts.TypeLiteralNode,
  sourceFile: ts.SourceFile,
  displayFile: string,
  ctx: ParseContext
): FieldDefinition[] {
  const fields: FieldDefinition[] = [];
  for (const member of literal.members) {
    if (ts.isPropertySignature(member) && member.name) {
      const fieldName = member.name.getText(sourceFile).replace(/['"]/g, '');
      const optional = member.questionToken !== undefined;
      const fieldDesc = extractJsDoc(member, sourceFile);
      const type = member.type
        ? parseTypeNode(member.type, sourceFile, displayFile, ctx)
        : { kind: 'primitive' as const, primitive: 'any' as const };

      fields.push({
        name: fieldName,
        type,
        optional,
        description: fieldDesc,
      });
    }
  }
  return fields;
}

function resolveInheritanceAndIntersections(ctx: ParseContext): void {
  if (ctx.pendingResolutions.length === 0) return;

  const defMap = new Map<string, TypeDefinition>();
  for (const def of ctx.definitions) {
    defMap.set(def.name, def);
  }

  const pendingMap = new Map<string, PendingStructResolution>();
  for (const pending of ctx.pendingResolutions) {
    pendingMap.set(pending.targetName, pending);
  }

  const resolving = new Set<string>();
  const resolved = new Set<string>();

  function resolveStruct(name: string): FieldDefinition[] {
    const def = defMap.get(name);
    if (!def || def.kind !== 'struct') return [];

    const pending = pendingMap.get(name);
    if (!pending || resolved.has(name)) {
      return def.fields;
    }

    if (resolving.has(name)) {
      return def.fields;
    }

    resolving.add(name);
    const merged = new Map<string, FieldDefinition>();

    for (const src of pending.sources) {
      if (src.kind === 'fields') {
        for (const f of src.fields) {
          merged.set(f.name, f);
        }
      } else {
        const baseDef = defMap.get(src.name);
        if (!baseDef || baseDef.kind !== 'struct') {
          ctx.diagnostics.push({
            severity: 'warning',
            message: `Cannot resolve base struct "${src.name}" for "${name}"`,
            file: src.file,
            line: src.line,
            column: src.column,
          });
          continue;
        }
        const baseFields = resolveStruct(src.name);
        for (const f of baseFields) {
          merged.set(f.name, f);
        }
      }
    }

    for (const own of pending.ownFields) {
      merged.set(own.name, own);
    }

    def.fields = Array.from(merged.values());
    resolving.delete(name);
    resolved.add(name);
    return def.fields;
  }

  for (const pending of ctx.pendingResolutions) {
    resolveStruct(pending.targetName);
  }
}

function parseEnum(node: ts.EnumDeclaration, sourceFile: ts.SourceFile): TypeDefinition {
  const name = node.name.text;
  const description = extractJsDoc(node, sourceFile);
  const values: EnumValue[] = [];

  for (const member of node.members) {
    const memberName = member.name.getText(sourceFile);
    let val: string | number = memberName;
    if (member.initializer) {
      if (ts.isStringLiteral(member.initializer)) {
        val = member.initializer.text;
      } else if (ts.isNumericLiteral(member.initializer)) {
        val = Number(member.initializer.text);
      }
    }
    values.push({
      name: memberName,
      value: val,
      description: extractJsDoc(member, sourceFile),
    });
  }

  return {
    kind: 'enum',
    name,
    description,
    values,
  };
}

function parseTypeNode(
  typeNode: ts.TypeNode,
  sourceFile: ts.SourceFile,
  displayFile: string,
  ctx: ParseContext
): TypeNode {
  switch (typeNode.kind) {
    case ts.SyntaxKind.StringKeyword:
      return { kind: 'primitive', primitive: 'string' };
    case ts.SyntaxKind.NumberKeyword:
      return { kind: 'primitive', primitive: 'number' };
    case ts.SyntaxKind.BooleanKeyword:
      return { kind: 'primitive', primitive: 'boolean' };
    case ts.SyntaxKind.AnyKeyword:
    case ts.SyntaxKind.UnknownKeyword:
      return { kind: 'primitive', primitive: 'any' };
    case ts.SyntaxKind.NullKeyword:
    case ts.SyntaxKind.UndefinedKeyword:
      return { kind: 'primitive', primitive: 'null' };
    case ts.SyntaxKind.ParenthesizedType: {
      const paren = typeNode as ts.ParenthesizedTypeNode;
      return parseTypeNode(paren.type, sourceFile, displayFile, ctx);
    }
    case ts.SyntaxKind.ArrayType: {
      const arr = typeNode as ts.ArrayTypeNode;
      return { kind: 'array', elementType: parseTypeNode(arr.elementType, sourceFile, displayFile, ctx) };
    }
    case ts.SyntaxKind.TypeReference: {
      const ref = typeNode as ts.TypeReferenceNode;
      const refName = ref.typeName.getText(sourceFile);
      if (refName === 'Array' && ref.typeArguments && ref.typeArguments.length > 0) {
        return { kind: 'array', elementType: parseTypeNode(ref.typeArguments[0], sourceFile, displayFile, ctx) };
      }
      if (refName === 'Record' && ref.typeArguments && ref.typeArguments.length === 2) {
        return {
          kind: 'map',
          keyType: parseTypeNode(ref.typeArguments[0], sourceFile, displayFile, ctx),
          valueType: parseTypeNode(ref.typeArguments[1], sourceFile, displayFile, ctx),
        };
      }
      if (refName === 'Date') {
        return { kind: 'primitive', primitive: 'date' };
      }
      return { kind: 'reference', name: refName };
    }
    case ts.SyntaxKind.UnionType: {
      const union = typeNode as ts.UnionTypeNode;
      const filtered = union.types.filter(
        (t) => t.kind !== ts.SyntaxKind.UndefinedKeyword && t.kind !== ts.SyntaxKind.NullKeyword
      );
      const isNullable = filtered.length < union.types.length;

      if (filtered.length === 1 && isNullable) {
        return {
          kind: 'optional',
          innerType: parseTypeNode(filtered[0], sourceFile, displayFile, ctx),
        };
      }

      const types = union.types.map((t) => parseTypeNode(t, sourceFile, displayFile, ctx));
      return { kind: 'union', types };
    }
    case ts.SyntaxKind.LiteralType: {
      const lit = (typeNode as ts.LiteralTypeNode).literal;
      if (ts.isStringLiteral(lit)) {
        return { kind: 'literal', value: lit.text };
      }
      if (ts.isNumericLiteral(lit)) {
        return { kind: 'literal', value: Number(lit.text) };
      }
      if (lit.kind === ts.SyntaxKind.TrueKeyword) {
        return { kind: 'literal', value: true };
      }
      if (lit.kind === ts.SyntaxKind.FalseKeyword) {
        return { kind: 'literal', value: false };
      }
      addDiagnostic(
        ctx,
        typeNode,
        sourceFile,
        displayFile,
        'warning',
        `Unsupported literal type "${typeNode.getText(sourceFile)}"; falling back to any`
      );
      return { kind: 'primitive', primitive: 'any' };
    }
    default:
      addDiagnostic(
        ctx,
        typeNode,
        sourceFile,
        displayFile,
        'warning',
        `Unsupported TypeScript type "${typeNode.getText(sourceFile)}" (${ts.SyntaxKind[typeNode.kind]}); falling back to any`
      );
      return { kind: 'primitive', primitive: 'any' };
  }
}

function extractJsDoc(node: ts.Node, sourceFile: ts.SourceFile): string | undefined {
  const fullText = sourceFile.getFullText();
  const ranges = ts.getLeadingCommentRanges(fullText, node.getFullStart());
  if (!ranges || ranges.length === 0) return undefined;

  for (const range of ranges) {
    const comment = fullText.substring(range.pos, range.end);
    if (comment.startsWith('/**')) {
      return comment
        .replace(/^\/\*\*|\*\/$/g, '')
        .split('\n')
        .map((line) => line.replace(/^\s*\*\s?/, '').trim())
        .filter(Boolean)
        .join(' ');
    }
  }
  return undefined;
}
