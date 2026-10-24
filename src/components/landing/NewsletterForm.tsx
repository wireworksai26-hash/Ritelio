import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { LEGAL_CONTACT } from '../../config/legal';
import { apiFetch } from '../../lib/api';
import { Button } from '../ui/Button';

type State = { phase: 'idle' | 'sending' } | { phase: 'done' } | { phase: 'error'; message: string };

// Formulir langganan newsletter di footer. Mengirim email ke POST /v1/newsletter/subscribe. Kolom "website"
// disembunyikan dari pengunjung dan hanya terisi oleh bot; server mengabaikan kiriman yang mengisinya.
export function NewsletterForm() {
  const [email, setEmail] = useState('');
  const [trap, setTrap] = useState('');
  const [state, setState] = useState<State>({ phase: 'idle' });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const value = email.trim();
    if (!value || state.phase === 'sending') return;
    setState({ phase: 'sending' });
    try {
      await apiFetch('/v1/newsletter/subscribe', { method: 'POST', body: JSON.stringify({ email: value, website: trap }) });
      setEmail('');
      setState({ phase: 'done' });
    } catch (err) {
      setState({ phase: 'error', message: err instanceof Error ? err.message : 'Belum berhasil. Coba lagi sebentar lagi.' });
    }
  };

  if (state.phase === 'done') {
    return (
      <div className="mt-4" role="status">
        <p className="text-[15px] text-ink">Terima kasih, emailmu sudah kami catat.</p>
        <p className="mt-1 text-body-sm text-fossil">
          Pengiriman newsletter belum dimulai. Begitu aktif, kami akan mengirim email konfirmasi lebih dulu, dan kamu baru menerima newsletter setelah
          mengonfirmasinya.
        </p>
        <button type="button" onClick={() => setState({ phase: 'idle' })} className="mt-2 text-caption text-ink underline underline-offset-4">
          Daftarkan email lain
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="mt-4" noValidate={false}>
      <div className="flex gap-2">
        <input
          type="email"
          required
          maxLength={254}
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="email@bisnismu.id"
          aria-label="Email untuk newsletter"
          className="flex-1 min-w-0 bg-paper border border-pebble/70 rounded-lg px-3 py-2.5 text-[15px] placeholder:text-pebble focus:border-ink focus:outline-none"
        />
        <Button size="sm" type="submit" disabled={state.phase === 'sending'}>
          {state.phase === 'sending' ? 'Mengirim…' : 'Langganan'}
        </Button>
      </div>
      {/* Kolom jebakan bot: di luar layar, tidak bisa difokus, dan tidak dibaca pembaca layar. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Situs web
          <input type="text" name="website" tabIndex={-1} autoComplete="off" value={trap} onChange={(e) => setTrap(e.target.value)} />
        </label>
      </div>
      {state.phase === 'error' && (
        <p role="alert" className="mt-2 text-caption text-rose-700">
          {state.message}
        </p>
      )}
      <p className="mt-3 text-caption text-fossil">
        Dengan berlangganan, kamu setuju emailmu kami simpan untuk mengirim insight bisnis dan kabar pembaruan Retalio, sesuai{' '}
        <Link to="/privasi" className="text-ink underline underline-offset-4">
          Kebijakan Privasi
        </Link>
        . Mau berhenti atau emailmu dihapus? Kabari kami di {LEGAL_CONTACT.email}.
      </p>
    </form>
  );
}
