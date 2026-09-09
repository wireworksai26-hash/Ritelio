import { useToastStore } from '../../stores/toastStore';
import { Icon } from '../icons/Icon';

// Renderer toast global — ink surface, tanpa shadow (flat discipline)
export function Toasts() {
  const { toasts, dismiss } = useToastStore();
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-20 lg:bottom-6 right-4 lg:right-6 z-[60] flex flex-col gap-2 w-[calc(100vw-2rem)] max-w-sm">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="flex items-start gap-3 bg-ink text-paper rounded-lg px-4 py-3 border border-smoke"
          role="status"
        >
          <span className="mt-0.5 text-chartreuse">
            <Icon name={t.icon ?? 'check'} size={18} />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-[15px] leading-snug">{t.title}</p>
            {t.description && <p className="text-caption text-paper/60 mt-0.5">{t.description}</p>}
          </div>
          <button onClick={() => dismiss(t.id)} aria-label="Tutup notifikasi" className="text-paper/50 hover:text-paper">
            <Icon name="close" size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
