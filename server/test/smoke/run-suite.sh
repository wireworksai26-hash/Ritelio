#!/usr/bin/env bash
# Menjalankan satu suite smoke dari DATABASE BERSIH: buat DB baru, migrate deploy, seed,
# jalankan server, jalankan skrip, matikan server.
#
# Pakai:   bash test/smoke/run-suite.sh <nama-suite> [port]
# Contoh:  bash test/smoke/run-suite.sh finance 4031
#
# Butuh Postgres yang bisa dijangkau lewat PG_URL_BASE (default: Postgres lokal di port 5433,
# lihat server/test/README.md). Database dibuat otomatis oleh `prisma migrate deploy`.
set -euo pipefail

SUITE="${1:?nama suite wajib, mis. finance}"
PORT="${2:-4031}"
PG_URL_BASE="${PG_URL_BASE:-postgresql://retalio:retalio_dev_pw@localhost:5433}"
DB="smoke_${SUITE//-/_}_$(date +%s)"

cd "$(dirname "$0")/../.."

export DATABASE_URL="${PG_URL_BASE}/${DB}?schema=public"
echo ">> database: ${DB}"
npx prisma migrate deploy > /dev/null
npx tsx prisma/seed.ts > /dev/null

LOG="${TMPDIR:-/tmp}/smoke-${SUITE}-${PORT}.log"
# THROTTLE_LIMIT tinggi: suite memanggil ribuan request dari satu IP; throttle auth tetap aktif.
PORT="$PORT" THROTTLE_LIMIT="${THROTTLE_LIMIT:-100000}" TS_NODE_TRANSPILE_ONLY=1 node -r ts-node/register src/main.ts > "$LOG" 2>&1 &
SERVER_PID=$!
trap 'kill $SERVER_PID 2>/dev/null || true' EXIT

for _ in $(seq 1 60); do
  if grep -q "berjalan di" "$LOG" 2>/dev/null; then break; fi
  sleep 2
done
grep -q "berjalan di" "$LOG" || { echo "server gagal start, lihat $LOG"; tail -20 "$LOG"; exit 2; }

API_URL="http://localhost:${PORT}/v1" node "test/smoke/${SUITE}.mjs"
