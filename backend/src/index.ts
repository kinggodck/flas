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
import { autoSync, syncFactories } from './services/sheetsSync';

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
  await autoSync();
});
