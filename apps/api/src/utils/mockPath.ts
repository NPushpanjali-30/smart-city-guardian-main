import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Resolves a mock file path reliably whether running from workspace root or apps/api
 */
export function resolveMockPath(relativePath: string): string {
  // 1. Direct from process.cwd()
  const p1 = path.resolve(process.cwd(), relativePath);
  if (fs.existsSync(p1)) return p1;

  // 2. Relative to apps/api parent (when cwd is apps/api)
  const p2 = path.resolve(process.cwd(), '..', relativePath);
  if (fs.existsSync(p2)) return p2;

  // 3. Relative to packages or nested subdirs
  const p3 = path.resolve(process.cwd(), '../..', relativePath);
  if (fs.existsSync(p3)) return p3;

  // 4. Relative to workspace root from this file (apps/api/src/utils -> ../../../)
  const p4 = path.resolve(__dirname, '../../../', relativePath);
  if (fs.existsSync(p4)) return p4;

  return p1;
}
