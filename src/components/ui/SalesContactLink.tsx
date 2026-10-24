import type { ReactNode } from 'react';
import { salesMailtoUrl, salesWhatsAppUrl } from '../../config/contact';

interface SalesContactLinkProps {
  /** Topik yang masuk ke pesan awal, mis. "Paket Custom Enterprise". */
  topic: string;
  className?: string;
  /** Isi saat WhatsApp tersedia. */
  whatsappLabel: ReactNode;
  /** Isi saat nomor WhatsApp belum diatur dan tautan jatuh ke email. */
  emailLabel: ReactNode;
}

// Tautan konsultasi ke sales: WhatsApp bila nomornya sudah diatur (VITE_SALES_WHATSAPP), selain itu email sales.
export function SalesContactLink({ topic, className, whatsappLabel, emailLabel }: SalesContactLinkProps) {
  const message = `Halo Tim Retalio, saya tertarik konsultasi ${topic}.`;
  const whatsapp = salesWhatsAppUrl(message);
  if (whatsapp) {
    return (
      <a href={whatsapp} target="_blank" rel="noreferrer" className={className}>
        {whatsappLabel}
      </a>
    );
  }
  return (
    <a href={salesMailtoUrl(`Konsultasi ${topic}`, message)} className={className}>
      {emailLabel}
    </a>
  );
}
