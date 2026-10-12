import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** `page`: hanya area konten (menu tetap hidup). `root`: seluruh layar. */
  scope?: 'page' | 'root';
  /** Nama halaman untuk log console. */
  name?: string;
}

interface ErrorBoundaryState {
  error: Error | null;
}

// Galat saat memuat potongan JS (biasanya setelah rilis baru atau koneksi putus).
function isChunkLoadError(error: Error): boolean {
  return /dynamically imported module|Loading chunk|Importing a module script failed|ChunkLoadError/i.test(
    `${error.name} ${error.message}`,
  );
}

/**
 * Menangkap galat render supaya satu halaman yang rusak tidak membuat seluruh
 * PWA menjadi layar putih. Detail teknis hanya ke console, tidak ke pengguna.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[ErrorBoundary:${this.props.name ?? this.props.scope ?? 'page'}]`, error, info.componentStack);
  }

  private reload = () => {
    window.location.reload();
  };

  private goHome = () => {
    window.location.assign(this.props.scope === 'root' ? '/' : '/app');
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const chunk = isChunkLoadError(error);
    const root = this.props.scope === 'root';
    const title = chunk ? 'Halaman gagal dimuat' : 'Halaman ini mengalami masalah';
    const body = chunk
      ? 'Koneksi terputus atau aplikasi baru saja diperbarui. Muat ulang halaman untuk melanjutkan.'
      : 'Terjadi kesalahan tak terduga saat menampilkan halaman ini. Data Anda aman. Coba muat ulang; bila masih berulang, hubungi admin.';

    return (
      <div
        role="alert"
        className={
          root
            ? 'min-h-screen bg-bone flex items-center justify-center px-4'
            : 'flex items-center justify-center py-10 sm:py-16'
        }
      >
        <div className="w-full max-w-md bg-paper border border-ash rounded-xl p-6 text-center">
          <p className="text-heading-sm text-ink">{title}</p>
          <p className="text-body-sm text-fossil mt-2">{body}</p>
          <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
            <button
              type="button"
              onClick={this.reload}
              className="min-h-11 px-5 rounded-lg bg-ink text-paper border border-ink text-[16px] hover:bg-smoke"
            >
              Muat ulang halaman
            </button>
            <button
              type="button"
              onClick={this.goHome}
              className="min-h-11 px-5 rounded-lg bg-transparent text-ink border border-ink text-[16px] hover:bg-sand"
            >
              Kembali ke beranda
            </button>
          </div>
        </div>
      </div>
    );
  }
}
