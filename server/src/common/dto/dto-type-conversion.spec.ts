import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC_ROOT = join(__dirname, '..', '..');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return full.endsWith('.ts') ? [full] : [];
  });
}

const dtoFiles = walk(SRC_ROOT).filter((f) => /[\\/]dto[\\/]/.test(f));

describe('konversi tipe pada DTO', () => {
  /**
   * ValidationPipe dikonfigurasi dengan enableImplicitConversion: false demi
   * keamanan, jadi setiap field numerik yang berasal dari query string harus
   * dikonversi eksplisit lewat @Type(() => Number). Tanpa itu query seperti
   * `?days=30` ditolak dengan "must be an integer number".
   *
   * Hanya kelas query yang diperiksa: field pada body JSON sudah boolean/number
   * dari parser, sehingga tidak memerlukan konversi.
   */
  it('setiap field numerik pada DTO query punya @Type(() => Number)', () => {
    const offenders: string[] = [];
    for (const file of dtoFiles) {
      const lines = readFileSync(file, 'utf8').split(/\r?\n/);
      let currentClass = '';
      lines.forEach((line, index) => {
        const classMatch = line.match(/export class (\w+)/);
        if (classMatch) {
          currentClass = classMatch[1];
          return;
        }
        if (!/@IsInt\(\)/.test(line)) return;
        if (!/Query/.test(currentClass)) return;
        const hasType = lines
          .slice(Math.max(0, index - 3), index)
          .some((l) => /@Type\(\(\) => Number\)/.test(l));
        if (!hasType) offenders.push(`${file.replace(SRC_ROOT, '')}:${index + 1} (${currentClass})`);
      });
    }
    expect(offenders).toEqual([]);
  });
});