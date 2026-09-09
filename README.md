# Retalio — Smart Business System

**Retalio** adalah sistem operasi bisnis pintar untuk SMB (Small Medium Business) yang mencakup POS, inventori, keuangan, dan AI assistant dalam satu Progressive Web App (PWA).

## 📦 Tech Stack

- **Framework**: React 18 + TypeScript + Vite
- **Styling**: Tailwind CSS v4
- **State Management**: Zustand
- **Database**: Dexie.js (IndexedDB)
- **Routing**: React Router DOM
- **Animations**: GSAP
- **PWA**: vite-plugin-pwa
- **Data Tables**: xlsx (import/export)

## ✨ Fitur Utama

- **POS System** - Transaksi penjualan dengan antrian background sync
- **Inventori & Stok** - Managemen produk dan stok dengan caching Stale-While-Revalidate
- **Keuangan & Laporan** - Laporan keuangan dengan Network First strategy
- **AI Assistant** - Endpoint AI untuk fitur bantuan bisnis
- **Real-time Sync** - Plugin sinkronisasi real-time lintas perangkat
- **PWA** - Installable offline-first web application

## 🚀 Getting Started

```bash
# Install dependencies
pnpm install

# Development server
pnpm dev

# Build for production
pnpm build

# Preview production build
pnpm preview
```

## 📁 Project Structure

```
src/
  app/           # Root component & layouts
  pages/         # Page components
  components/    # Reusable UI components
  stores/        # Zustand state stores
  lib/           # Utility functions and helpers
  types/         # TypeScript type definitions
  data/          # Static data and samples
```

## 🛠️ Available Scripts

| Script | Description |
|--------|-------------|
| `pnpm dev` | Start development server at http://localhost:5173 |
| `pnpm build` | Build production bundle |
| `pnpm preview` | Preview production build |

## 📦 Dependencies Kunci

- `react` & `react-dom` - UI library
- `react-router-dom` - Client-side routing
- `zustand` - State management
- `dexie` - IndexedDB ORM
- `gsap` - High-performance animations
- `xlsx` - Spreadsheet import/export
- `@tailwindcss/vite` - Tailwind JIT compiler
- `vite-plugin-pwa` - PWA support

## 📦 Build Configuration

Projek menggunakan Vite 6 dengan konfigurasi lanjutan untuk:

- **PWA** - Service worker dengan runtime caching untuk catalog, POS transactions, dan reports
- **Local Sync Plugin** - Real-time event broadcasting antar tab/device
- **Environment-specific settings** - Development server otomatis host ke semua interface

## 🤝 Kontribusi

1. Fork repository
2. Buat branch fitur (`git checkout -b fitur-baru`)
3. Commit perubahan (`git commit -m 'Menambahkan fitur X'`)
4. Push ke branch (`git push origin fitur-baru`)
5. Buat Pull Request

## 📄 Lisensi

Proyek bersifat private. © 2025 Retalio.