import { SALES_EMAIL, SALES_WHATSAPP_DISPLAY, salesMailtoUrl, salesWhatsAppUrl } from '../../config/contact';
import { Icon } from '../icons/Icon';

const GREETING = 'Halo Tim Retalio, saya ingin konsultasi tentang Retalio.';
const linkClass = 'inline-flex items-center gap-1.5 font-medium underline decoration-[#1c1c1c]/30 underline-offset-4 hover:decoration-[#1c1c1c]';

// Strip paling atas halaman depan: calon klien langsung tahu siapa yang dihubungi untuk konsultasi.
// WhatsApp hanya tampil bila nomornya sudah diatur (VITE_SALES_WHATSAPP); email selalu ada.
export function SalesContactBar() {
  const whatsapp = salesWhatsAppUrl(GREETING);
  return (
    <div className="bg-chartreuse text-[#1c1c1c]">
      <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-center gap-x-5 gap-y-1 px-4 py-2 text-body-sm">
        <span className="hidden sm:inline">Mau konsultasi dulu? Hubungi sales Retalio:</span>
        <span className="sm:hidden">Konsultasi dengan sales:</span>
        <span className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
          {whatsapp && (
            <a href={whatsapp} target="_blank" rel="noreferrer" className={linkClass}>
              <Icon name="chat" size={15} />
              WhatsApp {SALES_WHATSAPP_DISPLAY}
            </a>
          )}
          <a href={salesMailtoUrl('Konsultasi Retalio', GREETING)} className={linkClass}>
            <Icon name="mail" size={15} />
            {SALES_EMAIL}
          </a>
        </span>
      </div>
    </div>
  );
}
