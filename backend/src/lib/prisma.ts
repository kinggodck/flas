import { PrismaClient } from '@prisma/client';

// Build URL with explicit connection pool limit to prevent "Too many connections" on Railway
function buildDatabaseUrl(): string {
  const base = process.env.DATABASE_URL ?? '';
  if (!base) return base;
  const sep = base.includes('?') ? '&' : '?';
  // Remove any existing connection_limit before adding our own
  const cleaned = base.replace(/[&?]connection_limit=\d+/g, '').replace(/[&?]pool_timeout=\d+/g, '');
  const cleanSep = cleaned.includes('?') ? '&' : '?';
  return `${cleaned}${cleanSep}connection_limit=5&pool_timeout=30`;
}

const prisma = new PrismaClient({
  datasources: { db: { url: buildDatabaseUrl() } },
});

export default prisma;
