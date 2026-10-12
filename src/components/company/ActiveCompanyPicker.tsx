import { useEffect } from 'react';
import { Icon } from '../icons/Icon';
import { listOf, useResource } from '../../lib/useResource';
import { useCompanyStore } from '../../stores/companyStore';
import type { CompanyOption } from './CompanySwitcher';

/**
 * Pemilih perusahaan aktif di Topbar. Hanya muncul bila tenant punya lebih dari
 * satu perusahaan. Perubahan dikirim ke backend lewat header X-Company-Id (apiFetch)
 * dan AppShell me-remount halaman supaya semua data dimuat ulang untuk perusahaan baru.
 */
export function ActiveCompanyPicker() {
  const { selected, setSelected } = useCompanyStore();
  const companies = useResource<CompanyOption[]>('/v1/companies');
  const list = listOf<CompanyOption>(companies.data);

  // Perusahaan tersimpan yang sudah tidak ada/aktif -> kembali ke utama
  useEffect(() => {
    if (selected && list.length > 0 && !list.some((c) => c.id === selected)) setSelected('');
  }, [selected, list, setSelected]);

  if (list.length < 2) return null;

  return (
    <div className="relative shrink-0">
      <select
        value={selected || list.find((c) => c.code === 'MAIN')?.id || list[0].id}
        onChange={(e) => {
          const main = list.find((c) => c.code === 'MAIN');
          setSelected(e.target.value === main?.id ? '' : e.target.value);
        }}
        aria-label="Pilih perusahaan"
        className="appearance-none bg-paper/60 border border-ash rounded-lg pl-2.5 pr-7 py-1.5 sm:py-2 text-caption sm:text-body-sm text-ink hover:border-pebble focus:border-ink focus:outline-none cursor-pointer max-w-[130px] sm:max-w-[200px] truncate"
      >
        {list.map((c) => (
          <option key={c.id} value={c.id}>
            {c.code} · {c.name}
          </option>
        ))}
      </select>
      <Icon name="chevron-down" size={13} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-fossil" />
    </div>
  );
}
