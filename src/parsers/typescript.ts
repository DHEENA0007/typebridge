import * as ts from 'typescript';
import {
  SchemaDocument,
  TypeDefinition,
  FieldDefinition,
  TypeNode,
  EnumValue,
} from '../ir/types';

/**
 * Parses TypeScript source code or file into the universal SchemaDocument AST.
 */
export function parseTypeScript(sourceCode: string, fileName = 'schema.ts'): SchemaDocument {
  const sourceFile = ts.createSourceFile(
    fileName,
    sourceCode,
    ts.ScriptTarget.Latest,
    true
  );

  const definitions: TypeDefinition[] = [];

  function visit(node: ts.Node) {
    if (ts.isInterfaceDeclaration(node)) {
      definitions.push(parseInterface(node, sourceFile));
    } else if (ts.isTypeAliasDeclaration(node)) {
      const parsed = parseTypeAlias(node, sourceFile);
      if (parsed) definitions.push(parsed);
    } else if (ts.isEnumDeclaration(node)) {
      definitions.push(parseEnum(node, sourceFile));
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  return {
    title: fileName,
    definitions,
  };
}

function parseInterface(
  node: ts.InterfaceDeclaration,
  sourceFile: ts.SourceFile
): TypeDefinition {
  const name = node.name.text;
  const description = extractJsDoc(node, sourceFile);
  const fields: FieldDefinition[] = [];

  for (const member of node.members) {
    if (ts.isPropertySignature(member) && member.name) {
      const fieldName = member.name.getText(sourceFile).replace(/['"]/g, '');
      const optional = member.questionToken !== undefined;
      const fieldDesc = extractJsDoc(member, sourceFile);
      const type = member.type
        ? parseTypeNode(member.type, sourceFile)
        : { kind: 'primitive' as const, primitive: 'any' as const };

      fields.push({
        name: fieldName,
        type,
        optional,
        description: fieldDesc,
      });
    }
  }

  return {
    kind: 'struct',
    name,
    description,
    fields,
  };
}

function parseTypeAlias(
  node: ts.TypeAliasDeclaration,
  sourceFile: ts.SourceFile
): TypeDefinition | null {
  const name = node.name.text;
  const description = extractJsDoc(node, sourceFile);

  if (ts.isTypeLiteralNode(node.type)) {
    const fields: FieldDefinition[] = [];
    for (const member of node.type.members) {
      if (ts.isPropertySignature(member) && member.name) {
        const fieldName = member.name.getText(sourceFile).replace(/['"]/g, '');
        const optional = member.questionToken !== undefined;
        const fieldDesc = extractJsDoc(member, sourceFile);
        const type = member.type
          ? parseTypeNode(member.type, sourceFile)
          : { kind: 'primitive' as const, primitive: 'any' as const };

        fields.push({
          name: fieldName,
          type,
          optional,
          description: fieldDesc,
        });
      }
    }
    return {
      kind: 'struct',
      name,
      description,
      fields,
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
      const variants = node.type.types.map((t) => parseTypeNode(t, sourceFile));
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
    targetType: parseTypeNode(node.type, sourceFile),
  };
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

function parseTypeNode(typeNode: ts.TypeNode, sourceFile: ts.SourceFile): TypeNode {
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
    case ts.SyntaxKind.ArrayType: {
      const arr = typeNode as ts.ArrayTypeNode;
      return { kind: 'array', elementType: parseTypeNode(arr.elementType, sourceFile) };
    }
    case ts.SyntaxKind.TypeReference: {
      const ref = typeNode as ts.TypeReferenceNode;
      const refName = ref.typeName.getText(sourceFile);
      if (refName === 'Array' && ref.typeArguments && ref.typeArguments.length > 0) {
        return { kind: 'array', elementType: parseTypeNode(ref.typeArguments[0], sourceFile) };
      }
      if (refName === 'Record' && ref.typeArguments && ref.typeArguments.length === 2) {
        return {
          kind: 'map',
          keyType: parseTypeNode(ref.typeArguments[0], sourceFile),
          valueType: parseTypeNode(ref.typeArguments[1], sourceFile),
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
          innerType: parseTypeNode(filtered[0], sourceFile),
        };
      }

      const types = union.types.map((t) => parseTypeNode(t, sourceFile));
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
      return { kind: 'primitive', primitive: 'any' };
    }
    default:
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
