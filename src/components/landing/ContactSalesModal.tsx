import { INTAKE_FORM_URL, SALES_EMAIL, SALES_WHATSAPP_DISPLAY, salesMailtoUrl, salesWhatsAppUrl } from '../../config/contact';
import { useContactSalesStore } from '../../stores/contactSalesStore';
import { Icon } from '../icons/Icon';
import { Modal } from '../ui/Modal';

const actionClass =
  'flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-[15px] font-medium transition-colors';

/** Pesan pembuka untuk WhatsApp dan email, mengikuti topik tombol yang diklik. */
function openingMessage(topic: string | null): string {
  return `Halo Tim Retalio, saya ingin konsultasi${topic ? ` tentang ${topic}` : ''}.`;
}

// Dialog pilihan cara menghubungi sales. WhatsApp hanya tampil bila nomornya sudah diatur (VITE_SALES_WHATSAPP).
export function ContactSalesModal() {
  const { open, topic, close } = useContactSalesStore();
  const message = openingMessage(topic);
  const whatsapp = salesWhatsAppUrl(message);

  return (
    <Modal open={open} onClose={close} title="Hubungi sales Retalio" maxWidth="sm">
      <p className="text-body-sm text-fossil">
        Ceritakan kebutuhan usahamu. Tim sales membantu memilih paket yang cocok dan menjawab pertanyaanmu.
      </p>
      <div className="mt-5 space-y-2.5">
        {INTAKE_FORM_URL && (
          <a
            href={INTAKE_FORM_URL}
            target="_blank"
            rel="noreferrer"
            onClick={close}
            className={`${actionClass} bg-chartreuse text-[#1c1c1c] hover:brightness-95`}
          >
            <Icon name="document" size={17} />
            Isi formulir konsultasi
          </a>
        )}
        {whatsapp && (
          <a
            href={whatsapp}
            target="_blank"
            rel="noreferrer"
            onClick={close}
            className={`${actionClass} ${INTAKE_FORM_URL ? 'border border-ash bg-paper text-ink hover:bg-sand' : 'bg-ink text-paper hover:bg-ink/90'}`}
          >
            <Icon name="chat" size={17} />
            Chat WhatsApp {SALES_WHATSAPP_DISPLAY}
          </a>
        )}
        <a
          href={salesMailtoUrl(topic ? `Konsultasi ${topic}` : 'Konsultasi Retalio', message)}
          onClick={close}
          className={`${actionClass} ${whatsapp || INTAKE_FORM_URL ? 'border border-ash bg-paper text-ink hover:bg-sand' : 'bg-ink text-paper hover:bg-ink/90'}`}
        >
          <Icon name="mail" size={17} />
          Email {SALES_EMAIL}
        </a>
      </div>
    </Modal>
  );
}
