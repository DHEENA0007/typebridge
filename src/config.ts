import * as fs from 'fs';
import * as path from 'path';
import { SupportedTarget } from './generators';

export interface TargetConfig {
  target: SupportedTarget;
  output: string;
  options?: Record<string, any>;
}

export interface TypeBridgeConfig {
  input: string;
  targets: TargetConfig[];
}

const CONFIG_FILENAMES = ['typebridge.config.json', 'typebridge.json'];

/**
 * Searches for and loads a TypeBridge configuration file from the specified directory or cwd.
 */
export function loadConfig(searchDir = process.cwd()): { config: TypeBridgeConfig; configPath: string } | null {
  for (const filename of CONFIG_FILENAMES) {
    const candidate = path.resolve(searchDir, filename);
    if (fs.existsSync(candidate)) {
      try {
        const raw = fs.readFileSync(candidate, 'utf-8');
        const parsed = JSON.parse(raw);
        if (!parsed.input || !Array.isArray(parsed.targets)) {
          throw new Error(`Invalid configuration format in ${candidate}: missing 'input' or 'targets' array.`);
        }
        return { config: parsed, configPath: candidate };
      } catch (err: any) {
        throw new Error(`Failed to parse configuration file ${candidate}: ${err.message}`);
      }
    }
  }
  return null;
}
