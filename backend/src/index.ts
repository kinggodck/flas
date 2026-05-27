import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import { execSync } from 'child_process';
import factoriesRouter from './routes/factories';
import projectsRouter from './routes/projects';
import assignmentsRouter from './routes/assignments';
import loadRouter from './routes/load';
import ganttRouter from './routes/gantt';
import dashboardRouter from './routes/dashboard';
import { errorHandler } from './middleware/errorHandler';
import { autoSync, syncFactories } from './services/sheetsSync';
import { syncProjectsFromSheet } from './services/projectSheetSync';

// Run prisma migrate deploy with retries (non-blocking server startup)
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

const app = express();
const PORT = process.env.PORT ?? 3001;
const isProd = process.env.NODE_ENV === 'production';

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: isProd ? false : 'http://localhost:5173' }));
app.use(morgan(isProd ? 'combined' : 'dev'));
app.use(express.json());

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use('/api/factories', factoriesRouter);
app.use('/api/projects', projectsRouter);
app.use('/api/assignments', assignmentsRouter);
app.use('/api/load', loadRouter);
app.use('/api/gantt', ganttRouter);
app.use('/api/dashboard', dashboardRouter);

// Manual sync trigger (admin)
app.post('/api/admin/sync-sheets', async (_req, res, next) => {
  try {
    const result = await syncFactories(process.env.GOOGLE_SHEETS_ID);
    res.json({ ok: true, ...result });
  } catch (e) {
    next(e);
  }
});

// Project data sync from Google Sheets
app.post('/api/admin/sync-projects', async (_req, res, next) => {
  try {
    const sheetsId = process.env.GOOGLE_PROJECT_SHEETS_ID;
    if (!sheetsId) {
      res.status(400).json({ error: 'GOOGLE_PROJECT_SHEETS_ID 환경변수가 설정되지 않았습니다.' });
      return;
    }
    const result = await syncProjectsFromSheet(sheetsId);
    res.json({ ok: result.source === 'sheets', ...result });
  } catch (e) {
    next(e);
  }
});

// Serve frontend in production
if (isProd) {
  const frontendDist = path.join(__dirname, '../../frontend/dist');
  app.use(express.static(frontendDist));
  app.get('*', (_req, res) => res.sendFile(path.join(frontendDist, 'index.html')));
} else {
  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
}

app.use(errorHandler);

app.listen(PORT, async () => {
  console.log(`FLAS API server running on http://localhost:${PORT}`);
  await runMigrations();
  await autoSync();
});
