FROM node:22-bookworm-slim AS builder
WORKDIR /app

# Install OpenSSL required by Prisma
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Install dependencies
COPY package.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
RUN npm install

# Copy source (schema must exist before prisma generate in build script)
COPY . .

# Build (backend script runs: prisma generate && tsc; frontend runs: tsc -b && vite build)
RUN npm run build

# ── Runtime image ──────────────────────────────────────────────
FROM node:22-bookworm-slim
WORKDIR /app

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production

# Copy built backend + prisma
COPY --from=builder /app/backend/dist ./backend/dist
COPY --from=builder /app/backend/prisma ./backend/prisma
COPY --from=builder /app/backend/package.json ./backend/package.json

# Copy built frontend
COPY --from=builder /app/frontend/dist ./frontend/dist

# Install production deps for backend (includes prisma CLI for migrate)
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 3001

CMD ["sh", "-c", "for i in 1 2 3 4 5 6 7 8 9 10; do /app/node_modules/.bin/prisma migrate deploy --schema=/app/backend/prisma/schema.prisma && break; echo \"Migration attempt $i failed, retrying in 15s...\"; sleep 15; done && node /app/backend/dist/index.js"]
