# syntax=docker/dockerfile:1
#
# Satu image untuk seluruh aplikasi: frontend (PWA) dibuild lalu dilayani oleh backend NestJS.
# Hasilnya satu service dan satu domain, jadi tidak butuh VITE_API_URL maupun CORS.
# Railway memakai file ini otomatis bila ada Dockerfile di root repo.

# ---- 1. Build frontend --------------------------------------------------------------------------
FROM node:22-bookworm-slim AS web
WORKDIR /web
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.ts tsconfig.json tsconfig.app.json tsconfig.node.json ./
COPY public ./public
COPY src ./src
# VITE_API_URL sengaja tidak diisi: di produksi alamat API = asal yang sama dengan halaman.
# Kontak sales di halaman depan (opsional). Railway hanya meneruskan variabel service ke build bila dideklarasikan sebagai ARG.
ARG VITE_SALES_WHATSAPP
ARG VITE_SALES_EMAIL
ENV VITE_SALES_WHATSAPP=$VITE_SALES_WHATSAPP VITE_SALES_EMAIL=$VITE_SALES_EMAIL
RUN npm run build

# ---- 2. Build backend ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS api
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY server/package.json server/package-lock.json ./
# Skema harus ada sebelum npm ci: postinstall menjalankan `prisma generate`.
COPY server/prisma ./prisma
RUN npm ci
COPY server/tsconfig.json server/tsconfig.build.json ./
COPY server/src ./src
RUN npm run build

# ---- 3. Runtime ---------------------------------------------------------------------------------
FROM node:22-bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
COPY --from=api /app/package.json /app/package-lock.json ./
COPY --from=api /app/node_modules ./node_modules
COPY --from=api /app/prisma ./prisma
COPY --from=api /app/dist ./dist
# Build frontend: dilayani backend dari <server>/public (lihat src/common/web/web-static.ts).
COPY --from=web /web/dist ./public
EXPOSE 4000
# Menjalankan migrasi lalu server. Railway mengisi PORT; bila domain sudah dipetakan ke port tertentu,
# samakan variabel PORT dengan port itu.
CMD ["npm", "run", "start:prod"]
