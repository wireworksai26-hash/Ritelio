import { describe, expect, it } from 'vitest';
import { classifyAssetAccount } from './dashboard.service';

describe('classifyAssetAccount', () => {
  it('kas, persediaan, dan piutang mengikuti kode akun bawaan', () => {
    expect(classifyAssetAccount('1000', false)).toBe('cash');
    expect(classifyAssetAccount('1100', false)).toBe('inventory');
    expect(classifyAssetAccount('1200', false)).toBe('receivable');
  });

  it('rekening bank tambahan dihitung sebagai kas, apa pun kodenya', () => {
    expect(classifyAssetAccount('1010', true)).toBe('cash');
    expect(classifyAssetAccount('1020', true)).toBe('cash');
  });

  it('aset tetap dan akumulasi penyusutan bukan piutang', () => {
    expect(classifyAssetAccount('1300', false)).toBeNull();
    expect(classifyAssetAccount('1390', false)).toBeNull();
  });

  it('bank yang kodenya persediaan atau piutang tetap kas bila memang rekening bank', () => {
    expect(classifyAssetAccount('1200', true)).toBe('cash');
  });

  it('akun di luar 1xxx (mis. Piutang PPN 2150) tidak ikut', () => {
    expect(classifyAssetAccount('2150', false)).toBeNull();
  });
});
