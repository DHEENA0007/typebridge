import { SchemaDocument } from '../ir/types';
import { generatePython, PythonGeneratorOptions } from './python';
import { generateRust } from './rust';
import { generateGo, GoGeneratorOptions } from './go';
import { generateTypeScript, TypeScriptGeneratorOptions } from './typescript';
import { generateJsonSchema, JsonSchemaOptions } from './json-schema';
import { generateMarkdown, MarkdownGeneratorOptions } from './markdown';
import { generateGraphQL, GraphQLGeneratorOptions } from './graphql';
import { generateOpenAPI, generateMCPTools, OpenAPIGeneratorOptions } from './openapi';

export * from './python';
export * from './rust';
export * from './go';
export * from './typescript';
export * from './json-schema';
export * from './markdown';
export * from './graphql';
export * from './openapi';

export type SupportedTarget =
  | 'python'
  | 'py'
  | 'rust'
  | 'rs'
  | 'go'
  | 'golang'
  | 'typescript'
  | 'ts'
  | 'json-schema'
  | 'json'
  | 'markdown'
  | 'md'
  | 'docs'
  | 'graphql'
  | 'gql'
  | 'openapi'
  | 'oas'
  | 'mcp';

export interface GenerateOptions {
  python?: PythonGeneratorOptions;
  go?: GoGeneratorOptions;
  typescript?: TypeScriptGeneratorOptions;
  jsonSchema?: JsonSchemaOptions;
  markdown?: MarkdownGeneratorOptions;
  graphql?: GraphQLGeneratorOptions;
  openapi?: OpenAPIGeneratorOptions;
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
    case 'markdown':
    case 'md':
    case 'docs':
      return generateMarkdown(doc, options.markdown);
    case 'graphql':
    case 'gql':
      return generateGraphQL(doc, options.graphql);
    case 'openapi':
    case 'oas':
      return generateOpenAPI(doc, { ...options.openapi, mode: 'openapi' });
    case 'mcp':
      return generateMCPTools(doc);
    default:
      throw new Error(
        `Unsupported target: '${target}'. Supported targets: python, rust, go, typescript, json-schema, markdown, graphql, openapi, mcp.`
      );
  }
}

