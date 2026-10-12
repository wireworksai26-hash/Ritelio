-- Tambah metode 'credit' untuk penjualan kredit (tagih piutang, bukan terima kas).
-- Enum PostgreSQL tidak bisa diubah dengan ALTER TYPE ... ADD VALUE di dalam
-- transaction yang sama, jadi migration ini sengaja tanpa BEGIN/COMMIT.
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'credit';