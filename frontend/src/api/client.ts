import axios from 'axios';

export const api = axios.create({ baseURL: '/api' });

// ── Types ──────────────────────────────────────────────
export interface Zone {
  id: number;
  factoryId: number;
  name: string;
  availableAreaSqm: number;
  usageType: string | null;
  dimensions: string | null;
  isActive: boolean;
}

export interface Factory {
  id: number;
  code: string;
  name: string;
  totalAreaSqm: number | null;
  zones: Zone[];
}

export interface Assignment {
  id: number;
  projectId: number;
  zoneId: number;
  startDate: string;
  endDate: string;
  requiredAreaSqm: number;
  widthM: number | null;
  heightM: number | null;
  status: string;
  notes: string | null;
  zone: Zone & { factory: Factory };
}

export interface Project {
  id: number;
  projectNo: string;
  clientName: string | null;
  description: string | null;
  status: string;
  assignments: Assignment[];
  createdAt: string;
}

export interface ConflictDay {
  date: string;
  occupiedArea: number;
  availableArea: number;
  loadRate: number;
}

export interface ValidationResult {
  hasConflict: boolean;
  maxLoadRate: number;
  conflictDays: ConflictDay[];
}

// ── Factories ──────────────────────────────────────────
export const getFactories = () => api.get<Factory[]>('/factories').then((r) => r.data);

export const createFactory = (data: { code: string; name: string; totalAreaSqm?: number }) =>
  api.post<Factory>('/factories', data).then((r) => r.data);

export const updateFactory = (id: number, data: { name: string; totalAreaSqm?: number }) =>
  api.put<Factory>(`/factories/${id}`, data).then((r) => r.data);

export const deleteFactory = (id: number) => api.delete(`/factories/${id}`);

// ── Zones ──────────────────────────────────────────────
export const createZone = (
  factoryId: number,
  data: { name: string; availableAreaSqm: number; usageType?: string; dimensions?: string }
) => api.post<Zone>(`/factories/${factoryId}/zones`, data).then((r) => r.data);

export const updateZone = (
  id: number,
  data: { name: string; availableAreaSqm: number; usageType?: string; dimensions?: string; isActive?: boolean }
) => api.put<Zone>(`/factories/zones/${id}`, data).then((r) => r.data);

export const deleteZone = (id: number) => api.delete(`/factories/zones/${id}`);

// ── Projects ───────────────────────────────────────────
export const getProjects = () => api.get<Project[]>('/projects').then((r) => r.data);

export const createProject = (data: { projectNo: string; clientName?: string; description?: string }) =>
  api.post<Project>('/projects', data).then((r) => r.data);

export const updateProject = (id: number, data: { clientName?: string; description?: string; status?: string }) =>
  api.put<Project>(`/projects/${id}`, data).then((r) => r.data);

export const deleteProject = (id: number) => api.delete(`/projects/${id}`);

// ── Assignments ────────────────────────────────────────
export const createAssignment = (
  projectId: number,
  data: { zoneId: number; startDate: string; endDate: string; requiredAreaSqm: number; widthM?: number; heightM?: number; notes?: string; force?: boolean }
) =>
  api
    .post<{ assignment: Assignment; validation: ValidationResult }>(`/projects/${projectId}/assignments`, data)
    .then((r) => r.data);

export const deleteAssignment = (id: number) => api.delete(`/assignments/${id}`);

export const updateAssignment = (
  id: number,
  data: { zoneId?: number; startDate?: string; endDate?: string; requiredAreaSqm?: number; status?: string; notes?: string; force?: boolean }
) => api.put<{ assignment: Assignment; validation: ValidationResult }>(`/assignments/${id}`, data).then((r) => r.data);

// ── Gantt ──────────────────────────────────────────────
export interface GanttAssignment {
  id: number;
  projectId: number;
  projectNo: string;
  clientName: string | null;
  startDate: string;
  endDate: string;
  requiredAreaSqm: number;
  widthM: number | null;
  heightM: number | null;
  status: string;
  notes: string | null;
}

export interface DayLoad {
  date: string;
  occupiedArea: number;
  availableArea: number;
  loadRate: number;
}

export interface GanttZone {
  zone: { id: number; name: string; availableAreaSqm: number };
  assignments: GanttAssignment[];
  days: DayLoad[];
  maxLoadRate: number;
}

export const getGanttData = (factoryId: number, start: string, end: string) =>
  api.get<GanttZone[]>(`/gantt/factory/${factoryId}`, { params: { start, end } }).then((r) => r.data);

export interface SimPreview {
  assignmentId: number;
  targetZoneId: number;
}

// ── Replacement ────────────────────────────────────────
export interface ReplacementSuggestion {
  zone: { id: number; name: string; availableAreaSqm: number };
  factory: { id: number; name: string };
  maxLoadRateIfMoved: number;
  headroomPct: number;
  hasConflict: boolean;
}

export interface ReplacementResult {
  assignment: {
    id: number; zoneId: number; zoneName: string;
    factoryId: number; factoryName: string;
    startDate: string; endDate: string; requiredAreaSqm: number;
  };
  suggestions: ReplacementSuggestion[];
}

export const suggestReplacement = (assignmentId: number) =>
  api.post<ReplacementResult>('/load/suggest-replacement', { assignmentId }).then((r) => r.data);

// ── Dashboard ──────────────────────────────────────────
export interface DashboardKpi {
  avgLoadRate: number;
  peakZone: { factoryName: string; zoneName: string; month: number; maxLoadRate: number } | null;
  riskDays: number;
}

export interface HeatmapCell {
  month: number;
  maxLoadRate: number;
  avgLoadRate: number;
}

export interface HeatmapFactory {
  factoryId: number;
  factoryName: string;
  months: HeatmapCell[];
}

export interface DashboardData {
  kpi: DashboardKpi;
  heatmap: HeatmapFactory[];
}

export interface DrilldownZone {
  zoneId: number;
  zoneName: string;
  availableAreaSqm: number;
  maxLoadRate: number;
  avgLoadRate: number;
  days: DayLoad[];
}

export interface DailySummary {
  date: string;
  avgLoadRate: number;
  peakZone: string;
  peakLoadRate: number;
}

export interface DrilldownData {
  factoryName: string;
  year: number;
  month: number;
  zones: DrilldownZone[];
  dailySummary: DailySummary[];
}

export const getDashboard = (year: number) =>
  api.get<DashboardData>('/dashboard', { params: { year } }).then((r) => r.data);

export const getDrilldown = (factoryId: number, year: number, month: number) =>
  api
    .get<DrilldownData>(`/dashboard/factory/${factoryId}/month`, { params: { year, month } })
    .then((r) => r.data);

// ── Admin ──────────────────────────────────────────────
export interface ProjectSyncResult {
  ok: boolean;
  source: 'sheets' | 'error';
  projectsUpserted: number;
  assignmentsUpserted: number;
  skipped: number;
  projectsDeleted?: number;
  assignmentsDeleted?: number;
  error?: string;
}

export const syncProjectsSheet = () =>
  api.post<ProjectSyncResult>('/admin/sync-projects').then((r) => r.data);
