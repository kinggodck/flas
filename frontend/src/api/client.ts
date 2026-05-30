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

export interface DemandSegment {
  phaseNo: number;       // 1 or 2
  startDate: string;
  endDate: string;
  widthM: number;
  heightM: number;
  quantity: number;
  marginRate: number;
  calculatedAreaSqm: number;
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
  quantity: number | null;
  marginRate: number | null;
  status: string;
  notes: string | null;
  zone: Zone & { factory: Factory };
  segments: DemandSegment[];
}

export interface ProjectItem {
  id: number;
  projectId: number;
  itemName: string;
  itemCategory: string | null;
  widthM: number;
  heightM: number;
  quantity: number;
  marginRate: number;
  unitAreaSqm: number;
  totalAreaSqm: number;
}

export interface Project {
  id: number;
  projectNo: string;
  clientName: string | null;
  description: string | null;
  businessDivision: string | null;
  status: string;
  assignments: Assignment[];
  items: ProjectItem[];
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
export const getFactories = () => api.get<Factory[]>('/factories').then(r => r.data);
export const createFactory = (data: { code: string; name: string; totalAreaSqm?: number }) =>
  api.post<Factory>('/factories', data).then(r => r.data);
export const updateFactory = (id: number, data: { name: string; totalAreaSqm?: number }) =>
  api.put<Factory>(`/factories/${id}`, data).then(r => r.data);
export const deleteFactory = (id: number) => api.delete(`/factories/${id}`);

// ── Zones ──────────────────────────────────────────────
export const createZone = (factoryId: number, data: { name: string; availableAreaSqm: number; usageType?: string; dimensions?: string }) =>
  api.post<Zone>(`/factories/${factoryId}/zones`, data).then(r => r.data);
export const updateZone = (id: number, data: { name: string; availableAreaSqm: number; usageType?: string; dimensions?: string; isActive?: boolean }) =>
  api.put<Zone>(`/factories/zones/${id}`, data).then(r => r.data);
export const deleteZone = (id: number) => api.delete(`/factories/zones/${id}`);

// ── Projects ───────────────────────────────────────────
export const getProjects = () => api.get<Project[]>('/projects').then(r => r.data);
export const createProject = (data: { projectNo: string; clientName?: string; description?: string; businessDivision?: string }) =>
  api.post<Project>('/projects', data).then(r => r.data);
export const updateProject = (id: number, data: { clientName?: string; description?: string; status?: string; businessDivision?: string }) =>
  api.put<Project>(`/projects/${id}`, data).then(r => r.data);
export const deleteProject = (id: number) => api.delete(`/projects/${id}`);

// ── Project Items ──────────────────────────────────────
export const getProjectItems = (projectId: number) =>
  api.get<ProjectItem[]>(`/projects/${projectId}/items`).then(r => r.data);
export const createProjectItem = (
  projectId: number,
  data: { itemName: string; itemCategory?: string; widthM: number; heightM: number; quantity?: number; marginRate?: number },
) => api.post<ProjectItem>(`/projects/${projectId}/items`, data).then(r => r.data);
export const updateProjectItem = (
  projectId: number,
  itemId: number,
  data: { itemName: string; itemCategory?: string; widthM: number; heightM: number; quantity?: number; marginRate?: number },
) => api.put<ProjectItem>(`/projects/${projectId}/items/${itemId}`, data).then(r => r.data);
export const deleteProjectItem = (projectId: number, itemId: number) =>
  api.delete(`/projects/${projectId}/items/${itemId}`);

// ── Assignments ────────────────────────────────────────
export const createAssignment = (
  projectId: number,
  data: {
    zoneId: number; startDate: string; endDate: string;
    widthM: number; heightM: number; quantity?: number; marginRate?: number;
    notes?: string; force?: boolean;
    phase2Start?: string; phase2End?: string; phase2Width?: number; phase2Height?: number; phase2Quantity?: number;
  },
) =>
  api.post<{ assignment: Assignment; validation: ValidationResult }>(`/projects/${projectId}/assignments`, data)
     .then(r => r.data);

export const deleteAssignment = (id: number) => api.delete(`/assignments/${id}`);

export const updateAssignment = (
  id: number,
  data: { zoneId?: number; startDate?: string; endDate?: string; widthM?: number; heightM?: number; quantity?: number; marginRate?: number; status?: string; notes?: string; force?: boolean },
) =>
  api.put<{ assignment: Assignment; validation: ValidationResult }>(`/assignments/${id}`, data).then(r => r.data);

// ── Gantt ──────────────────────────────────────────────
export interface GanttAssignment {
  id: number;
  projectId: number;
  projectNo: string;
  clientName: string | null;
  businessDivision: string | null;
  startDate: string;
  endDate: string;
  requiredAreaSqm: number;
  widthM: number | null;
  heightM: number | null;
  quantity: number | null;
  marginRate: number | null;
  status: string;
  notes: string | null;
  segments: DemandSegment[];
}

export interface DayLoad {
  date: string;
  occupiedArea: number;
  availableArea: number;
  loadRate: number;
}

export interface GanttZone {
  zone: { id: number; name: string; availableAreaSqm: number; usageType: string | null };
  assignments: GanttAssignment[];
  days: DayLoad[];
  maxLoadRate: number;
}

export const getGanttData = (factoryId: number, start: string, end: string, division?: string) =>
  api.get<GanttZone[]>(`/gantt/factory/${factoryId}`, { params: { start, end, division: division || undefined } }).then(r => r.data);

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
  api.post<ReplacementResult>('/load/suggest-replacement', { assignmentId }).then(r => r.data);

// ── Dashboard ──────────────────────────────────────────
export interface DashboardKpi {
  avgLoadRate: number;
  peakZone: { factoryName: string; zoneName: string; month: number; maxLoadRate: number } | null;
  riskDays: number;
  activeProjects: number;
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
  api.get<DashboardData>('/dashboard', { params: { year } }).then(r => r.data);

export const getDrilldown = (factoryId: number, year: number, month: number) =>
  api.get<DrilldownData>(`/dashboard/factory/${factoryId}/month`, { params: { year, month } }).then(r => r.data);

// ── Dashboard: 사업부문 ────────────────────────────────
export interface DivisionEntry {
  name: string;
  totalAreaSqm: number;
  percentage: number;
  projectCount: number;
  projects: { projectNo: string; clientName: string | null; totalArea: number }[];
}

export interface DivisionDashboard {
  year: number;
  grandTotal: number;
  divisions: DivisionEntry[];
  monthlyTrend: { month: number; buBreakdown: Record<string, number> }[];
}

export const getDivisionDashboard = (year: number) =>
  api.get<DivisionDashboard>('/dashboard/divisions', { params: { year } }).then(r => r.data);

// ── Dashboard: 아이템 ──────────────────────────────────
export interface ItemRankEntry {
  rank: number;
  id: number;
  itemName: string;
  itemCategory: string | null;
  projectNo: string;
  clientName: string | null;
  businessDivision: string | null;
  widthM: number;
  heightM: number;
  quantity: number;
  marginRate: number;
  unitAreaSqm: number;
  totalAreaSqm: number;
  zones: { factoryName: string; zoneName: string; startDate: string; endDate: string }[];
}

export interface ItemDashboard {
  year: number;
  items: ItemRankEntry[];
  total: number;
  grandTotalArea: number;
}

export const getItemDashboard = (year: number, limit?: number) =>
  api.get<ItemDashboard>('/dashboard/items', { params: { year, limit } }).then(r => r.data);

// ── Admin ──────────────────────────────────────────────
export interface ProjectSyncResult {
  ok: boolean;
  source: 'sheets' | 'error';
  projectsUpserted: number;
  assignmentsUpserted: number;
  skipped: number;
  projectsDeleted?: number;
  assignmentsDeleted?: number;
  skippedByReason?: Record<string, number>;
  skippedSamples?: Array<{ reason: string; projectCode?: string; shopName?: string; zoneName?: string; dimensions?: string }>;
  error?: string;
}

export const syncProjectsSheet = () =>
  api.post<ProjectSyncResult>('/admin/sync-projects').then(r => r.data);
