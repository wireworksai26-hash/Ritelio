import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from './api';

export interface ResourceState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
  setData: (updater: T | ((prev: T | null) => T)) => void;
}

/**
 * Ambil data dari backend dengan pola yang sama di semua halaman.
 *
 * Pages sebelumnya tidak pernah memanggil API secara langsung — semuanya lewat
 * `businessStore`. Untuk modul baru yang tidak ada di store itu, pemanggilan
 * dilakukan di halaman; hook ini menjaga satu perilaku yang penting: error
 * tidak boleh membuat halaman putih, tapi harus tampil dan bisa dicoba ulang.
 */
export function useResource<T>(path: string | null, options?: { enabled?: boolean }): ResourceState<T> {
  const enabled = options?.enabled ?? true;
  const [data, setDataState] = useState<T | null>(null);
  const [loading, setLoading] = useState(Boolean(path) && enabled);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    if (!path || !enabled) {
      setDataState(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiFetch<T>(path)
      .then((res) => {
        if (!cancelled) setDataState(res);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message || 'Gagal memuat data.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path, enabled, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  const setData = useCallback((updater: T | ((prev: T | null) => T)) => {
    setDataState((prev) =>
      typeof updater === 'function' ? (updater as (p: T | null) => T)(prev) : updater,
    );
  }, []);

  return { data, loading, error, reload, setData };
}

/** Jalankan mutasi dengan status loading + pesan error yang seragam. */
export function useMutation() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | null> => {
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan.');
      return null;
    } finally {
      setBusy(false);
    }
  }, []);

  return { busy, error, setError, run };
}

/**
 * some() dari backend mengembalikan `{ data: [...] }`; sebagian endpoint lama
 * mengembalikan array polos. Dua bentuk ini dinormalkan di satu tempat supaya
 * tiap halaman tidak perlu tahu.
 */
export function listOf<T>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[];
  if (res && typeof res === 'object' && Array.isArray((res as { data?: unknown }).data)) {
    return (res as { data: T[] }).data;
  }
  return [];
}

export function useDebounced<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

export function usePagedList<T>(rows: T[], pageSize: number) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const paged = useMemo(
    () => rows.slice((page - 1) * pageSize, page * pageSize),
    [rows, page, pageSize],
  );

  return { page, setPage, totalPages, paged };
}
