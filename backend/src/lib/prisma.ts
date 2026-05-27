import { PrismaClient } from '@prisma/client';

function buildDatabaseUrl(): string {
  const base = process.env.DATABASE_URL ?? '';
  if (!base) return base;
  const cleaned = base
    .replace(/[&?]connection_limit=\d+/g, '')
    .replace(/[&?]pool_timeout=\d+/g, '')
    .replace(/[&?]pgbouncer=[^&]*/g, '');
  const sep = cleaned.includes('?') ? '&' : '?';
  // Neon pooler requires pgbouncer=true (disables prepared statements)
  if (cleaned.includes('-pooler.')) {
    return `${cleaned}${sep}pgbouncer=true&connection_limit=5`;
  }
  return `${cleaned}${sep}connection_limit=5&pool_timeout=30`;
}

const prisma = new PrismaClient({
  datasources: { db: { url: buildDatabaseUrl() } },
});

export default prisma;
