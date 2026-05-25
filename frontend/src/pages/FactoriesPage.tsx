import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getFactories,
  createFactory,
  updateFactory,
  deleteFactory,
  createZone,
  updateZone,
  deleteZone,
} from '../api/client';
import type { Factory, Zone } from '../api/client';

function LoadBadge({ pct }: { pct: number }) {
  if (pct === 0) return null;
  const color = pct > 100 ? 'bg-red-100 text-red-700' : pct > 80 ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700';
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${color}`}>{pct.toFixed(0)}%</span>;
}

interface ZoneRowProps {
  zone: Zone;
  onEdit: (z: Zone) => void;
  onDelete: (id: number) => void;
}

function ZoneRow({ zone, onEdit, onDelete }: ZoneRowProps) {
  return (
    <tr className="hover:bg-gray-50 text-sm">
      <td className="pl-8 py-2 text-gray-500">┗</td>
      <td className="py-2 font-medium">{zone.name}</td>
      <td className="py-2 text-right pr-4">{zone.availableAreaSqm.toLocaleString()} ㎡</td>
      <td className="py-2">{zone.usageType ?? '—'}</td>
      <td className="py-2 text-gray-400">{zone.dimensions ?? '—'}</td>
      <td className="py-2">
        <span className={`text-xs px-2 py-0.5 rounded-full ${zone.isActive ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
          {zone.isActive ? '활성' : '비활성'}
        </span>
      </td>
      <td className="py-2 text-right pr-4">
        <button onClick={() => onEdit(zone)} className="text-blue-500 hover:underline mr-3 text-xs">편집</button>
        <button onClick={() => onDelete(zone.id)} className="text-red-400 hover:underline text-xs">삭제</button>
      </td>
    </tr>
  );
}

interface ZoneFormProps {
  factoryId: number;
  zone?: Zone;
  onClose: () => void;
}

function ZoneForm({ factoryId, zone, onClose }: ZoneFormProps) {
  const qc = useQueryClient();
  const [name, setName] = useState(zone?.name ?? '');
  const [area, setArea] = useState(String(zone?.availableAreaSqm ?? ''));
  const [type, setType] = useState(zone?.usageType ?? '');
  const [dim, setDim] = useState(zone?.dimensions ?? '');

  const createMut = useMutation({ mutationFn: () => createZone(factoryId, { name, availableAreaSqm: Number(area), usageType: type || undefined, dimensions: dim || undefined }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['factories'] }); onClose(); } });
  const updateMut = useMutation({ mutationFn: () => updateZone(zone!.id, { name, availableAreaSqm: Number(area), usageType: type || undefined, dimensions: dim || undefined }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['factories'] }); onClose(); } });

  const submit = () => zone ? updateMut.mutate() : createMut.mutate();
  const isPending = createMut.isPending || updateMut.isPending;

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-96 shadow-xl">
        <h3 className="font-semibold text-base mb-4">{zone ? '구역 편집' : '구역 추가'}</h3>
        <div className="space-y-3">
          <input className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm" placeholder="구역명 (A-1, shop A …)" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm" placeholder="가용면적 (㎡)" type="number" value={area} onChange={(e) => setArea(e.target.value)} />
          <input className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm" placeholder="용도 (조립/도장/야적…)" value={type} onChange={(e) => setType(e.target.value)} />
          <input className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm" placeholder="가로×세로 (선택)" value={dim} onChange={(e) => setDim(e.target.value)} />
        </div>
        <div className="flex gap-2 justify-end mt-4">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-md">취소</button>
          <button onClick={submit} disabled={!name || !area || isPending} className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50">
            {isPending ? '저장 중…' : '저장'}
          </button>
        </div>
      </div>
    </div>
  );
}

interface FactoryFormProps {
  factory?: Factory;
  onClose: () => void;
}

function FactoryForm({ factory, onClose }: FactoryFormProps) {
  const qc = useQueryClient();
  const [code, setCode] = useState(factory?.code ?? '');
  const [name, setName] = useState(factory?.name ?? '');
  const [total, setTotal] = useState(String(factory?.totalAreaSqm ?? ''));

  const createMut = useMutation({ mutationFn: () => createFactory({ code, name, totalAreaSqm: total ? Number(total) : undefined }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['factories'] }); onClose(); } });
  const updateMut = useMutation({ mutationFn: () => updateFactory(factory!.id, { name, totalAreaSqm: total ? Number(total) : undefined }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['factories'] }); onClose(); } });

  const submit = () => factory ? updateMut.mutate() : createMut.mutate();
  const isPending = createMut.isPending || updateMut.isPending;

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-96 shadow-xl">
        <h3 className="font-semibold text-base mb-4">{factory ? '공장 편집' : '공장 추가'}</h3>
        <div className="space-y-3">
          <input disabled={!!factory} className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm disabled:bg-gray-50" placeholder="공장 코드 (이진, 처용…)" value={code} onChange={(e) => setCode(e.target.value)} />
          <input className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm" placeholder="공장명" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm" placeholder="총 면적 (㎡, 선택)" type="number" value={total} onChange={(e) => setTotal(e.target.value)} />
        </div>
        <div className="flex gap-2 justify-end mt-4">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-md">취소</button>
          <button onClick={submit} disabled={!code || !name || isPending} className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50">
            {isPending ? '저장 중…' : '저장'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function FactoriesPage() {
  const qc = useQueryClient();
  const { data: factories = [], isLoading } = useQuery({ queryKey: ['factories'], queryFn: getFactories });
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [factoryForm, setFactoryForm] = useState<{ open: boolean; factory?: Factory }>({ open: false });
  const [zoneForm, setZoneForm] = useState<{ open: boolean; factoryId: number; zone?: Zone }>({ open: false, factoryId: 0 });

  const delFactory = useMutation({ mutationFn: deleteFactory, onSuccess: () => qc.invalidateQueries({ queryKey: ['factories'] }) });
  const delZone = useMutation({ mutationFn: deleteZone, onSuccess: () => qc.invalidateQueries({ queryKey: ['factories'] }) });

  const toggle = (id: number) => setExpanded((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  if (isLoading) return <p className="text-gray-400 mt-10 text-center">불러오는 중…</p>;

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-xl font-bold text-gray-800">공장·구역 관리</h1>
        <button onClick={() => setFactoryForm({ open: true })} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">
          + 공장 추가
        </button>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr className="text-xs text-gray-500 uppercase tracking-wide">
              <th className="text-left py-3 px-4 w-8"></th>
              <th className="text-left py-3 px-4">공장 / 구역</th>
              <th className="text-right py-3 px-4">가용면적</th>
              <th className="text-left py-3 px-4">용도</th>
              <th className="text-left py-3 px-4">치수</th>
              <th className="text-left py-3 px-4">상태</th>
              <th className="text-right py-3 px-4">작업</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {factories.map((f) => (
              <>
                <tr key={f.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => toggle(f.id)}>
                  <td className="py-3 px-4 text-gray-400">{expanded.has(f.id) ? '▼' : '▶'}</td>
                  <td className="py-3 px-4">
                    <span className="font-semibold text-gray-800">{f.name}</span>
                    <span className="ml-2 text-xs text-gray-400">구역 {f.zones.length}개</span>
                  </td>
                  <td className="py-3 px-4 text-right text-sm text-gray-600">
                    {f.totalAreaSqm ? `${f.totalAreaSqm.toLocaleString()} ㎡` : '—'}
                  </td>
                  <td colSpan={2} />
                  <td className="py-3 px-4" />
                  <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => setZoneForm({ open: true, factoryId: f.id })} className="text-blue-500 hover:underline text-xs mr-3">+구역</button>
                    <button onClick={() => setFactoryForm({ open: true, factory: f })} className="text-blue-500 hover:underline text-xs mr-3">편집</button>
                    <button onClick={() => { if (confirm(`${f.name}을 삭제할까요?`)) delFactory.mutate(f.id); }} className="text-red-400 hover:underline text-xs">삭제</button>
                  </td>
                </tr>
                {expanded.has(f.id) &&
                  f.zones.map((z) => (
                    <ZoneRow
                      key={z.id}
                      zone={z}
                      onEdit={(zone) => setZoneForm({ open: true, factoryId: f.id, zone })}
                      onDelete={(id) => { if (confirm('구역을 삭제할까요?')) delZone.mutate(id); }}
                    />
                  ))}
              </>
            ))}
          </tbody>
        </table>
      </div>

      {factoryForm.open && (
        <FactoryForm factory={factoryForm.factory} onClose={() => setFactoryForm({ open: false })} />
      )}
      {zoneForm.open && (
        <ZoneForm factoryId={zoneForm.factoryId} zone={zoneForm.zone} onClose={() => setZoneForm({ open: false, factoryId: 0 })} />
      )}
    </div>
  );
}
