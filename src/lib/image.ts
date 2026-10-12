// Kompresi foto di sisi klien. Foto kamera HP bisa 5-12 MB, sementara backend OCR
// menolak >8 MB dan data seluler mahal. Sisi terpanjang 1600px dengan JPEG 0,82
// tetap terbaca untuk invoice dan biasanya di bawah 400 KB.

export interface CompressedImage {
  fileName: string;
  mimeType: 'image/jpeg';
  dataBase64: string;
  previewUrl: string;
}

const MAX_EDGE = 1600;
const QUALITY = 0.82;
const MAX_BYTES = 8 * 1024 * 1024;

async function decode(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      // imageOrientation menghormati EXIF supaya foto portrait tidak miring
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
    } catch {
      // jatuh ke <img> di bawah
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Berkas gambar tidak bisa dibaca.'));
      el.src = url;
    });
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => {} };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(new Error('Gagal membaca gambar.'));
    reader.readAsDataURL(blob);
  });
}

export async function compressImage(file: File): Promise<CompressedImage> {
  if (!file.type.startsWith('image/')) throw new Error('Pilih berkas gambar (JPG, PNG, atau WebP).');

  const { source, width, height, close } = await decode(file);
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Browser tidak mendukung pengolahan gambar.');
    // Latar putih: PNG transparan jadi hitam saat dikonversi ke JPEG
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALITY));
    if (!blob) throw new Error('Gagal memproses gambar.');
    if (blob.size > MAX_BYTES) throw new Error('Gambar terlalu besar (maks 8 MB). Coba foto ulang dengan resolusi lebih kecil.');

    return {
      fileName: file.name.replace(/\.[^.]+$/, '') + '.jpg',
      mimeType: 'image/jpeg',
      dataBase64: await blobToBase64(blob),
      previewUrl: URL.createObjectURL(blob),
    };
  } finally {
    close();
  }
}
