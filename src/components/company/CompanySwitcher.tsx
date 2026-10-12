import { Select } from '../ui/controls';

export interface CompanyOption {
  id: string;
  code: string;
  name: string;
  defaultCurrencyCode: string;
}

interface CompanySwitcherProps {
  companies: CompanyOption[];
  value: string;
  onChange: (companyId: string) => void;
  label?: string;
}

/**
 * Pemilih perusahaan generik (mis. kurs per perusahaan di panel Pengaturan).
 * Perusahaan aktif seluruh aplikasi dipilih lewat ActiveCompanyPicker di Topbar.
 */
export function CompanySwitcher({ companies, value, onChange, label = 'Perusahaan' }: CompanySwitcherProps) {
  return (
    <Select label={label} value={value} onChange={(e) => onChange(e.target.value)} disabled={companies.length === 0}>
      {companies.length === 0 && <option value="">Belum ada perusahaan</option>}
      {companies.map((c) => (
        <option key={c.id} value={c.id}>
          {c.code} — {c.name} ({c.defaultCurrencyCode})
        </option>
      ))}
    </Select>
  );
}
