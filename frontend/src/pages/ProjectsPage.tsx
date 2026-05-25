import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import {
  getFactories,
  getProjects,
  createProject,
  updateProject,
  deleteProject,
  createAssignment,
  deleteAssignment,
} from '../api/client';
import type { Factory, Project, Assignment, ValidationResult } from '../api/client';

// ── 부하율 배지 ─────────────────────────────────────────
function LoadBadge({ pct }: { pct: number }) {
  const color = pct > 100 ? 'bg-red-100 text-red-700' : pct > 80 ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700';
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${color}`}>{pct.toFixed(1)}%</span>;
}

// ── 충돌 경고 배너 ──────────────────────────────────────
function ConflictBanner({ v, onForce, onCancel }: { v: ValidationResult; onForce: () => void; onCancel: () => void }) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
      <p className="font-semibold text-red-700 text-sm mb-1">⚠ 면적 초과 경고</p>
      <p className="text-xs text-red-600 mb-2">
        최대 부하율 <strong>{v.maxLoadRate.toFixed(1)}%</strong> — 초과 일수 {v.conflictDays.length}일
      </p>
      <div className="flex flex-wrap gap-1 mb-3 max-h-20 overflow-y-auto">
        {v.conflictDays.slice(0, 20).map((d) => (
          <span key={d.date} className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded">{d.date}</span>
        ))}
        {v.conflictDays.length > 20 && <span className="text-xs text-red-400">+{v.conflictDays.length - 20}일</span>}
      </div>
      <div className="flex gap-2">
        <button onClick={onForce} className="px-3 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700">강제 등록</button>
        <button onClick={onCancel} className="px-3 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded">취소</button>
      </div>
    </div>
  );
}

// ── 배치 등록 폼 ────────────────────────────────────────
interface AssignmentFormProps {
  projectId: number;
  factories: Factory[];
  onClose: () => void;
}

function AssignmentForm({ projectId, factories, onClose }: AssignmentFormProps) {
  const qc = useQueryClient();
  const [factoryId, setFactoryId] = useState('');
  const [zoneId, setZoneId] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [area, setArea] = useState('');
  const [notes, setNotes] = useState('');
  const [conflict, setConflict] = useState<ValidationResult | null>(null);
  const [error, setError] = useState('');

  const selectedFactory = factories.find((f) => f.id === Number(factoryId));
  const zones = selectedFactory?.zones.filter((z) => z.isActive) ?? [];

  const submit = async (force = false) => {
    setError('');
    try {
      await createAssignment(projectId, { zoneId: Number(zoneId), startDate: start, endDate: end, requiredAreaSqm: Number(area), notes: notes || undefined, force });
      qc.invalidateQueries({ queryKey: ['projects'] });
      onClose();
    } catch (e) {
      if (axios.isAxiosError(e) && e.response?.status === 409) {
        setConflict(e.response.data.validation as ValidationResult);
      } else {
        setError('등록 실패');
      }
    }
  };

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-[480px] shadow-xl max-h-[90vh] overflow-y-auto">
        <h3 className="font-semibold text-base mb-4">면적 배치 등록</h3>

        {conflict && (
          <ConflictBanner v={conflict} onForce={() => submit(true)} onCancel={() => setConflict(null)} />
        )}

        {error && <p className="text-red-500 text-sm mb-3">{error}</p>}

        <div className="space-y-3">
          <select className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm" value={factoryId} onChange={(e) => { setFactoryId(e.target.value); setZoneId(''); }}>
            <option value="">공장 선택</option>
            {factories.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          <select className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm" value={zoneId} onChange={(e) => setZoneId(e.target.value)} disabled={!factoryId}>
            <option value="">구역 선택</option>
            {zones.map((z) => (
              <option key={z.id} value={z.id}>{z.name} ({z.availableAreaSqm.toLocaleString()}㎡)</option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">시작일</label>
              <input type="date" className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">종료일</label>
              <input type="date" className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">필요면적 (㎡)</label>
            {zoneId && (
              <p className="text-xs text-gray-400 mb-1">
                가용: {zones.find((z) => z.id === Number(zoneId))?.availableAreaSqm.toLocaleString()} ㎡
              </p>
            )}
            <input type="number" className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm" placeholder="필요 면적 입력" value={area} onChange={(e) => setArea(e.target.value)} />
          </div>
          <input className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm" placeholder="비고 (선택)" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        <div className="flex gap-2 justify-end mt-4">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-md">취소</button>
          <button
            onClick={() => submit(false)}
            disabled={!zoneId || !start || !end || !area}
            className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            등록
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 프로젝트 폼 ─────────────────────────────────────────
interface ProjectFormProps {
  project?: Project;
  onClose: () => void;
}

function ProjectForm({ project, onClose }: ProjectFormProps) {
  const qc = useQueryClient();
  const [no, setNo] = useState(project?.projectNo ?? '');
  const [client, setClient] = useState(project?.clientName ?? '');
  const [desc, setDesc] = useState(project?.description ?? '');

  const createMut = useMutation({ mutationFn: () => createProject({ projectNo: no, clientName: client || undefined, description: desc || undefined }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['projects'] }); onClose(); } });
  const updateMut = useMutation({ mutationFn: () => updateProject(project!.id, { clientName: client || undefined, description: desc || undefined }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['projects'] }); onClose(); } });

  const submit = () => project ? updateMut.mutate() : createMut.mutate();
  const isPending = createMut.isPending || updateMut.isPending;

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-96 shadow-xl">
        <h3 className="font-semibold text-base mb-4">{project ? '프로젝트 편집' : '프로젝트 등록'}</h3>
        <div className="space-y-3">
          <input disabled={!!project} className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm disabled:bg-gray-50" placeholder="프로젝트 번호" value={no} onChange={(e) => setNo(e.target.value)} />
          <input className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm" placeholder="고객사명" value={client} onChange={(e) => setClient(e.target.value)} />
          <textarea className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm" rows={2} placeholder="설명 (선택)" value={desc} onChange={(e) => setDesc(e.target.value)} />
        </div>
        <div className="flex gap-2 justify-end mt-4">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-md">취소</button>
          <button onClick={submit} disabled={!no || isPending} className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50">
            {isPending ? '저장 중…' : '저장'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 배치 목록 행 ────────────────────────────────────────
function AssignmentRow({ a, onDelete }: { a: Assignment; onDelete: () => void }) {
  const days = Math.round((new Date(a.endDate).getTime() - new Date(a.startDate).getTime()) / 86400000) + 1;
  return (
    <div className="flex items-center justify-between text-xs text-gray-600 bg-gray-50 rounded px-3 py-2 mt-1">
      <span className="font-medium text-gray-800">{a.zone.factory.name} / {a.zone.name}</span>
      <span>{a.startDate.slice(0, 10)} ~ {a.endDate.slice(0, 10)} ({days}일)</span>
      <span>{a.requiredAreaSqm.toLocaleString()} ㎡ / {a.zone.availableAreaSqm.toLocaleString()} ㎡</span>
      <LoadBadge pct={(a.requiredAreaSqm / a.zone.availableAreaSqm) * 100} />
      <button onClick={onDelete} className="text-red-400 hover:text-red-600 ml-2">✕</button>
    </div>
  );
}

// ── 메인 페이지 ─────────────────────────────────────────
export default function ProjectsPage() {
  const qc = useQueryClient();
  const { data: projects = [], isLoading } = useQuery({ queryKey: ['projects'], queryFn: getProjects });
  const { data: factories = [] } = useQuery({ queryKey: ['factories'], queryFn: getFactories });
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [projectForm, setProjectForm] = useState<{ open: boolean; project?: Project }>({ open: false });
  const [assignForm, setAssignForm] = useState<{ open: boolean; projectId: number }>({ open: false, projectId: 0 });

  const delProject = useMutation({ mutationFn: deleteProject, onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }) });
  const delAssign = useMutation({ mutationFn: deleteAssignment, onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }) });

  const toggle = (id: number) => setExpanded((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  if (isLoading) return <p className="text-gray-400 mt-10 text-center">불러오는 중…</p>;

  const statusLabel: Record<string, string> = { active: '진행중', completed: '완료', cancelled: '취소' };
  const statusColor: Record<string, string> = { active: 'bg-blue-50 text-blue-700', completed: 'bg-green-50 text-green-700', cancelled: 'bg-gray-100 text-gray-500' };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-xl font-bold text-gray-800">프로젝트 관리</h1>
        <button onClick={() => setProjectForm({ open: true })} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">
          + 프로젝트 등록
        </button>
      </div>

      {projects.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg mb-2">등록된 프로젝트가 없습니다</p>
          <p className="text-sm">+ 프로젝트 등록 버튼으로 시작하세요</p>
        </div>
      )}

      <div className="space-y-3">
        {projects.map((p) => (
          <div key={p.id} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div
              className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50"
              onClick={() => toggle(p.id)}
            >
              <div className="flex items-center gap-3">
                <span className="text-gray-400 text-sm">{expanded.has(p.id) ? '▼' : '▶'}</span>
                <span className="font-semibold text-gray-800">{p.projectNo}</span>
                {p.clientName && <span className="text-sm text-gray-500">{p.clientName}</span>}
                <span className={`text-xs px-2 py-0.5 rounded-full ${statusColor[p.status] ?? 'bg-gray-100 text-gray-500'}`}>
                  {statusLabel[p.status] ?? p.status}
                </span>
                <span className="text-xs text-gray-400">배치 {p.assignments.length}건</span>
              </div>
              <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                <button onClick={() => setAssignForm({ open: true, projectId: p.id })} className="text-blue-500 hover:underline text-xs">+배치</button>
                <button onClick={() => setProjectForm({ open: true, project: p })} className="text-blue-500 hover:underline text-xs">편집</button>
                <button onClick={() => { if (confirm(`${p.projectNo}을 삭제할까요?`)) delProject.mutate(p.id); }} className="text-red-400 hover:underline text-xs">삭제</button>
              </div>
            </div>

            {expanded.has(p.id) && (
              <div className="px-4 pb-4 border-t border-gray-100">
                {p.description && <p className="text-xs text-gray-500 mt-2 mb-2">{p.description}</p>}
                {p.assignments.length === 0 ? (
                  <p className="text-xs text-gray-400 py-3 text-center">배치 없음 — +배치 버튼으로 면적을 등록하세요</p>
                ) : (
                  p.assignments.map((a) => (
                    <AssignmentRow
                      key={a.id}
                      a={a}
                      onDelete={() => { if (confirm('배치를 삭제할까요?')) delAssign.mutate(a.id); }}
                    />
                  ))
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {projectForm.open && (
        <ProjectForm project={projectForm.project} onClose={() => setProjectForm({ open: false })} />
      )}
      {assignForm.open && (
        <AssignmentForm
          projectId={assignForm.projectId}
          factories={factories}
          onClose={() => setAssignForm({ open: false, projectId: 0 })}
        />
      )}
    </div>
  );
}
