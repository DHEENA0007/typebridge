import {
  SchemaDocument,
  TypeDefinition,
  TypeNode,
  FieldDefinition,
} from '../ir/types';

export interface DiffResult {
  isCompatible: boolean;
  breaking: string[];
  nonBreaking: string[];
}

export interface SchemaStats {
  modelsCount: number;
  enumsCount: number;
  totalFieldsCount: number;
  documentedFieldsCount: number;
  docCoveragePercent: number;
}

/**
 * Computes architectural metrics and documentation coverage of a schema.
 */
export function getSchemaStats(doc: SchemaDocument): SchemaStats {
  const structs = doc.definitions.filter(
    (d): d is Extract<TypeDefinition, { kind: 'struct' }> => d.kind === 'struct'
  );
  const enums = doc.definitions.filter(
    (d): d is Extract<TypeDefinition, { kind: 'enum' }> => d.kind === 'enum'
  );

  let totalFields = 0;
  let documentedFields = 0;

  for (const s of structs) {
    totalFields += s.fields.length;
    for (const f of s.fields) {
      if (f.description && f.description.trim().length > 0) {
        documentedFields++;
      }
    }
  }

  const docCoverage =
    totalFields > 0 ? Math.round((documentedFields / totalFields) * 100) : 100;

  return {
    modelsCount: structs.length,
    enumsCount: enums.length,
    totalFieldsCount: totalFields,
    documentedFieldsCount: documentedFields,
    docCoveragePercent: docCoverage,
  };
}

/**
 * Compares a base schema with an updated schema and identifies breaking changes.
 */
export function diffSchemas(baseDoc: SchemaDocument, targetDoc: SchemaDocument): DiffResult {
  const breaking: string[] = [];
  const nonBreaking: string[] = [];

  const baseMap = new Map(baseDoc.definitions.map((d) => [d.name, d]));
  const targetMap = new Map(targetDoc.definitions.map((d) => [d.name, d]));

  // Check for deleted or altered definitions
  for (const [name, baseDef] of baseMap.entries()) {
    const targetDef = targetMap.get(name);
    if (!targetDef) {
      breaking.push(`Model '${name}' was deleted.`);
      continue;
    }

    if (baseDef.kind !== targetDef.kind) {
      breaking.push(`Model '${name}' changed kind from ${baseDef.kind} to ${targetDef.kind}.`);
      continue;
    }

    if (baseDef.kind === 'struct' && targetDef.kind === 'struct') {
      const baseFields = new Map(baseDef.fields.map((f) => [f.name, f]));
      const targetFields = new Map(targetDef.fields.map((f) => [f.name, f]));

      // Check removed fields
      for (const [fname, bfield] of baseFields.entries()) {
        const tfield = targetFields.get(fname);
        if (!tfield) {
          breaking.push(`Field '${name}.${fname}' was removed.`);
          continue;
        }

        // Check optional -> required (breaking!)
        if (bfield.optional && !tfield.optional) {
          breaking.push(`Field '${name}.${fname}' changed from optional to required.`);
        }

        // Check type compatibility
        const btypeStr = JSON.stringify(bfield.type);
        const ttypeStr = JSON.stringify(tfield.type);
        if (btypeStr !== ttypeStr) {
          breaking.push(`Field '${name}.${fname}' data type changed.`);
        }
      }

      // Check added fields
      for (const [fname, tfield] of targetFields.entries()) {
        if (!baseFields.has(fname)) {
          if (tfield.optional) {
            nonBreaking.push(`Added optional field '${name}.${fname}'.`);
          } else {
            breaking.push(`Added required field '${name}.${fname}' without default value.`);
          }
        }
      }
    } else if (baseDef.kind === 'enum' && targetDef.kind === 'enum') {
      const baseVals = new Set(baseDef.values.map((v) => String(v.value)));
      const targetVals = new Set(targetDef.values.map((v) => String(v.value)));

      for (const bv of baseVals) {
        if (!targetVals.has(bv)) {
          breaking.push(`Enum variant '${name}.${bv}' was removed.`);
        }
      }

      for (const tv of targetVals) {
        if (!baseVals.has(tv)) {
          nonBreaking.push(`Added enum variant '${name}.${tv}'.`);
        }
      }
    }
  }

  // Check for newly added definitions
  for (const [name, targetDef] of targetMap.entries()) {
    if (!baseMap.has(name)) {
      nonBreaking.push(`Added new ${targetDef.kind} '${name}'.`);
    }
  }

  return {
    isCompatible: breaking.length === 0,
    breaking,
    nonBreaking,
  };
}
