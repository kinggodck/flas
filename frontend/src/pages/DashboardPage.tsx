import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getDashboard, getDivisionDashboard, getItemDashboard } from '../api/client';
import HeatmapMatrix from '../components/HeatmapMatrix';
import DrilldownModal from '../components/DrilldownModal';

const MONTH_NAMES = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
const BU_COLORS = ['#3b82f6','#8b5cf6','#ec4899','#f97316','#14b8a6','#6366f1','#ef4444','#84cc16'];

interface Drilldown { factoryId: number; factoryName: string; month: number; }

function KpiCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className={`bg-white rounded-xl border px-5 py-4 flex flex-col gap-1 ${accent ? 'border-red-300' : 'border-gray-200'}`}>
      <span className="text-xs text-gray-500">{label}</span>
      <span className={`text-2xl font-bold ${accent ? 'text-red-600' : 'text-gray-800'}`}>{value}</span>
      {sub && <span className="text-xs text-gray-400">{sub}</span>}
    </div>
  );
}

// ── 사업부문 탭 ────────────────────────────────────────────────────
function DivisionsTab({ year }: { year: number }) {
  const { data, isLoading } = useQuery({ queryKey: ['divisions', year], queryFn: () => getDivisionDashboard(year) });
  const [expanded, setExpanded] = useState<string | null>(null);

  if (isLoading) return <p className="text-gray-400 text-center py-10">로딩 중…</p>;
  if (!data || data.divisions.length === 0) return <p className="text-gray-400 text-center py-10">등록된 프로젝트가 없습니다.</p>;

  const allBUs = [...new Set(data.monthlyTrend.flatMap(m => Object.keys(m.buBreakdown)))];

  return (
    <div className="space-y-5">
      {/* KPI + 파이차트 대체 테이블 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="전체 점유 면적" value={`${Math.round(data.grandTotal).toLocaleString()}㎡`} sub={`${data.divisions.length}개 사업부문`} />
        {data.divisions.slice(0, 3).map((d, i) => (
          <KpiCard key={d.name} label={d.name} value={`${d.percentage.toFixed(1)}%`} sub={`${Math.round(d.totalAreaSqm).toLocaleString()}㎡ · ${d.projectCount}건`} accent={i === 0} />
        ))}
      </div>

      {/* 사업부문 점유율 바 */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
          <h2 className="font-semibold text-gray-700 text-sm">사업부문별 면적 점유율</h2>
          <span className="text-xs text-gray-400">{year}년</span>
        </div>
        <div className="p-4 space-y-3">
          {data.divisions.map((d, i) => (
            <div key={d.name}>
              <div
                className="flex items-center gap-3 cursor-pointer hover:bg-gray-50 rounded-lg px-2 py-1.5"
                onClick={() => setExpanded(expanded === d.name ? null : d.name)}
              >
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: BU_COLORS[i % BU_COLORS.length] }} />
                <span className="text-sm font-medium text-gray-700 w-24 flex-shrink-0">{d.name}</span>
                <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${d.percentage}%`, backgroundColor: BU_COLORS[i % BU_COLORS.length] }} />
                </div>
                <span className="text-sm text-gray-600 w-14 text-right">{d.percentage.toFixed(1)}%</span>
                <span className="text-xs text-gray-400 w-24 text-right">{Math.round(d.totalAreaSqm).toLocaleString()}㎡</span>
                <span className="text-xs text-gray-300">{expanded === d.name ? '▲' : '▼'}</span>
              </div>
              {expanded === d.name && (
                <div className="ml-8 mt-1 border-l-2 pl-3 space-y-1" style={{ borderColor: BU_COLORS[i % BU_COLORS.length] }}>
                  {d.projects.map(p => (
                    <div key={p.projectNo} className="flex justify-between text-xs text-gray-500">
                      <span className="font-medium">{p.projectNo}</span>
                      <span>{p.clientName ?? '—'}</span>
                      <span>{Math.round(p.totalArea).toLocaleString()}㎡</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 월별 추이 스택 바 */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <h2 className="font-semibold text-gray-700 text-sm">월별 사업부문 점유 면적 추이</h2>
        </div>
        <div className="p-4">
          <div className="flex gap-1 items-end" style={{ height: 160 }}>
            {data.monthlyTrend.map(({ month, buBreakdown }) => {
              const total = Object.values(buBreakdown).reduce((s, v) => s + v, 0);
              const max = Math.max(...data.monthlyTrend.map(m => Object.values(m.buBreakdown).reduce((s, v) => s + v, 0)));
              return (
                <div key={month} className="flex-1 flex flex-col justify-end items-center gap-0.5">
                  <div className="w-full flex flex-col-reverse" style={{ height: max > 0 ? `${(total / max) * 120}px` : 0 }}>
                    {allBUs.map((bu, i) => (
                      buBreakdown[bu] ? (
                        <div key={bu} style={{ flex: buBreakdown[bu], backgroundColor: BU_COLORS[i % BU_COLORS.length], minHeight: 2 }} title={`${bu}: ${Math.round(buBreakdown[bu]).toLocaleString()}㎡`} />
                      ) : null
                    ))}
                  </div>
                  <span className="text-xs text-gray-400">{MONTH_NAMES[month - 1]}</span>
                </div>
              );
            })}
          </div>
          {/* 범례 */}
          <div className="flex flex-wrap gap-3 mt-3">
            {allBUs.map((bu, i) => (
              <div key={bu} className="flex items-center gap-1.5 text-xs text-gray-500">
                <div className="w-3 h-3 rounded" style={{ backgroundColor: BU_COLORS[i % BU_COLORS.length] }} />
                {bu}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 아이템 탭 ──────────────────────────────────────────────────────
function ItemsTab() {
  const { data, isLoading } = useQuery({ queryKey: ['itemDashboard'], queryFn: () => getItemDashboard(30) });
  const [detailItem, setDetailItem] = useState<number | null>(null);

  if (isLoading) return <p className="text-gray-400 text-center py-10">로딩 중…</p>;
  if (!data || data.items.length === 0) return <p className="text-gray-400 text-center py-10">등록된 아이템이 없습니다.</p>;

  const maxArea = data.items[0]?.totalAreaSqm ?? 1;
  const detail = detailItem !== null ? data.items.find(i => i.id === detailItem) : null;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="font-semibold text-gray-700 text-sm">아이템별 점유 면적 랭킹 (상위 {data.items.length}건 / 전체 {data.total}건)</h2>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500">
            <tr>
              <th className="px-4 py-2.5 text-center w-10">#</th>
              <th className="px-4 py-2.5 text-left">아이템명</th>
              <th className="px-4 py-2.5 text-left">프로젝트</th>
              <th className="px-4 py-2.5 text-left">사업부문</th>
              <th className="px-4 py-2.5 text-right">규격 (m)</th>
              <th className="px-4 py-2.5 text-right">수량</th>
              <th className="px-4 py-2.5 text-right">단위면적</th>
              <th className="px-4 py-2.5 text-right">총 점유면적</th>
              <th className="px-4 py-2.5 w-32">비중</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map(item => (
              <>
                <tr
                  key={item.id}
                  className={`border-b border-gray-100 hover:bg-gray-50 cursor-pointer ${detailItem === item.id ? 'bg-blue-50' : ''}`}
                  onClick={() => setDetailItem(detailItem === item.id ? null : item.id)}
                >
                  <td className="px-4 py-2.5 text-center text-gray-400 font-mono text-xs">{item.rank}</td>
                  <td className="px-4 py-2.5 font-medium text-gray-800">
                    {item.itemName}
                    {item.itemCategory && <span className="ml-1.5 text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{item.itemCategory}</span>}
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">{item.projectNo}<br /><span className="text-xs text-gray-400">{item.clientName}</span></td>
                  <td className="px-4 py-2.5"><span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">{item.businessDivision ?? '미분류'}</span></td>
                  <td className="px-4 py-2.5 text-right text-gray-600 font-mono text-xs">{item.widthM} × {item.heightM}</td>
                  <td className="px-4 py-2.5 text-right text-gray-600">{item.quantity}</td>
                  <td className="px-4 py-2.5 text-right text-gray-600">{item.unitAreaSqm.toFixed(1)}㎡</td>
                  <td className="px-4 py-2.5 text-right font-semibold text-gray-800">{Math.round(item.totalAreaSqm).toLocaleString()}㎡</td>
                  <td className="px-4 py-2.5">
                    <div className="bg-gray-100 rounded-full h-2 overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full" style={{ width: `${(item.totalAreaSqm / maxArea) * 100}%` }} />
                    </div>
                  </td>
                </tr>
                {detail && detail.id === item.id && detail.zones.length > 0 && (
                  <tr key={`detail-${item.id}`} className="bg-blue-50/50">
                    <td colSpan={9} className="px-8 py-2">
                      <div className="flex gap-4 flex-wrap text-xs text-gray-600">
                        <span className="font-medium text-blue-700">배치 현황:</span>
                        {detail.zones.map((z, i) => (
                          <span key={i} className="bg-white border border-blue-200 px-2 py-0.5 rounded">
                            {z.factoryName} / {z.zoneName} ({z.startDate} ~ {z.endDate})
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main DashboardPage ─────────────────────────────────────────────
export default function DashboardPage() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [queryYear, setQueryYear] = useState(currentYear);
  const [drilldown, setDrilldown] = useState<Drilldown | null>(null);
  const [activeTab, setActiveTab] = useState<'heatmap' | 'divisions' | 'items'>('heatmap');

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
          <select className="border border-gray-200 rounded-lg px-3 py-2 text-sm" value={year} onChange={e => setYear(Number(e.target.value))}>
            {[currentYear - 1, currentYear, currentYear + 1].map(y => <option key={y} value={y}>{y}년</option>)}
          </select>
        </div>
        <button onClick={() => setQueryYear(year)} disabled={isFetching} className="px-5 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">
          {isFetching ? '조회 중…' : '조회'}
        </button>
        <button onClick={() => window.print()} className="ml-auto px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">
          🖨 리포트 출력
        </button>
      </div>

      {isLoading && <p className="text-gray-400 text-center py-20">데이터 로딩 중…</p>}

      {data && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <KpiCard label="전체 평균 가동률" value={`${kpi!.avgLoadRate.toFixed(1)}%`} sub="전체 공장 구역 평균" />
            <KpiCard label="최고 부하 구역" value={kpi!.peakZone?.zoneName ?? '—'} sub={kpi!.peakZone ? `${kpi!.peakZone.factoryName} · ${MONTH_NAMES[kpi!.peakZone.month - 1]}` : undefined} />
            <KpiCard label="피크 부하율" value={kpi!.peakZone ? `${kpi!.peakZone.maxLoadRate.toFixed(1)}%` : '—'} accent={!!kpi!.peakZone && kpi!.peakZone.maxLoadRate > 100} />
            <KpiCard label="위험 일수" value={`${kpi!.riskDays.toLocaleString()}일`} sub="100% 초과 구역·일 합계" accent={kpi!.riskDays > 0} />
          </div>

          {/* Tabs */}
          <div className="flex border-b border-gray-200 mb-5 print:hidden">
            {([['heatmap','공장별 가동률'], ['divisions','사업부문별'], ['items','아이템별']] as const).map(([tab, label]) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab === tab ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
              >{label}</button>
            ))}
          </div>

          {/* Tab content */}
          {activeTab === 'heatmap' && (
            <>
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-4">
                <div className="px-5 py-3 border-b border-gray-100">
                  <h2 className="font-semibold text-gray-700 text-sm">{queryYear}년 공장별 월간 면적 가동률</h2>
                  <p className="text-xs text-gray-400 mt-0.5">셀 클릭 → 일별 드릴다운</p>
                </div>
                <div className="p-4">
                  <HeatmapMatrix
                    factories={data.heatmap}
                    onCellClick={(factoryId, month) => {
                      const factory = data.heatmap.find(f => f.factoryId === factoryId);
                      if (factory) setDrilldown({ factoryId, factoryName: factory.factoryName, month });
                    }}
                  />
                </div>
              </div>
              <div className="flex gap-4 text-xs text-gray-500">
                <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-100 inline-block border border-emerald-300" /> 여유 (&lt;80%)</div>
                <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-amber-100 inline-block border border-amber-300" /> 주의 (80~100%)</div>
                <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-200 inline-block border border-red-300" /> 초과 (&gt;100%)</div>
                <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-gray-100 inline-block border border-gray-200" /> 데이터 없음</div>
              </div>
            </>
          )}

          {activeTab === 'divisions' && <DivisionsTab year={queryYear} />}
          {activeTab === 'items' && <ItemsTab />}
        </>
      )}

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
