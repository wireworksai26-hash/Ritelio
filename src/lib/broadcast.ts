// Realtime synchronization across all tabs, roles, and components
// Memastikan transaksi POS kasir langsung memotong stok di layar Owner tanpa perlu refresh
// Mendukung BroadcastChannel, Storage Event, Focus Event, dan Server-Sent Events (SSE dev server)

const CHANNEL_NAME = 'retalio-realtime-channel';
let channel: BroadcastChannel | null = null;

if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
  try {
    channel = new BroadcastChannel(CHANNEL_NAME);
  } catch {
    // Fallback jika browser membatasi BroadcastChannel
  }
}

export type BroadcastAction =
  | 'STOCK_UPDATED'
  | 'PRODUCT_UPDATED'
  | 'TRANSACTION_ADDED'
  | 'DATA_SYNC';

export function broadcastStateChange(action: BroadcastAction, payload?: unknown) {
  if (typeof window === 'undefined') return;

  const message = { action, payload, timestamp: Date.now() };

  // 1. BroadcastChannel ke tab / window lain dalam profil yang sama
  if (channel) {
    try {
      channel.postMessage(message);
    } catch {
      // Abaikan error serialize
    }
  }

  // 2. CustomEvent lokal untuk komponen di tab yang sama
  window.dispatchEvent(
    new CustomEvent('retalio-local-sync', {
      detail: message,
    }),
  );

  // 3. Dev Server Sync Bridge (SSE): menyinkronkan window Incognito & beda browser secara real-time
  try {
    fetch('/api-sync/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    }).catch(() => {
      // Abaikan jika dev server tidak memiliki plugin sync
    });
  } catch {
    // Abaikan error fetch background
  }
}

export function subscribeToStateChanges(
  callback: (action: BroadcastAction, payload?: unknown) => void,
): () => void {
  if (typeof window === 'undefined') return () => {};

  const handleBroadcast = (event: MessageEvent) => {
    if (event.data && event.data.action) {
      callback(event.data.action, event.data.payload);
    }
  };

  const handleCustom = (event: Event) => {
    const customEv = event as CustomEvent;
    if (customEv.detail && customEv.detail.action) {
      callback(customEv.detail.action, customEv.detail.payload);
    }
  };

  const handleStorage = (event: StorageEvent) => {
    if (event.key === 'retalio-business-data') {
      try {
        const raw = event.newValue || localStorage.getItem('retalio-business-data');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed?.state) {
            callback('DATA_SYNC', parsed.state);
            return;
          }
        }
      } catch {
        // Fallback jika parse gagal
      }
      callback('DATA_SYNC');
    }
  };

  // Re-sync otomatis saat user berpindah tab / jendela kembali aktif
  const handleFocusOrVisible = () => {
    try {
      const raw = localStorage.getItem('retalio-business-data');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.state) {
          callback('DATA_SYNC', parsed.state);
        }
      }
    } catch {
      // Ignore parse errors
    }
  };

  if (channel) {
    channel.addEventListener('message', handleBroadcast);
  }
  window.addEventListener('retalio-local-sync', handleCustom);
  window.addEventListener('storage', handleStorage);
  window.addEventListener('focus', handleFocusOrVisible);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      handleFocusOrVisible();
    }
  });

  // Hubungkan ke SSE Server Dev untuk sync antar-profil (Incognito <-> Normal)
  let sse: EventSource | null = null;
  if ('EventSource' in window) {
    try {
      sse = new EventSource('/api-sync/events');
      sse.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data && data.action) {
            callback(data.action, data.payload);
          }
        } catch {
          // Ignore format errors
        }
      };
    } catch {
      // SSE tidak tersedia
    }
  }

  return () => {
    if (channel) {
      channel.removeEventListener('message', handleBroadcast);
    }
    window.removeEventListener('retalio-local-sync', handleCustom);
    window.removeEventListener('storage', handleStorage);
    window.removeEventListener('focus', handleFocusOrVisible);
    if (sse) {
      sse.close();
    }
  };
}
