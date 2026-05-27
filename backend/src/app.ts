import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import factoriesRouter from './routes/factories';
import projectsRouter from './routes/projects';
import assignmentsRouter from './routes/assignments';
import loadRouter from './routes/load';
import ganttRouter from './routes/gantt';
import dashboardRouter from './routes/dashboard';
import { errorHandler } from './middleware/errorHandler';
import { syncFactories } from './services/sheetsSync';
import { syncProjectsFromSheet, upsertProjectRows } from './services/projectSheetSync';
import type { ProjectRow } from './services/projectSheetSync';

const app = express();
const isProd = process.env.NODE_ENV === 'production';

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: isProd ? false : 'http://localhost:5173' }));
app.use(morgan(isProd ? 'combined' : 'dev'));
app.use(express.json({ limit: '10mb' }));

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use('/api/factories', factoriesRouter);
app.use('/api/projects', projectsRouter);
app.use('/api/assignments', assignmentsRouter);
app.use('/api/load', loadRouter);
app.use('/api/gantt', ganttRouter);
app.use('/api/dashboard', dashboardRouter);

app.post('/api/admin/sync-sheets', async (_req, res, next) => {
  try {
    const result = await syncFactories(process.env.GOOGLE_SHEETS_ID);
    res.json({ ok: true, ...result });
  } catch (e) { next(e); }
});

// Apps Script push endpoint — receives pre-parsed rows from Google Sheets
app.post('/api/admin/push-projects', async (req, res, next) => {
  try {
    const { rows } = req.body as { rows: ProjectRow[] };
    if (!Array.isArray(rows)) {
      res.status(400).json({ error: 'rows 배열이 필요합니다.' });
      return;
    }
    const result = await upsertProjectRows(rows);
    res.json({ ok: true, ...result });
  } catch (e) { next(e); }
});

app.post('/api/admin/sync-projects', async (_req, res, next) => {
  try {
    const sheetsId = process.env.GOOGLE_PROJECT_SHEETS_ID;
    if (!sheetsId) {
      res.status(400).json({ error: 'GOOGLE_PROJECT_SHEETS_ID 환경변수가 설정되지 않았습니다.' });
      return;
    }
    const result = await syncProjectsFromSheet(sheetsId);
    res.json({ ok: result.source === 'sheets', ...result });
  } catch (e) { next(e); }
});

// Serve frontend in non-Vercel production (Railway / Docker)
if (isProd && !process.env.VERCEL) {
  const frontendDist = path.join(__dirname, '../../frontend/dist');
  app.use(express.static(frontendDist));
  app.get('*', (_req, res) => res.sendFile(path.join(frontendDist, 'index.html')));
} else if (!isProd) {
  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
}

app.use(errorHandler);

export default app;
