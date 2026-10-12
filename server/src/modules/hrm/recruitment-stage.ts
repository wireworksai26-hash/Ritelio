import { BadRequestException, ConflictException } from '@nestjs/common';
import { roundMoney } from '../../common/utils/money';

export const STAGE_ORDER = ['applied', 'screening', 'interview', 'offer', 'hired', 'rejected'] as const;
export type ApplicantStage = (typeof STAGE_ORDER)[number];

/**
 * Validasi perpindahan tahap seleksi. Aturannya:
 *  - hired dan rejected adalah status akhir;
 *  - maju hanya satu langkah (applied -> screening -> interview -> offer);
 *  - `rejected` boleh dari tahap aktif mana pun, wajib dengan alasan;
 *  - `hired` TIDAK boleh lewat jalur ini: harus lewat hire(), yang membuat Employee
 *    secara atomik. Kalau boleh, ada pelamar berstatus hired tanpa Employee dan tanpa
 *    jalan keluar (hire() menolak yang sudah hired).
 */
export function assertStageMove(current: string, target: string, note?: string): void {
  if (current === 'hired') throw new ConflictException('Pelamar sudah di-hire.');
  if (current === 'rejected') throw new ConflictException('Pelamar sudah ditolak.');

  const from = STAGE_ORDER.indexOf(current as ApplicantStage);
  const to = STAGE_ORDER.indexOf(target as ApplicantStage);
  if (from === -1) throw new ConflictException(`Tahap pelamar saat ini ("${current}") tidak dikenal.`);
  if (to === -1) throw new BadRequestException(`Tahap "${target}" tidak dikenal.`);
  if (target === 'hired') {
    throw new BadRequestException('Gunakan proses hire untuk mengangkat pelamar; tahap "hired" tidak bisa diatur langsung.');
  }
  if (target === 'rejected') {
    if (!note || !note.trim()) throw new BadRequestException('Alasan penolakan wajib diisi.');
    return;
  }
  if (to !== from + 1) {
    throw new BadRequestException(
      `Tahap harus berurutan. Pelamar di "${current}", tidak bisa langsung ke "${target}".`,
    );
  }
}

export function summarizePipeline(grouped: Array<{ stage: string; count: number }>) {
  const byStage = new Map(grouped.map((g) => [g.stage, g.count]));
  const totalApplicants = grouped.reduce((sum, g) => sum + g.count, 0);
  const hired = byStage.get('hired') ?? 0;
  return {
    stages: STAGE_ORDER.map((s) => ({ stage: s, count: byStage.get(s) ?? 0 })),
    totalApplicants,
    hired,
    rejected: byStage.get('rejected') ?? 0,
    hireRatePct: totalApplicants > 0 ? roundMoney((hired / totalApplicants) * 100) : 0,
  };
}

export const ONBOARDING_TASKS = [
  'Lengkapi data alamat dan kontak darurat',
  'Setujui cuti tahunan',
  'Serahkan laptop dan akses sistem',
  'Pasang aplikasi payroll untuk approve slip gaji',
] as const;
