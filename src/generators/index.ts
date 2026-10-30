import { SchemaDocument } from '../ir/types';
import { generatePython, PythonGeneratorOptions } from './python';
import { generateRust } from './rust';
import { generateGo, GoGeneratorOptions } from './go';
import { generateTypeScript, TypeScriptGeneratorOptions } from './typescript';
import { generateJsonSchema, JsonSchemaOptions } from './json-schema';

export * from './python';
export * from './rust';
export * from './go';
export * from './typescript';
export * from './json-schema';

export type SupportedTarget =
  | 'python'
  | 'rust'
  | 'go'
  | 'typescript'
  | 'ts'
  | 'json-schema'
  | 'json';

export interface GenerateOptions {
  python?: PythonGeneratorOptions;
  go?: GoGeneratorOptions;
  typescript?: TypeScriptGeneratorOptions;
  jsonSchema?: JsonSchemaOptions;
}

/**
 * Compiles a SchemaDocument into the specified target language code.
 */
export function compile(
  doc: SchemaDocument,
  target: SupportedTarget,
  options: GenerateOptions = {}
): string {
  switch (target.toLowerCase()) {
    case 'python':
    case 'py':
      return generatePython(doc, options.python);
    case 'rust':
    case 'rs':
      return generateRust(doc);
    case 'go':
    case 'golang':
      return generateGo(doc, options.go);
    case 'typescript':
    case 'ts':
      return generateTypeScript(doc, options.typescript);
    case 'json-schema':
    case 'json':
      return generateJsonSchema(doc, options.jsonSchema);
    default:
      throw new Error(
        `Unsupported target: '${target}'. Supported targets: python, rust, go, typescript, json-schema.`
      );
  }
}
