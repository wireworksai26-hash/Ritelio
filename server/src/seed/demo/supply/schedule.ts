/**
 * Penempatan jadwal work center yang tahan terhadap tanggal yang terpotong.
 *
 * Tanggal tidak pernah mundur sebelum 2 Januari tahun berjalan. Bila seed dijalankan di awal tahun, beberapa
 * jadwal lampau jatuh ke hari yang sama, padahal satu work center tidak boleh punya dua jadwal beririsan.
 * Fungsi ini menggeser menit mulai ke setelah jadwal yang sudah ada dan memberi tahu bila kapasitas harian
 * terlampaui (jadwal lampau itu hanya riwayat, jadi lembur diperbolehkan agar seed tidak gagal).
 */

export interface BookedSlot {
  startMinutes: number;
  durationMinutes: number;
}

export interface Placement {
  startMinutes: number;
  shifted: boolean;
  allowOverCapacity: boolean;
}

export function placeSchedule(booked: BookedSlot[], requestedStart: number, minutes: number, capacityMinutes: number): Placement {
  const overlaps = (start: number) => booked.some((b) => start < b.startMinutes + b.durationMinutes && b.startMinutes < start + minutes);

  let start = requestedStart;
  let shifted = false;
  if (overlaps(start)) {
    // Taruh setelah jadwal terakhir hari itu: pasti tidak beririsan.
    start = Math.max(requestedStart, ...booked.map((b) => b.startMinutes + b.durationMinutes));
    shifted = true;
  }
  const used = booked.reduce((sum, b) => sum + b.durationMinutes, 0);
  const over = used + minutes > capacityMinutes || start + minutes > capacityMinutes;
  return { startMinutes: start, shifted, allowOverCapacity: over };
}
