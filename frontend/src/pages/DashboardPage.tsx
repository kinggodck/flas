import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getDashboard } from '../api/client';
import HeatmapMatrix from '../components/HeatmapMatrix';
import DrilldownModal from '../components/DrilldownModal';

const MONTH_NAMES = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];

interface Drilldown {
  factoryId: number;
  factoryName: string;
  month: number;
}

function KpiCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className={`bg-white rounded-xl border px-5 py-4 flex flex-col gap-1 ${accent ? 'border-red-300' : 'border-gray-200'}`}>
      <span className="text-xs text-gray-500">{label}</span>
      <span className={`text-2xl font-bold ${accent ? 'text-red-600' : 'text-gray-800'}`}>{value}</span>
      {sub && <span className="text-xs text-gray-400">{sub}</span>}
    </div>
  );
}

export default function DashboardPage() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [queryYear, setQueryYear] = useState(currentYear);
  const [drilldown, setDrilldown] = useState<Drilldown | null>(null);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['dashboard', queryYear],
    queryFn: () => getDashboard(queryYear),
  });

  const kpi = data?.kpi;

  return (
    <div>
      {/* Controls */}
      <div className="flex flex-wrap gap-3 items-end mb-6 print:hidden">
        <div>
          <label className="text-xs text-gray-500 mb-1 block">연도</label>
          <select
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          >
            {[currentYear - 1, currentYear, currentYear + 1].map((y) => (
              <option key={y} value={y}>{y}년</option>
            ))}
          </select>
        </div>
        <button
          onClick={() => setQueryYear(year)}
          disabled={isFetching}
          className="px-5 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {isFetching ? '조회 중…' : '조회'}
        </button>
        <button
          onClick={() => window.print()}
          className="ml-auto px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 flex items-center gap-2"
        >
          <span>🖨</span> 리포트 출력
        </button>
      </div>

      {/* Print header (only visible in print) */}
      <div className="hidden print:block mb-4">
        <h1 className="text-xl font-bold text-gray-800">FLAS 경영 대시보드 — {queryYear}년</h1>
        <p className="text-sm text-gray-500">출력일: {new Date().toLocaleDateString('ko-KR')}</p>
      </div>

      {isLoading && (
        <p className="text-gray-400 text-center py-20">데이터 로딩 중…</p>
      )}

      {data && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <KpiCard
              label="전체 평균 가동률"
              value={`${kpi!.avgLoadRate.toFixed(1)}%`}
              sub="전체 공장 구역 평균"
            />
            <KpiCard
              label="최고 부하 구역"
              value={kpi!.peakZone?.zoneName ?? '—'}
              sub={kpi!.peakZone ? `${kpi!.peakZone.factoryName} · ${MONTH_NAMES[kpi!.peakZone.month - 1]}` : undefined}
            />
            <KpiCard
              label="피크 부하율"
              value={kpi!.peakZone ? `${kpi!.peakZone.maxLoadRate.toFixed(1)}%` : '—'}
              sub="최고 부하율 기록"
              accent={!!kpi!.peakZone && kpi!.peakZone.maxLoadRate > 100}
            />
            <KpiCard
              label="위험 일수"
              value={`${kpi!.riskDays.toLocaleString()}일`}
              sub="100% 초과 구역·일 합계"
              accent={kpi!.riskDays > 0}
            />
          </div>

          {/* Heatmap */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-4">
            <div className="px-5 py-3 border-b border-gray-100">
              <h2 className="font-semibold text-gray-700 text-sm">{queryYear}년 공장별 월간 면적 가동률</h2>
              <p className="text-xs text-gray-400 mt-0.5">셀 클릭 → 일별 드릴다운 (색상: 최대 부하율 기준)</p>
            </div>
            <div className="p-4">
              <HeatmapMatrix
                factories={data.heatmap}
                onCellClick={(factoryId, month) => {
                  const factory = data.heatmap.find((f) => f.factoryId === factoryId);
                  if (factory) setDrilldown({ factoryId, factoryName: factory.factoryName, month });
                }}
              />
            </div>
          </div>

          {/* Legend */}
          <div className="flex gap-4 text-xs text-gray-500">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-emerald-100 inline-block border border-emerald-300" /> 여유 (&lt;80%)
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-amber-100 inline-block border border-amber-300" /> 주의 (80~100%)
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-red-200 inline-block border border-red-300" /> 초과 (&gt;100%)
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-gray-100 inline-block border border-gray-200" /> 데이터 없음
            </div>
          </div>
        </>
      )}

      {/* Drilldown modal */}
      {drilldown && (
        <DrilldownModal
          factoryId={drilldown.factoryId}
          factoryName={drilldown.factoryName}
          year={queryYear}
          month={drilldown.month}
          onClose={() => setDrilldown(null)}
        />
      )}
    </div>
  );
}
