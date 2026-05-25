FROM node:22-bookworm-slim AS builder
WORKDIR /app

# Install dependencies
COPY package.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
RUN npm install

# Generate Prisma client before build
RUN cd backend && npx prisma generate

# Copy source and build
COPY . .
RUN npm run build

# ── Runtime image ──────────────────────────────────────────────
FROM node:22-bookworm-slim
WORKDIR /app

ENV NODE_ENV=production

# Copy built backend
COPY --from=builder /app/backend/dist ./backend/dist
COPY --from=builder /app/backend/prisma ./backend/prisma
COPY --from=builder /app/backend/package.json ./backend/package.json

# Copy built frontend
COPY --from=builder /app/frontend/dist ./frontend/dist

# Install only production deps for backend
WORKDIR /app/backend
RUN npm install --omit=dev

WORKDIR /app

EXPOSE 3001

CMD ["sh", "-c", "cd /app/backend && npx prisma migrate deploy && node dist/index.js"]
