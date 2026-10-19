/** "Rp 1.250.000" tanpa bergantung pada data locale ICU runtime. */
export function formatRupiah(value: number): string {
  const rounded = Math.round(value);
  const digits = Math.abs(rounded).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${rounded < 0 ? '-' : ''}Rp ${digits}`;
}
