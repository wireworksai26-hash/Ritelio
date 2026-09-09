import { useEffect, useRef, useState, type FormEvent } from 'react';
import { suggestionPrompts } from '../../data/assistantBrain';
import { cn, formatTime } from '../../lib/format';
import { useAssistantStore } from '../../stores/assistantStore';
import { useSyncStore } from '../../stores/syncStore';
import { toast } from '../../stores/toastStore';
import { Icon } from '../icons/Icon';
import { Badge } from '../ui/Badge';

// Drawer Retalio Intelligence — terinspirasi reference chat.png:
// input putih dengan tombol + dan tombol kirim kotak gelap berisi panah atas,
// panel "Thinking" charcoal, jawaban selalu menyertakan referensi based_on.
export function AssistantDrawer() {
  const { isOpen, close, messages, thinking, send, clear } = useAssistantStore();
  const isOnline = useSyncStore((s) => s.isOnline);
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length, thinking, isOpen]);

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (!draft.trim() || thinking) return;
    send(draft);
    setDraft('');
  };

  return (
    <div
      className={cn(
        'fixed inset-y-0 right-0 z-50 w-full sm:w-[420px] bg-paper border-l border-ash flex flex-col',
        'transition-transform duration-300 ease-out',
        isOpen ? 'translate-x-0' : 'translate-x-full pointer-events-none',
      )}
      aria-hidden={!isOpen}
    >
      <div className="flex items-center gap-3 border-b border-ash px-4 py-3.5">
        <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-chartreuse text-ink">
          <Icon name="assistant" size={18} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[15px] text-ink leading-tight">Retalio Intelligence</p>
          <p className="text-caption text-fossil">Asisten bisnis AI — jawaban berbasis data aktual</p>
        </div>
        <Badge variant="outline">Beta</Badge>
        <button onClick={close} aria-label="Tutup asisten" className="p-1.5 text-fossil hover:text-ink transition-colors">
          <Icon name="close" size={18} />
        </button>
      </div>

      {!isOnline && (
        <div className="flex items-center gap-2 bg-sand px-4 py-2 text-caption text-smoke border-b border-ash">
          <Icon name="offline" size={14} />
          Mode offline — AI membutuhkan koneksi internet
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && !thinking && (
          <div className="pt-8">
            <p className="text-heading font-light text-ink">Ada yang bisa saya bantu?</p>
            <p className="text-body-sm text-fossil mt-2">
              Tanyakan penjualan, stok, keuangan, atau performa outlet. Setiap jawaban menyertakan sumber datanya.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {suggestionPrompts.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-lg border border-ash bg-paper px-3 py-2 text-body-sm text-ink hover:bg-sand transition-colors text-left"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) =>
          m.role === 'user' ? (
            <div key={m.id} className="ml-auto max-w-[85%] rounded-xl bg-sand px-3.5 py-2.5 text-[15px] text-ink whitespace-pre-line">
              {m.content}
            </div>
          ) : (
            <div key={m.id} className="max-w-[92%] rounded-xl border border-ash bg-bone px-4 py-3">
              <div className="flex items-center justify-between gap-2 mb-2">
                <Badge variant="accent" icon="assistant">
                  AI
                </Badge>
                <span className="text-caption text-pebble">{formatTime(m.created_at)}</span>
              </div>
              <p className="text-[15px] leading-relaxed text-ink whitespace-pre-line">{m.content}</p>
              {m.based_on_refs && m.based_on_refs.length > 0 && (
                <p className="mt-3 border-t border-ash pt-2 text-caption text-fossil">
                  Berdasarkan: {m.based_on_refs.join(' · ')}
                </p>
              )}
              <div className="mt-2 flex items-center gap-1">
                <button
                  onClick={() => toast({ title: 'Terima kasih, masukanmu membantu AI belajar.', icon: 'thumb-up' })}
                  aria-label="Jawaban membantu"
                  className="p-1.5 rounded-md text-pebble hover:text-ink hover:bg-sand transition-colors"
                >
                  <Icon name="thumb-up" size={14} />
                </button>
                <button
                  onClick={() => toast({ title: 'Masukan dicatat untuk perbaikan jawaban.', icon: 'thumb-down' })}
                  aria-label="Jawaban kurang tepat"
                  className="p-1.5 rounded-md text-pebble hover:text-ink hover:bg-sand transition-colors"
                >
                  <Icon name="thumb-down" size={14} />
                </button>
              </div>
            </div>
          ),
        )}

        {thinking && (
          <div className="inline-flex items-center gap-2.5 rounded-xl bg-smoke px-4 py-3 text-paper/70 text-[15px]">
            <span className="flex gap-1" aria-hidden="true">
              {[0, 1, 2, 3, 4].map((i) => (
                <span key={i} className="thinking-dot inline-block h-1 w-1 rounded-full bg-paper/70" />
              ))}
            </span>
            Thinking…
          </div>
        )}
      </div>

      <form onSubmit={submit} className="border-t border-ash p-3">
        <div className="flex items-end gap-2 rounded-xl border border-pebble/70 bg-paper px-3 py-2 focus-within:border-ink transition-colors">
          <button
            type="button"
            aria-label="Lampirkan struk atau dokumen (OCR)"
            title="Lampirkan struk/dokumen (OCR)"
            onClick={() => toast({ title: 'Smart Receipt OCR', description: 'Unggah struk akan tersedia setelah backend AI tersambung.', icon: 'camera' })}
            className="p-1.5 text-fossil hover:text-ink transition-colors"
          >
            <Icon name="plus" size={18} />
          </button>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            rows={1}
            placeholder="Tanya sesuatu…"
            aria-label="Tulis pertanyaan"
            className="flex-1 resize-none bg-transparent text-[15px] text-ink placeholder:text-pebble focus:outline-none max-h-32"
          />
          <button
            type="submit"
            disabled={!draft.trim() || thinking}
            aria-label="Kirim"
            className="inline-flex items-center justify-center rounded-lg bg-smoke text-paper p-2 hover:bg-ink transition-colors disabled:opacity-40"
          >
            <Icon name="arrow-up" size={16} />
          </button>
        </div>
        <div className="mt-2 flex items-center justify-between">
          <p className="text-caption text-pebble">Jawaban numerik selalu dihitung dari data bisnismu.</p>
          {messages.length > 0 && (
            <button type="button" onClick={clear} className="text-caption text-fossil hover:text-ink transition-colors">
              Bersihkan
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
