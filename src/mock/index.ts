import {
  SchemaDocument,
  TypeDefinition,
  FieldDefinition,
  TypeNode,
} from '../ir/types';

export interface MockOptions {
  count?: number;
  seed?: number;
  includeOptional?: boolean;
  maxDepth?: number;
}

/**
 * Generates realistic mock JSON data adhering to the SchemaDocument definition.
 */
export function generateMockData(
  doc: SchemaDocument,
  targetType?: string,
  options: MockOptions = {}
): any {
  const count = Math.max(1, options.count ?? 1);
  const includeOptional = options.includeOptional ?? true;
  const maxDepth = options.maxDepth ?? 3;

  const defMap = new Map<string, TypeDefinition>();
  for (const def of doc.definitions) {
    defMap.set(def.name, def);
  }

  // Find target struct
  let targetDef: TypeDefinition | undefined;
  if (targetType) {
    targetDef = defMap.get(targetType);
    if (!targetDef) {
      throw new Error(
        `Type '${targetType}' was not found in schema. Available types: ${Array.from(
          defMap.keys()
        ).join(', ')}`
      );
    }
  } else {
    // Pick first struct
    targetDef = doc.definitions.find((d) => d.kind === 'struct');
    if (!targetDef) {
      targetDef = doc.definitions[0];
    }
  }

  if (!targetDef) {
    return {};
  }

  // Seeded pseudo-random number generator (LCG)
  let seedState = (options.seed ?? 123456789) % 2147483647;
  function random(): number {
    seedState = (seedState * 16807) % 2147483647;
    return (seedState - 1) / 2147483646;
  }

  function mockValueForType(
    node: TypeNode,
    fieldName: string,
    currentDepth: number
  ): any {
    if (currentDepth > maxDepth) {
      return null;
    }

    switch (node.kind) {
      case 'primitive':
        return mockPrimitive(node.primitive, fieldName, random);

      case 'reference': {
        const refDef = defMap.get(node.name);
        if (!refDef) return `[${node.name}]`;
        if (refDef.kind === 'enum') {
          const vals = refDef.values;
          const idx = Math.floor(random() * vals.length);
          return vals[idx]?.value ?? vals[0]?.value;
        }
        if (refDef.kind === 'struct') {
          return mockStruct(refDef, currentDepth + 1);
        }
        if (refDef.kind === 'alias') {
          return mockValueForType(refDef.targetType, fieldName, currentDepth);
        }
        return {};
      }

      case 'array': {
        const length = Math.floor(random() * 2) + 2; // 2 or 3 items
        const items = [];
        for (let i = 0; i < length; i++) {
          items.push(
            mockValueForType(node.elementType, fieldName, currentDepth + 1)
          );
        }
        return items;
      }

      case 'optional':
        return mockValueForType(node.innerType, fieldName, currentDepth);

      case 'map':
        return {
          item_1: mockValueForType(node.valueType, fieldName, currentDepth + 1),
          item_2: mockValueForType(node.valueType, fieldName, currentDepth + 1),
        };

      case 'literal':
        return node.value;

      case 'union':
        // Pick one variant
        if (node.types.length === 0) return null;
        const chosen = node.types[Math.floor(random() * node.types.length)];
        return mockValueForType(chosen, fieldName, currentDepth);

      default:
        return null;
    }
  }

  function mockStruct(
    def: Extract<TypeDefinition, { kind: 'struct' }>,
    currentDepth: number
  ): Record<string, any> {
    const result: Record<string, any> = {};

    for (const field of def.fields) {
      if (field.optional && !includeOptional && random() > 0.5) {
        continue;
      }
      result[field.name] = mockValueForType(
        field.type,
        field.name,
        currentDepth
      );
    }

    return result;
  }

  function generateOne(): any {
    if (targetDef!.kind === 'struct') {
      return mockStruct(targetDef as any, 1);
    } else if (targetDef!.kind === 'enum') {
      const vals = (targetDef as any).values;
      return vals[Math.floor(random() * vals.length)]?.value;
    }
    return {};
  }

  if (count === 1) {
    return generateOne();
  }

  const results = [];
  for (let i = 0; i < count; i++) {
    results.push(generateOne());
  }
  return results;
}

/**
 * Returns mock data formatted as pretty-printed JSON string.
 */
export function generateMockJson(
  doc: SchemaDocument,
  targetType?: string,
  options: MockOptions = {}
): string {
  const data = generateMockData(doc, targetType, options);
  return JSON.stringify(data, null, 2);
}

function mockPrimitive(
  primitive: string,
  fieldName: string,
  random: () => number
): any {
  const lower = fieldName.toLowerCase();

  switch (primitive) {
    case 'string':
      if (/email/i.test(lower)) {
        const names = ['alex.rivera', 'taylor.swift', 'jordan.lee', 'elena.rostova', 'sam.altman'];
        const domains = ['example.com', 'typebridge.dev', 'cloudinfra.io'];
        return `${pick(names, random)}@${pick(domains, random)}`;
      }
      if (/name|author|creator|user/i.test(lower)) {
        const names = ['Alex Rivera', 'Jordan Lee', 'Morgan Chen', 'Elena Rostova', 'Marcus Vance'];
        return pick(names, random);
      }
      if (/id$|_id/i.test(lower)) {
        const hex = Math.floor(random() * 0xffffff)
          .toString(16)
          .padStart(6, '0');
        return `usr_${hex}`;
      }
      if (/url|avatar|image|website|link/i.test(lower)) {
        return 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400';
      }
      if (/phone|tel/i.test(lower)) {
        return '+1-555-0149';
      }
      if (/status/i.test(lower)) {
        return pick(['active', 'pending', 'verified', 'archived'], random);
      }
      if (/description|bio|summary|comment/i.test(lower)) {
        return 'High performance universal schema model generated seamlessly with zero overhead.';
      }
      if (/title/i.test(lower)) {
        return 'Senior Distributed Systems Architect';
      }
      if (/city/i.test(lower)) {
        return pick(['San Francisco', 'Berlin', 'Tokyo', 'London', 'Toronto'], random);
      }
      return `${fieldName}_val_${Math.floor(random() * 1000)}`;

    case 'number':
    case 'integer':
      if (/age/i.test(lower)) return Math.floor(random() * 45) + 20;
      if (/count|quantity|total|size/i.test(lower)) return Math.floor(random() * 20) + 1;
      if (/price|amount|balance|cost/i.test(lower)) {
        return primitive === 'integer'
          ? Math.floor(random() * 500) + 10
          : parseFloat((random() * 200 + 9.99).toFixed(2));
      }
      if (/year/i.test(lower)) return 2026;
      return primitive === 'integer'
        ? Math.floor(random() * 100) + 1
        : parseFloat((random() * 100).toFixed(2));

    case 'boolean':
      return random() > 0.3; // 70% true

    case 'date':
      const d = new Date(Date.now() - Math.floor(random() * 10000000000));
      return d.toISOString();

    case 'uuid':
      return 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

    case 'any':
      return { metadata: 'sample', active: true };

    default:
      return 'sample_value';
  }
}

function pick<T>(arr: T[], random: () => number): T {
  return arr[Math.floor(random() * arr.length)];
}
