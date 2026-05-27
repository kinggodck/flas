import path from 'path';
import { execSync } from 'child_process';
import { autoSync } from './services/sheetsSync';
import app from './app';

const PORT = process.env.PORT ?? 3001;

async function runMigrations(): Promise<void> {
  const schemaPath = path.join(__dirname, '../../backend/prisma/schema.prisma');
  const prismaPath = path.join(__dirname, '../../../node_modules/.bin/prisma');
  for (let attempt = 1; attempt <= 10; attempt++) {
    try {
      execSync(`${prismaPath} migrate deploy --schema=${schemaPath}`, { stdio: 'inherit' });
      console.log('Migrations applied.');
      return;
    } catch {
      if (attempt < 10) {
        console.log(`Migration attempt ${attempt} failed, retrying in 10s...`);
        await new Promise((r) => setTimeout(r, 10000));
      } else {
        console.error('All migration attempts failed — starting anyway.');
      }
    }
  }
}

app.listen(PORT, async () => {
  console.log(`FLAS API server running on http://localhost:${PORT}`);
  await runMigrations();
  await autoSync();
});
