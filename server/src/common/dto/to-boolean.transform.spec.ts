import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { ProductQueryDto } from '../../modules/inventory/dto/inventory.dto';
import { ListPartyQueryDto } from '../../modules/parties/dto/party.dto';

function parse<T>(Dto: new () => T, query: Record<string, string>): T {
  return plainToInstance(Dto, query);
}

describe('boolean pada query string', () => {
  it('menafsirkan "false" sebagai false, bukan true', () => {
    expect(parse(ProductQueryDto, { isActive: 'false' }).isActive).toBe(false);
  });

  it('menafsirkan "true" sebagai true', () => {
    expect(parse(ProductQueryDto, { isActive: 'true' }).isActive).toBe(true);
  });

  it('menerima 0 dan 1', () => {
    expect(parse(ProductQueryDto, { isActive: '0' }).isActive).toBe(false);
    expect(parse(ProductQueryDto, { isActive: '1' }).isActive).toBe(true);
  });

  it('membiarkan parameter kosong tetap undefined', () => {
    expect(parse(ProductQueryDto, {}).isActive).toBeUndefined();
  });

  it('berlaku untuk filter party', () => {
    expect(parse(ListPartyQueryDto, { isActive: 'false' }).isActive).toBe(false);
  });

  it('tetap memvalidasi nilai non-boolean', () => {
    const errors = validateSync(parse(ProductQueryDto, { isActive: 'maybe' }), {
      whitelist: true,
    });
    expect(errors.length).toBeGreaterThan(0);
  });
});