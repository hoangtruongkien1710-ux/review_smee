# ===== Smee Review - một image dùng chung cho web và worker =====
FROM node:22-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 NPM_CONFIG_UPDATE_NOTIFIER=false

# --- cài thư viện (kể cả devDependencies để build) ---
FROM base AS deps
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci --no-audit --no-fund

# --- build Next.js ---
FROM deps AS build
COPY . .
RUN npx prisma generate && npm run build

# --- thư viện chạy thật (bỏ devDependencies) ---
FROM base AS prod-deps
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci --omit=dev --no-audit --no-fund

# --- image chạy ---
FROM base AS runner
ENV NODE_ENV=production
# Công cụ xử lý file cho worker: FFmpeg (video/audio), Poppler (PDF), ImageMagick (PSD/HEIC),
# LibreOffice (Word/Excel/PowerPoint → PDF) và font tiếng Việt / font tương thích Office.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates ffmpeg poppler-utils imagemagick \
      libreoffice-writer-nogui libreoffice-calc-nogui libreoffice-impress-nogui \
      fonts-noto-core fonts-dejavu-core fonts-crosextra-carlito fonts-crosextra-caladea \
    && rm -rf /var/lib/apt/lists/*
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/src ./src
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY package.json prisma.config.ts next.config.ts tsconfig.json ./
COPY prisma ./prisma
COPY docker/entrypoint.sh ./entrypoint.sh
RUN chmod +x entrypoint.sh && mkdir -p /data/storage
EXPOSE 3000
ENTRYPOINT ["./entrypoint.sh"]
CMD ["web"]
