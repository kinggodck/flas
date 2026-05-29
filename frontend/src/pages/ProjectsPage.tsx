import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import {
  getFactories, getProjects, createProject, deleteProject,
  createAssignment, deleteAssignment, createProjectItem, deleteProjectItem,
  syncProjectsSheet,
} from '../api/client';
import type { Factory, Project, ProjectItem, ValidationResult, ProjectSyncResult } from '../api/client';

const BU_OPTIONS = ['플랜트 BU', '방산 BU', '중공업 BU', '기타'];

function calcArea(w: number, h: number, qty: number, mr: number) {
  return w * h * qty * (1 + mr / 100);
}

function LoadBadge({ pct }: { pct: number }) {
  const cls = pct > 100 ? 'bg-red-100 text-red-700' : pct > 80 ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700';
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cls}`}>{pct.toFixed(1)}%</span>;
}

function ConflictBanner({ v, onForce, onCancel }: { v: ValidationResult; onForce: () => void; onCancel: () => void }) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
      <p className="font-semibold text-red-700 text-sm mb-1">⚠ 면적 초과 경고</p>
      <p className="text-xs text-red-600 mb-2">최대 부하율 <strong>{v.maxLoadRate.toFixed(1)}%</strong> — 초과 일수 {v.conflictDays.length}일</p>
      <div className="flex flex-wrap gap-1 mb-3 max-h-20 overflow-y-auto">
        {v.conflictDays.slice(0, 20).map(d => <span key={d.date} className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded">{d.date}</span>)}
        {v.conflictDays.length > 20 && <span className="text-xs text-red-400">+{v.conflictDays.length - 20}일</span>}
      </div>
      <div className="flex gap-2">
        <button onClick={onForce} className="px-3 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700">강제 등록</button>
        <button onClick={onCancel} className="px-3 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded">취소</button>
      </div>
    </div>
  );
}

// ── 배치 등록 폼 ───────────────────────────────────────────────────
function AssignmentForm({ projectId, factories, onClose }: { projectId: number; factories: Factory[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [factoryId, setFactoryId] = useState('');
  const [zoneId, setZoneId] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [marginRate, setMarginRate] = useState('0');
  const [notes, setNotes] = useState('');
  // 2구간
  const [use2Phase, setUse2Phase] = useState(false);
  const [p2Start, setP2Start] = useState('');
  const [p2End, setP2End] = useState('');
  const [p2Width, setP2Width] = useState('');
  const [p2Height, setP2Height] = useState('');
  const [p2Qty, setP2Qty] = useState('1');

  const [conflict, setConflict] = useState<ValidationResult | null>(null);
  const [error, setError] = useState('');

  const selectedFactory = factories.find(f => f.id === Number(factoryId));
  const zones = selectedFactory?.zones.filter(z => z.isActive) ?? [];
  const selectedZone = zones.find(z => z.id === Number(zoneId));
  const w = Number(width), h = Number(height), qty = Number(quantity), mr = Number(marginRate);
  const computedArea = w && h ? calcArea(w, h, qty, mr) : 0;
  const p2W = Number(p2Width), p2H = Number(p2Height), p2Q = Number(p2Qty);
  const computedArea2 = p2W && p2H ? calcArea(p2W, p2H, p2Q, mr) : 0;

  const submit = async (force = false) => {
    if (!computedArea || !zoneId || !start || !end) return;
    setError('');
    try {
      await createAssignment(projectId, {
        zoneId: Number(zoneId), startDate: start, endDate: end,
        widthM: w, heightM: h, quantity: qty, marginRate: mr,
        notes: notes || undefined, force: force || undefined,
        ...(use2Phase && p2Width && p2Height && p2Start && p2End ? {
          phase2Start: p2Start, phase2End: p2End, phase2Width: p2W, phase2Height: p2H, phase2Quantity: p2Q,
        } : {}),
      });
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
      <div className="bg-white rounded-lg p-6 w-[540px] shadow-xl max-h-[90vh] overflow-y-auto">
        <h3 className="font-semibold text-base mb-4">면적 배치 등록</h3>
        {conflict && <ConflictBanner v={conflict} onForce={() => submit(true)} onCancel={() => setConflict(null)} />}
        {error && <p className="text-red-500 text-sm mb-3">{error}</p>}

        <div className="space-y-3">
          <select className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm" value={factoryId} onChange={e => { setFactoryId(e.target.value); setZoneId(''); }}>
            <option value="">공장 선택</option>
            {factories.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          <select className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm" value={zoneId} onChange={e => setZoneId(e.target.value)} disabled={!factoryId}>
            <option value="">구역 선택</option>
            {zones.map(z => <option key={z.id} value={z.id}>{z.name} ({z.availableAreaSqm.toLocaleString()}㎡)</option>)}
          </select>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs text-gray-500 mb-1 block">시작일</label>
              <input type="date" className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm" value={start} onChange={e => setStart(e.target.value)} />
            </div>
            <div><label className="text-xs text-gray-500 mb-1 block">종료일</label>
              <input type="date" className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm" value={end} onChange={e => setEnd(e.target.value)} />
            </div>
          </div>

          {/* 가로 × 세로 × 수량 × 여유율 */}
          <div className="bg-gray-50 rounded-lg p-3 space-y-2">
            <label className="text-xs font-medium text-gray-600 block">아이템 면적 계산 (1구간)</label>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <label className="text-xs text-gray-400">가로 (m)</label>
                <input type="number" min="0" step="0.1" className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm" placeholder="12.0" value={width} onChange={e => setWidth(e.target.value)} />
              </div>
              <span className="text-gray-400 mt-4">×</span>
              <div className="flex-1">
                <label className="text-xs text-gray-400">세로 (m)</label>
                <input type="number" min="0" step="0.1" className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm" placeholder="10.0" value={height} onChange={e => setHeight(e.target.value)} />
              </div>
              <span className="text-gray-400 mt-4">×</span>
              <div className="w-16">
                <label className="text-xs text-gray-400">수량</label>
                <input type="number" min="1" className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm" value={quantity} onChange={e => setQuantity(e.target.value)} />
              </div>
              <div className="w-20">
                <label className="text-xs text-gray-400">여유율(%)</label>
                <input type="number" min="0" max="100" className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm" value={marginRate} onChange={e => setMarginRate(e.target.value)} />
              </div>
            </div>
            {computedArea > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">총 점유면적 = {w}×{h}×{qty}×(1+{mr}%) =</span>
                <span className="font-bold text-blue-600">{computedArea.toFixed(1)}㎡</span>
              </div>
            )}
            {selectedZone && computedArea > 0 && (
              <div className="text-xs text-gray-400">
                가용 {selectedZone.availableAreaSqm.toLocaleString()}㎡ 중{' '}
                <span className={computedArea > selectedZone.availableAreaSqm ? 'text-red-600 font-medium' : 'text-green-600 font-medium'}>
                  {((computedArea / selectedZone.availableAreaSqm) * 100).toFixed(1)}% 점유
                </span>
              </div>
            )}
          </div>

          {/* 2구간 토글 */}
          <div>
            <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
              <input type="checkbox" checked={use2Phase} onChange={e => setUse2Phase(e.target.checked)} className="rounded" />
              <span>2구간 사용 (조립 후반 면적 축소)</span>
            </label>
          </div>

          {use2Phase && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2">
              <label className="text-xs font-medium text-blue-700 block">2구간 · 조립 후반 (축소면적)</label>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="text-xs text-gray-400">시작일</label>
                  <input type="date" className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm" value={p2Start} onChange={e => setP2Start(e.target.value)} />
                </div>
                <div><label className="text-xs text-gray-400">종료일</label>
                  <input type="date" className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm" value={p2End} onChange={e => setP2End(e.target.value)} />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1"><label className="text-xs text-gray-400">가로 (m)</label>
                  <input type="number" min="0" step="0.1" className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm" value={p2Width} onChange={e => setP2Width(e.target.value)} />
                </div>
                <span className="text-gray-400 mt-4">×</span>
                <div className="flex-1"><label className="text-xs text-gray-400">세로 (m)</label>
                  <input type="number" min="0" step="0.1" className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm" value={p2Height} onChange={e => setP2Height(e.target.value)} />
                </div>
                <div className="w-16"><label className="text-xs text-gray-400">수량</label>
                  <input type="number" min="1" className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm" value={p2Qty} onChange={e => setP2Qty(e.target.value)} />
                </div>
              </div>
              {computedArea2 > 0 && (
                <div className="text-sm flex justify-between">
                  <span className="text-gray-500">2구간 면적</span>
                  <span className="font-bold text-blue-600">{computedArea2.toFixed(1)}㎡</span>
                </div>
              )}
              {computedArea > 0 && computedArea2 > 0 && (
                <p className="text-xs text-blue-600">면적 {((1 - computedArea2/computedArea)*100).toFixed(0)}% 감소 (간트에서 분할 바로 표시됩니다)</p>
              )}
            </div>
          )}

          <textarea className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm resize-none" rows={2} placeholder="비고 (선택)" value={notes} onChange={e => setNotes(e.target.value)} />
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">취소</button>
          <button
            disabled={!computedArea || !zoneId || !start || !end}
            onClick={() => submit(false)}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >등록</button>
        </div>
      </div>
    </div>
  );
}

// ── 아이템 등록 폼 ─────────────────────────────────────────────────
function ItemForm({ projectId, onClose }: { projectId: number; onClose: () => void }) {
  const qc = useQueryClient();
  const [itemName, setItemName] = useState('');
  const [itemCategory, setItemCategory] = useState('');
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [marginRate, setMarginRate] = useState('0');
  const [error, setError] = useState('');

  const w = Number(width), h = Number(height), qty = Number(quantity), mr = Number(marginRate);
  const unitArea = w && h ? w * h : 0;
  const totalArea = unitArea ? calcArea(w, h, qty, mr) : 0;

  const submit = async () => {
    if (!itemName || !w || !h) return;
    setError('');
    try {
      await createProjectItem(projectId, { itemName, itemCategory: itemCategory || undefined, widthM: w, heightM: h, quantity: qty, marginRate: mr });
      qc.invalidateQueries({ queryKey: ['projects'] });
      onClose();
    } catch {
      setError('등록 실패');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-[440px] shadow-xl">
        <h3 className="font-semibold text-base mb-4">아이템 등록</h3>
        {error && <p className="text-red-500 text-sm mb-3">{error}</p>}
        <div className="space-y-3">
          <input className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm" placeholder="아이템명 (예: 대형 열교환기 A)" value={itemName} onChange={e => setItemName(e.target.value)} />
          <input className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm" placeholder="분류 (예: 열교환기, 선택)" value={itemCategory} onChange={e => setItemCategory(e.target.value)} />
          <div className="flex items-center gap-2">
            <div className="flex-1"><label className="text-xs text-gray-400">가로 (m)</label>
              <input type="number" min="0" step="0.1" className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm" value={width} onChange={e => setWidth(e.target.value)} />
            </div>
            <span className="text-gray-400 mt-4">×</span>
            <div className="flex-1"><label className="text-xs text-gray-400">세로 (m)</label>
              <input type="number" min="0" step="0.1" className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm" value={height} onChange={e => setHeight(e.target.value)} />
            </div>
            <div className="w-16"><label className="text-xs text-gray-400">수량</label>
              <input type="number" min="1" className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm" value={quantity} onChange={e => setQuantity(e.target.value)} />
            </div>
            <div className="w-20"><label className="text-xs text-gray-400">여유율(%)</label>
              <input type="number" min="0" max="100" className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm" value={marginRate} onChange={e => setMarginRate(e.target.value)} />
            </div>
          </div>
          {totalArea > 0 && (
            <div className="flex justify-between text-sm bg-blue-50 rounded-md px-3 py-2">
              <span className="text-gray-500">단위면적: {unitArea.toFixed(1)}㎡ × {qty} × (1+{mr}%)</span>
              <span className="font-bold text-blue-600">= {totalArea.toFixed(1)}㎡</span>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">취소</button>
          <button disabled={!itemName || !w || !h} onClick={submit} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">등록</button>
        </div>
      </div>
    </div>
  );
}

// ── 프로젝트 카드 ──────────────────────────────────────────────────
function ProjectCard({ project, factories }: { project: Project; factories: Factory[] }) {
  const qc = useQueryClient();
  const [showAssignForm, setShowAssignForm] = useState(false);
  const [showItemForm, setShowItemForm] = useState(false);

  const deleteMut = useMutation({ mutationFn: () => deleteProject(project.id), onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }) });
  const deleteAssignMut = useMutation({ mutationFn: (id: number) => deleteAssignment(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }) });
  const deleteItemMut = useMutation({ mutationFn: (id: number) => deleteProjectItem(project.id, id), onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }) });

  const totalArea = project.assignments.reduce((s, a) => s + a.requiredAreaSqm, 0);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-800">{project.projectNo}</span>
            {project.businessDivision && (
              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{project.businessDivision}</span>
            )}
            <span className={`text-xs px-2 py-0.5 rounded-full ${project.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{project.status}</span>
          </div>
          {project.clientName && <p className="text-sm text-gray-500 mt-0.5">{project.clientName}</p>}
          {project.description && <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{project.description}</p>}
        </div>
        <button onClick={() => { if (confirm(`프로젝트 "${project.projectNo}"을 삭제하시겠습니까?`)) deleteMut.mutate(); }} className="text-gray-300 hover:text-red-400 text-lg leading-none">×</button>
      </div>

      {/* 배치 목록 */}
      {project.assignments.length > 0 && (
        <div className="space-y-1.5 mb-3">
          {project.assignments.map(a => {
            const hasSegments = a.segments.length > 0;
            return (
              <div key={a.id} className="flex items-center gap-2 text-xs bg-gray-50 rounded-md px-3 py-1.5">
                <span className="font-medium text-gray-700">{a.zone.factory.name} / {a.zone.name}</span>
                <span className="text-gray-400">{a.startDate.slice(0, 10)} ~ {a.endDate.slice(0, 10)}</span>
                {a.widthM && a.heightM && (
                  <span className="text-gray-500">{a.widthM}×{a.heightM}m{a.quantity && a.quantity > 1 ? `×${a.quantity}` : ''}</span>
                )}
                <span className="font-medium text-blue-600">{a.requiredAreaSqm.toLocaleString()}㎡</span>
                {hasSegments && (
                  <span className="bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded text-xs">2구간</span>
                )}
                <button onClick={() => deleteAssignMut.mutate(a.id)} className="ml-auto text-gray-300 hover:text-red-400">×</button>
              </div>
            );
          })}
        </div>
      )}

      {/* 아이템 목록 */}
      {project.items.length > 0 && (
        <div className="space-y-1 mb-3 border-t border-gray-100 pt-2">
          <p className="text-xs text-gray-400 mb-1">아이템 ({project.items.length})</p>
          {project.items.map((item: ProjectItem) => (
            <div key={item.id} className="flex items-center gap-2 text-xs text-gray-600">
              <span className="font-medium">{item.itemName}</span>
              <span className="text-gray-400">{item.widthM}×{item.heightM}m × {item.quantity}</span>
              <span className="text-blue-600 font-medium">{item.totalAreaSqm.toFixed(1)}㎡</span>
              <button onClick={() => deleteItemMut.mutate(item.id)} className="ml-auto text-gray-300 hover:text-red-400">×</button>
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-2 border-t border-gray-100">
        <div className="flex items-center gap-2">
          {totalArea > 0 && <span className="text-xs text-gray-500">총 배치면적 <strong>{Math.round(totalArea).toLocaleString()}㎡</strong></span>}
          {project.assignments.length > 0 && (
            <LoadBadge pct={project.assignments[0].zone ? (project.assignments[0].requiredAreaSqm / project.assignments[0].zone.availableAreaSqm) * 100 : 0} />
          )}
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowItemForm(true)} className="text-xs px-2.5 py-1 border border-gray-200 rounded-md hover:bg-gray-50">+ 아이템</button>
          <button onClick={() => setShowAssignForm(true)} className="text-xs px-2.5 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700">+ 배치</button>
        </div>
      </div>

      {showAssignForm && <AssignmentForm projectId={project.id} factories={factories} onClose={() => setShowAssignForm(false)} />}
      {showItemForm && <ItemForm projectId={project.id} onClose={() => setShowItemForm(false)} />}
    </div>
  );
}

// ── 프로젝트 생성 폼 ───────────────────────────────────────────────
function CreateProjectForm({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [projectNo, setProjectNo] = useState('');
  const [clientName, setClientName] = useState('');
  const [businessDivision, setBusinessDivision] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');

  const submit = async () => {
    if (!projectNo) return;
    setError('');
    try {
      await createProject({ projectNo, clientName: clientName || undefined, businessDivision: businessDivision || undefined, description: description || undefined });
      qc.invalidateQueries({ queryKey: ['projects'] });
      onClose();
    } catch {
      setError('프로젝트 생성 실패 (중복 번호 확인)');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-[420px] shadow-xl">
        <h3 className="font-semibold text-base mb-4">신규 프로젝트 등록</h3>
        {error && <p className="text-red-500 text-sm mb-3">{error}</p>}
        <div className="space-y-3">
          <input className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm" placeholder="프로젝트 번호 (예: PRJ-2025-001)" value={projectNo} onChange={e => setProjectNo(e.target.value)} />
          <input className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm" placeholder="발주처 (선택)" value={clientName} onChange={e => setClientName(e.target.value)} />
          <select className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm" value={businessDivision} onChange={e => setBusinessDivision(e.target.value)}>
            <option value="">사업부문 선택 (선택)</option>
            {BU_OPTIONS.map(bu => <option key={bu} value={bu}>{bu}</option>)}
          </select>
          <textarea className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm resize-none" rows={2} placeholder="설명 (선택)" value={description} onChange={e => setDescription(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">취소</button>
          <button disabled={!projectNo} onClick={submit} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">생성</button>
        </div>
      </div>
    </div>
  );
}

// ── 동기화 결과 배너 ───────────────────────────────────────────────
function SyncResultBanner({ result, onClose }: { result: ProjectSyncResult; onClose: () => void }) {
  const isOk = result.source === 'sheets';
  return (
    <div className={`rounded-lg p-4 mb-4 border ${isOk ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
      <div className="flex justify-between items-start">
        <div>
          <p className={`font-semibold text-sm ${isOk ? 'text-green-700' : 'text-red-700'}`}>
            {isOk ? '✓ Google Sheets 동기화 완료' : '✗ 동기화 실패'}
          </p>
          {isOk ? (
            <p className="text-xs text-green-600 mt-1">
              프로젝트 {result.projectsUpserted}건 · 배치 {result.assignmentsUpserted}건 처리
              {result.skipped > 0 && ` · 스킵 ${result.skipped}건`}
              {result.projectsDeleted ? ` · 삭제 ${result.projectsDeleted}건` : ''}
            </p>
          ) : (
            <p className="text-xs text-red-600 mt-1">{result.error}</p>
          )}
          {result.skippedByReason && Object.keys(result.skippedByReason).length > 0 && (
            <div className="mt-2 text-xs text-gray-500">
              {Object.entries(result.skippedByReason).map(([k, v]) => <span key={k} className="mr-3">{k}: {v}건</span>)}
            </div>
          )}
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 ml-4">×</button>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────
export default function ProjectsPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [syncResult, setSyncResult] = useState<ProjectSyncResult | null>(null);
  const [search, setSearch] = useState('');
  const [buFilter, setBuFilter] = useState('');

  const { data: projects = [], isLoading } = useQuery({ queryKey: ['projects'], queryFn: getProjects });
  const { data: factories = [] } = useQuery({ queryKey: ['factories'], queryFn: getFactories });

  const syncMut = useMutation({
    mutationFn: syncProjectsSheet,
    onSuccess: result => { setSyncResult(result); qc.invalidateQueries({ queryKey: ['projects'] }); },
  });

  const allBUs = [...new Set(projects.map(p => p.businessDivision).filter(Boolean) as string[])].sort();

  const filtered = projects.filter(p => {
    const matchSearch = !search || p.projectNo.toLowerCase().includes(search.toLowerCase()) || (p.clientName ?? '').toLowerCase().includes(search.toLowerCase());
    const matchBU = !buFilter || p.businessDivision === buFilter;
    return matchSearch && matchBU;
  });

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap gap-3 items-center mb-5">
        <input
          type="text"
          placeholder="프로젝트 번호 / 발주처 검색"
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-56"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {allBUs.length > 0 && (
          <select className="border border-gray-200 rounded-lg px-3 py-2 text-sm" value={buFilter} onChange={e => setBuFilter(e.target.value)}>
            <option value="">전체 사업부문</option>
            {allBUs.map(bu => <option key={bu} value={bu}>{bu}</option>)}
          </select>
        )}
        <button onClick={() => setShowCreate(true)} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">+ 프로젝트 등록</button>
        <button
          onClick={() => syncMut.mutate()}
          disabled={syncMut.isPending}
          className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
        >
          {syncMut.isPending ? '동기화 중…' : '↻ Sheets 동기화'}
        </button>
        <span className="text-xs text-gray-400 ml-auto">총 {filtered.length}건</span>
      </div>

      {syncResult && <SyncResultBanner result={syncResult} onClose={() => setSyncResult(null)} />}

      {isLoading && <p className="text-gray-400 text-center py-20">로딩 중…</p>}

      {!isLoading && filtered.length === 0 && (
        <div className="text-center py-20 text-gray-400">
          <p className="text-lg mb-1">등록된 프로젝트가 없습니다</p>
          <p className="text-sm">Google Sheets 동기화 또는 수동 등록으로 프로젝트를 추가하세요</p>
        </div>
      )}

      <div className="grid gap-4">
        {filtered.map(p => <ProjectCard key={p.id} project={p} factories={factories} />)}
      </div>

      {showCreate && <CreateProjectForm onClose={() => setShowCreate(false)} />}
    </div>
  );
}
