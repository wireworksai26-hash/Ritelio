import { defineConfig } from 'vitest/config';

// Tes frontend hanya di src/. Folder server/ punya konfigurasi Vitest sendiri.
export default defineConfig({
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'node',
  },
});
