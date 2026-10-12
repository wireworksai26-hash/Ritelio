-- Pindahkan barang antar gudang perlu dibedakan dari pembelian/penjualan agar
-- kartu stok bisa menjelaskan kenapa qty berubah.
ALTER TYPE "MovementType" ADD VALUE IF NOT EXISTS 'transfer_out';
ALTER TYPE "MovementType" ADD VALUE IF NOT EXISTS 'transfer_in';