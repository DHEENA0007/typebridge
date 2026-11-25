import {
  SchemaDocument,
  TypeDefinition,
  FieldDefinition,
  TypeNode,
  EnumValue,
  FieldConstraints,
} from '../ir/types';

/**
 * Parses a JSON Schema (Draft 7 / 2020-12) string or object into TypeBridge's SchemaDocument IR.
 */
export function parseJsonSchema(
  input: string | Record<string, any>,
  fileName = 'schema.json'
): SchemaDocument {
  const root: Record<string, any> = typeof input === 'string' ? JSON.parse(input) : input;
  const definitions: TypeDefinition[] = [];
  const defsObj: Record<string, any> = root.$defs || root.definitions || {};

  for (const [name, defSchema] of Object.entries(defsObj)) {
    if (defSchema && typeof defSchema === 'object') {
      definitions.push(parseSchemaDef(name, defSchema));
    }
  }

  // If root itself defines properties and isn't already represented by a single $defs struct
  if (root.properties && typeof root.properties === 'object') {
    const rootName = sanitizeIdentifier(root.title || pathBaseName(fileName) || 'RootSchema');
    const alreadyExists = definitions.some((d) => d.name === rootName);
    if (!alreadyExists) {
      definitions.push(parseSchemaDef(rootName, root));
    }
  }

  return {
    title: root.title || fileName,
    description: root.description,
    definitions,
  };
}

function pathBaseName(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() || 'RootSchema';
  return base.replace(/\.[^.]+$/, '');
}

function sanitizeIdentifier(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^[0-9]/, '_$&') || 'Schema';
}

function parseSchemaDef(name: string, schema: Record<string, any>): TypeDefinition {
  if (Array.isArray(schema.enum)) {
    const values: EnumValue[] = schema.enum.map((val: any) => ({
      name: String(val).toUpperCase().replace(/[^A-Z0-9_]/g, '_') || 'VALUE',
      value: typeof val === 'number' ? val : String(val),
    }));
    return {
      kind: 'enum',
      name,
      description: schema.description,
      values,
    };
  }

  if (schema.type === 'object' || schema.properties) {
    const requiredSet = new Set<string>(Array.isArray(schema.required) ? schema.required : []);
    const fields: FieldDefinition[] = [];
    const props = schema.properties || {};

    for (const [fieldName, propSchema] of Object.entries<any>(props)) {
      const constraints: FieldConstraints = {};
      if (typeof propSchema.format === 'string') constraints.format = propSchema.format;
      if (typeof propSchema.minimum === 'number') constraints.minimum = propSchema.minimum;
      if (typeof propSchema.maximum === 'number') constraints.maximum = propSchema.maximum;
      if (typeof propSchema.minLength === 'number') constraints.minLength = propSchema.minLength;
      if (typeof propSchema.maxLength === 'number') constraints.maxLength = propSchema.maxLength;
      if (typeof propSchema.pattern === 'string') constraints.pattern = propSchema.pattern;

      fields.push({
        name: fieldName,
        type: mapJsonSchemaType(propSchema),
        optional: !requiredSet.has(fieldName),
        description: propSchema.description,
        ...(propSchema.default !== undefined ? { defaultValue: propSchema.default } : {}),
        ...(Object.keys(constraints).length > 0 ? { constraints } : {}),
        ...(propSchema.deprecated ? { deprecated: true } : {}),
      });
    }

    return {
      kind: 'struct',
      name,
      description: schema.description,
      fields,
    };
  }

  if (Array.isArray(schema.anyOf) || Array.isArray(schema.oneOf)) {
    const variants = (schema.anyOf || schema.oneOf).map(mapJsonSchemaType);
    return {
      kind: 'union',
      name,
      description: schema.description,
      variants,
    };
  }

  return {
    kind: 'alias',
    name,
    description: schema.description,
    targetType: mapJsonSchemaType(schema),
  };
}

function mapJsonSchemaType(schema: Record<string, any>): TypeNode {
  if (!schema || typeof schema !== 'object') {
    return { kind: 'primitive', primitive: 'any' };
  }

  if (typeof schema.$ref === 'string') {
    const refName = schema.$ref.split('/').pop() || 'Unknown';
    return { kind: 'reference', name: refName };
  }

  if (schema.const !== undefined) {
    return { kind: 'literal', value: schema.const };
  }

  if (Array.isArray(schema.anyOf) || Array.isArray(schema.oneOf)) {
    const items = schema.anyOf || schema.oneOf;
    const nonNull = items.filter((s: any) => s?.type !== 'null');
    if (nonNull.length === 1 && nonNull.length < items.length) {
      return { kind: 'optional', innerType: mapJsonSchemaType(nonNull[0]) };
    }
    return { kind: 'union', types: items.map(mapJsonSchemaType) };
  }

  if (Array.isArray(schema.type)) {
    const nonNull = schema.type.filter((t: string) => t !== 'null');
    if (nonNull.length === 1 && nonNull.length < schema.type.length) {
      return { kind: 'optional', innerType: mapJsonSchemaType({ ...schema, type: nonNull[0] }) };
    }
    return {
      kind: 'union',
      types: schema.type.map((t: string) => mapJsonSchemaType({ ...schema, type: t })),
    };
  }

  switch (schema.type) {
    case 'string':
      if (schema.format === 'date-time' || schema.format === 'date') {
        return { kind: 'primitive', primitive: 'date' };
      }
      if (schema.format === 'uuid') {
        return { kind: 'primitive', primitive: 'uuid' };
      }
      return { kind: 'primitive', primitive: 'string' };
    case 'integer':
      return { kind: 'primitive', primitive: 'integer' };
    case 'number':
      return { kind: 'primitive', primitive: 'number' };
    case 'boolean':
      return { kind: 'primitive', primitive: 'boolean' };
    case 'null':
      return { kind: 'primitive', primitive: 'null' };
    case 'array':
      return {
        kind: 'array',
        elementType: mapJsonSchemaType(schema.items || {}),
      };
    case 'object':
      if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
        return {
          kind: 'map',
          keyType: { kind: 'primitive', primitive: 'string' },
          valueType: mapJsonSchemaType(schema.additionalProperties),
        };
      }
      return { kind: 'primitive', primitive: 'any' };
    default:
      return { kind: 'primitive', primitive: 'any' };
  }
}
