import {
  SchemaDocument,
  TypeDefinition,
  TypeNode,
  FieldDefinition,
} from '../ir/types';

export interface JsonSchemaOptions {
  indent?: number;
}

/**
 * Generates standard JSON Schema (compatible with OpenAPI 3.1 & MCP tool definitions).
 */
export function generateJsonSchema(
  doc: SchemaDocument,
  options: JsonSchemaOptions = { indent: 2 }
): string {
  const schema: Record<string, any> = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    title: doc.title || 'TypeBridge Schema',
    description: doc.description || 'Auto-generated JSON Schema by TypeBridge',
    $defs: {},
  };

  for (const def of doc.definitions) {
    schema.$defs[def.name] = generateDefinitionSchema(def);
  }

  // If there's only one struct definition, make it the root schema as well
  const structs = doc.definitions.filter((d) => d.kind === 'struct');
  if (structs.length === 1) {
    const root = schema.$defs[structs[0].name];
    Object.assign(schema, root);
  }

  return JSON.stringify(schema, null, options.indent);
}

function generateDefinitionSchema(def: TypeDefinition): Record<string, any> {
  if (def.kind === 'struct') {
    const required: string[] = [];
    const properties: Record<string, any> = {};

    for (const field of def.fields) {
      properties[field.name] = mapTypeToJsonSchema(field.type);
      if (field.description) {
        properties[field.name].description = field.description;
      }
      if (!field.optional) {
        required.push(field.name);
      }
    }

    const obj: Record<string, any> = {
      type: 'object',
      properties,
    };

    if (def.description) {
      obj.description = def.description;
    }
    if (required.length > 0) {
      obj.required = required;
    }
    obj.additionalProperties = false;
    return obj;
  } else if (def.kind === 'enum') {
    const enumVals = def.values.map((v) => v.value);
    const obj: Record<string, any> = {
      type: typeof enumVals[0] === 'number' ? 'number' : 'string',
      enum: enumVals,
    };
    if (def.description) {
      obj.description = def.description;
    }
    return obj;
  } else if (def.kind === 'alias') {
    return mapTypeToJsonSchema(def.targetType);
  }

  return {};
}

function mapTypeToJsonSchema(node: TypeNode): Record<string, any> {
  switch (node.kind) {
    case 'primitive':
      switch (node.primitive) {
        case 'string':
          return { type: 'string' };
        case 'uuid':
          return { type: 'string', format: 'uuid' };
        case 'date':
          return { type: 'string', format: 'date-time' };
        case 'number':
          return { type: 'number' };
        case 'integer':
          return { type: 'integer' };
        case 'boolean':
          return { type: 'boolean' };
        case 'null':
          return { type: 'null' };
        case 'any':
        default:
          return {};
      }
    case 'reference':
      return { $ref: `#/$defs/${node.name}` };
    case 'array':
      return {
        type: 'array',
        items: mapTypeToJsonSchema(node.elementType),
      };
    case 'map':
      return {
        type: 'object',
        additionalProperties: mapTypeToJsonSchema(node.valueType),
      };
    case 'optional':
      return mapTypeToJsonSchema(node.innerType);
    case 'union':
      return {
        anyOf: node.types.map(mapTypeToJsonSchema),
      };
    case 'literal':
      return { const: node.value };
    default:
      return {};
  }
}
