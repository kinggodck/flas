import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getFactories, getGanttData } from '../api/client';
import type { GanttAssignment, SimPreview } from '../api/client';
import GanttChart from '../components/GanttChart';
import AssignmentPopup from '../components/AssignmentPopup';
import ReplacementModal from '../components/ReplacementModal';

function todayStr() { return new Date().toISOString().slice(0, 10); }
function addMonths(dateStr: string, n: number) {
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + n);
  return d.toISOString().slice(0, 10);
}

export default function GanttPage() {
  const qc = useQueryClient();

  const [factoryId, setFactoryId] = useState('');
  const [startDate, setStartDate] = useState(todayStr());
  const [endDate, setEndDate] = useState(addMonths(todayStr(), 3));
  const [divisionFilter, setDivisionFilter] = useState('');
  const [query, setQuery] = useState<{ fid: number; start: string; end: string; division: string } | null>(null);

  const [popup, setPopup] = useState<{ a: GanttAssignment; zoneId: number; zoneName: string; x: number; y: number } | null>(null);
  const [replacement, setReplacement] = useState<{ a: GanttAssignment; zoneId: number; zoneName: string } | null>(null);
  const [simPreview, setSimPreview] = useState<SimPreview | null>(null);

  const { data: factories = [] } = useQuery({ queryKey: ['factories'], queryFn: getFactories });

  const { data: ganttData = [], isLoading, isFetching } = useQuery({
    queryKey: ['gantt', query],
    queryFn: () => getGanttData(query!.fid, query!.start, query!.end, query!.division || undefined),
    enabled: !!query,
  });

  const factoryName = factories.find(f => f.id === query?.fid)?.name ?? '';

  // 사업부문 목록 수집
  const divisions = [...new Set(ganttData.flatMap(z => z.assignments.map(a => a.businessDivision).filter(Boolean) as string[]))].sort();

  const overloadCount = ganttData.filter(z => z.maxLoadRate > 100).length;
  const warningCount = ganttData.filter(z => z.maxLoadRate > 80 && z.maxLoadRate <= 100).length;

  return (
    <div>
      {/* Controls */}
      <div className="flex flex-wrap gap-3 items-end mb-5">
        <div>
          <label className="text-xs text-gray-500 mb-1 block">공장 선택</label>
          <select className="border border-gray-200 rounded-lg px-3 py-2 text-sm min-w-36" value={factoryId} onChange={e => setFactoryId(e.target.value)}>
            <option value="">— 공장 선택 —</option>
            {factories.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">시작일</label>
          <input type="date" className="border border-gray-200 rounded-lg px-3 py-2 text-sm" value={startDate} onChange={e => setStartDate(e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">종료일</label>
          <input type="date" className="border border-gray-200 rounded-lg px-3 py-2 text-sm" value={endDate} onChange={e => setEndDate(e.target.value)} />
        </div>
        <button
          disabled={!factoryId || !startDate || !endDate}
          onClick={() => { setSimPreview(null); setQuery({ fid: Number(factoryId), start: startDate, end: endDate, division: divisionFilter }); }}
          className="px-5 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {isFetching ? '조회 중…' : '조회'}
        </button>
      </div>

      {/* 사업부문 필터 (조회 후 표시) */}
      {query && divisions.length > 0 && (
        <div className="flex gap-2 mb-4 flex-wrap">
          <span className="text-xs text-gray-500 self-center">사업부문 필터:</span>
          <button
            onClick={() => setDivisionFilter('')}
            className={`px-3 py-1 rounded-full text-xs border ${!divisionFilter ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-600 hover:border-blue-400'}`}
          >전체</button>
          {divisions.map(div => (
            <button
              key={div}
              onClick={() => { setDivisionFilter(div); setQuery(q => q ? { ...q, division: div } : null); }}
              className={`px-3 py-1 rounded-full text-xs border ${divisionFilter === div ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-600 hover:border-blue-400'}`}
            >{div}</button>
          ))}
        </div>
      )}

      {/* Summary badges */}
      {query && !isLoading && ganttData.length > 0 && (
        <div className="flex gap-3 mb-4 text-sm flex-wrap">
          <span className="font-semibold text-gray-700">{factoryName}</span>
          <span className="text-gray-400">{ganttData.length}개 구역</span>
          {overloadCount > 0 && (
            <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded-full text-xs font-medium">⚠ 초과 {overloadCount}개 구역 — 클릭하여 대체 시뮬레이션</span>
          )}
          {warningCount > 0 && (
            <span className="bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full text-xs font-medium">주의 {warningCount}개 구역</span>
          )}
          {simPreview && (
            <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-xs font-medium animate-pulse">미리보기 모드 — 모달에서 확정 또는 취소</span>
          )}
        </div>
      )}

      {!query && (
        <div className="text-center py-20 text-gray-400">
          <p className="text-lg mb-1">공장과 기간을 선택하고 조회하세요</p>
          <p className="text-sm">공장동별 면적 점유 현황을 타임라인으로 확인할 수 있습니다</p>
          <p className="text-xs mt-2 text-gray-300">2구간 조립 공간은 분할 바로 표시됩니다</p>
        </div>
      )}
      {query && isLoading && <p className="text-gray-400 text-center py-20">데이터 로딩 중…</p>}

      {query && !isLoading && ganttData.length > 0 && (
        <GanttChart
          zones={ganttData}
          start={new Date(query.start)}
          end={new Date(query.end)}
          simPreview={simPreview}
          onAssignmentClick={(a, zoneId, x, y) => {
            const zone = ganttData.find(z => z.zone.id === zoneId);
            setPopup({ a, zoneId, zoneName: zone?.zone.name ?? '', x, y });
          }}
          onZoneClick={(zoneId, zoneName) => {
            const zone = ganttData.find(z => z.zone.id === zoneId);
            if (zone && zone.assignments.length > 0) {
              setReplacement({ a: zone.assignments[0], zoneId, zoneName });
            }
          }}
        />
      )}

      {/* Legend */}
      {query && !isLoading && ganttData.length > 0 && (
        <div className="flex gap-4 mt-3 text-xs text-gray-500 flex-wrap">
          <div className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-200 inline-block" /> 여유 (&lt;80%)</div>
          <div className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-yellow-200 inline-block" /> 주의 (80~100%)</div>
          <div className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-200 inline-block" /> 초과 (&gt;100%)</div>
          <div className="flex items-center gap-1"><span className="w-px h-3 bg-red-400 inline-block" /> 오늘</div>
          <div className="flex items-center gap-1"><span className="w-3 h-3 rounded border-2 border-dashed border-blue-400 inline-block" /> 2구간 후반</div>
          <span className="text-gray-400">· 빨간 구역 행 클릭 → 대체 시뮬레이션</span>
        </div>
      )}

      {popup && (
        <AssignmentPopup
          assignment={popup.a}
          zoneName={popup.zoneName}
          x={popup.x}
          y={popup.y}
          onClose={() => setPopup(null)}
          onSuggestReplacement={a => { setPopup(null); setReplacement({ a, zoneId: popup.zoneId, zoneName: popup.zoneName }); }}
        />
      )}

      {replacement && (
        <ReplacementModal
          assignment={replacement.a}
          currentZoneId={replacement.zoneId}
          currentZoneName={replacement.zoneName}
          onClose={() => { setReplacement(null); setSimPreview(null); }}
          onSimPreview={setSimPreview}
          onConfirmed={() => { setReplacement(null); qc.invalidateQueries({ queryKey: ['gantt'] }); }}
        />
      )}
    </div>
  );
}
