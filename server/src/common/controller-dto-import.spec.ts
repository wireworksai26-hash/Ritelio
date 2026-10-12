import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC_ROOT = join(__dirname, '..');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (entry === 'node_modules' || entry === 'dist') return [];
    if (statSync(full).isDirectory()) return walk(full);
    return full.endsWith('.ts') ? [full] : [];
  });
}

describe('DTO import pada controller', () => {
  const controllers = walk(SRC_ROOT).filter((f) => f.endsWith('.controller.ts'));

  it('menemukan controller di src/modules', () => {
    expect(controllers.length).toBeGreaterThan(0);
  });

  /**
   * Nest membaca `design:paramtypes` dari decorator untuk menentukan kelas DTO
   * pada @Body/@Query. Meng-import DTO dengan `import type` membuat
   * TypeScript menghapus metadata tersebut, sehingga ValidationPipe melewati
   * request tanpa validasi apa pun dan payload mentah sampai ke service/Prisma.
   */
  it('tidak ada controller yang meng-import DTO via `import type`', () => {
    const offenders: string[] = [];
    for (const file of controllers) {
      const source = readFileSync(file, 'utf8');
      const typeImports = source.match(/import type \{[^}]*\} from '[^']*dto[^']*'/g) ?? [];
      if (typeImports.length > 0) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});