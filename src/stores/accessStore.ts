import { create } from 'zustand';
import { ACCESS_RESTRICTED_EVENT, READ_ONLY_CODE, apiFetch } from '../lib/api';

// Keadaan akses akun dari server (GET /v1/auth/me): penuh, baca saja (trial/langganan berakhir), atau ditangguhkan.
// Sengaja tidak disimpan di perangkat: sumber kebenarannya selalu server.
export type AccessMode = 'full' | 'read_only' | 'suspended';

export interface AccessState {
  mode: AccessMode;
  reason: string;
  endsAt: string | null;
}

interface AccessStore {
  access: AccessState | null;
  /** Ambil keadaan akses terbaru. Diam bila gagal (mis. offline); keadaan sebelumnya dipertahankan. */
  load: () => Promise<void>;
  reset: () => void;
}

export const useAccessStore = create<AccessStore>((set) => ({
  access: null,
  load: async () => {
    try {
      const me = await apiFetch<{ access?: { mode?: AccessMode; reason?: string; endsAt?: string | null } }>('/v1/auth/me');
      if (me.access?.mode) {
        set({ access: { mode: me.access.mode, reason: me.access.reason ?? 'ok', endsAt: me.access.endsAt ?? null } });
      }
    } catch {
      // offline atau sesi berakhir: ditangani lapisan lain
    }
  },
  reset: () => set({ access: null }),
}));

// Server menolak tulis karena akun baca saja: tandai segera, tanpa menunggu muat ulang, supaya banner dan tombol ikut berubah.
if (typeof window !== 'undefined') {
  window.addEventListener(ACCESS_RESTRICTED_EVENT, (event) => {
    const code = (event as CustomEvent<{ code?: string }>).detail?.code;
    if (code !== READ_ONLY_CODE) return;
    useAccessStore.setState((s) => ({
      access: { mode: 'read_only', reason: s.access?.reason ?? 'trial_expired', endsAt: s.access?.endsAt ?? null },
    }));
  });
}
