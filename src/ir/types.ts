/**
 * TypeBridge Universal Type Intermediate Representation (AST)
 * 
 * Vendor-neutral schema representation that connects TypeScript, Python,
 * Rust, Go, and JSON Schema with zero runtime overhead.
 */

export type PrimitiveKind =
  | 'string'
  | 'number'
  | 'integer'
  | 'boolean'
  | 'date'
  | 'uuid'
  | 'any'
  | 'null';

export type TypeNode =
  | { kind: 'primitive'; primitive: PrimitiveKind }
  | { kind: 'reference'; name: string }
  | { kind: 'array'; elementType: TypeNode }
  | { kind: 'map'; keyType: TypeNode; valueType: TypeNode }
  | { kind: 'optional'; innerType: TypeNode }
  | { kind: 'union'; types: TypeNode[] }
  | { kind: 'literal'; value: string | number | boolean };

export interface FieldDefinition {
  name: string;
  type: TypeNode;
  optional: boolean;
  description?: string;
  defaultValue?: string | number | boolean | null;
}

export interface EnumValue {
  name: string;
  value: string | number;
  description?: string;
}

export type TypeDefinition =
  | {
      kind: 'struct';
      name: string;
      description?: string;
      fields: FieldDefinition[];
    }
  | {
      kind: 'enum';
      name: string;
      description?: string;
      values: EnumValue[];
    }
  | {
      kind: 'alias';
      name: string;
      description?: string;
      targetType: TypeNode;
    }
  | {
      kind: 'union';
      name: string;
      description?: string;
      variants: TypeNode[];
    };

export interface SchemaDocument {
  title?: string;
  version?: string;
  description?: string;
  definitions: TypeDefinition[];
}
