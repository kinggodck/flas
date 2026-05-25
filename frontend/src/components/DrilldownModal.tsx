import { useQuery } from '@tanstack/react-query';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { getDrilldown } from '../api/client';

const ZONE_COLORS = [
  '#3b82f6', '#8b5cf6', '#ec4899', '#f97316',
  '#14b8a6', '#6366f1', '#ef4444', '#84cc16',
  '#0ea5e9', '#d97706',
];

interface Props {
  factoryId: number;
  factoryName: string;
  year: number;
  month: number;
  onClose: () => void;
}

export default function DrilldownModal({ factoryId, factoryName, year, month, onClose }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['drilldown', factoryId, year, month],
    queryFn: () => getDrilldown(factoryId, year, month),
  });

  const monthLabel = `${year}년 ${month}월`;

  // Build chart data: one row per day, columns for each zone's loadRate
  const chartData =
    data?.dailySummary.map((summary) => {
      const row: Record<string, number | string> = {
        date: summary.date.slice(5), // MM-DD
        peakLoad: summary.peakLoadRate,
      };
      data.zones.forEach((zone) => {
        const day = zone.days.find((d) => d.date === summary.date);
        row[zone.zoneName] = day ? day.loadRate : 0;
      });
      return row;
    }) ?? [];

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
          <div>
            <h3 className="font-semibold text-gray-800">{factoryName} — {monthLabel} 일별 부하 상세</h3>
            <p className="text-xs text-gray-500 mt-0.5">구역별 면적 가동률 (일 단위)</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {isLoading && <p className="text-gray-400 text-center py-12">데이터 로딩 중…</p>}

          {data && (
            <>
              {/* Chart */}
              <div className="mb-6">
                <ResponsiveContainer width="100%" height={320}>
                  <ComposedChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10 }}
                      interval={2}
                    />
                    <YAxis
                      unit="%"
                      tick={{ fontSize: 10 }}
                      domain={[0, (max: number) => Math.max(max, 110)]}
                    />
                    <Tooltip
                      formatter={(value: number, name: string) => [`${value.toFixed(1)}%`, name]}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <ReferenceLine y={100} stroke="#ef4444" strokeDasharray="4 2" label={{ value: '100%', fill: '#ef4444', fontSize: 10 }} />
                    {data.zones.map((zone, i) => (
                      <Bar
                        key={zone.zoneId}
                        dataKey={zone.zoneName}
                        stackId="load"
                        fill={ZONE_COLORS[i % ZONE_COLORS.length]}
                        opacity={0.75}
                      />
                    ))}
                    <Line
                      type="monotone"
                      dataKey="peakLoad"
                      stroke="#ef4444"
                      strokeWidth={2}
                      dot={false}
                      name="피크 부하율"
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              {/* Zone summary table */}
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-50 text-xs text-gray-500">
                    <th className="text-left px-3 py-2 border border-gray-200">구역</th>
                    <th className="text-right px-3 py-2 border border-gray-200">가용면적</th>
                    <th className="text-right px-3 py-2 border border-gray-200">최대 부하율</th>
                    <th className="text-right px-3 py-2 border border-gray-200">평균 부하율</th>
                    <th className="text-center px-3 py-2 border border-gray-200">상태</th>
                  </tr>
                </thead>
                <tbody>
                  {data.zones.map((zone, i) => {
                    const isOver = zone.maxLoadRate > 100;
                    const isWarn = !isOver && zone.maxLoadRate > 80;
                    return (
                      <tr key={zone.zoneId} className="hover:bg-gray-50">
                        <td className="px-3 py-2 border border-gray-200">
                          <span
                            className="inline-block w-2.5 h-2.5 rounded-sm mr-2"
                            style={{ backgroundColor: ZONE_COLORS[i % ZONE_COLORS.length] }}
                          />
                          {zone.zoneName}
                        </td>
                        <td className="px-3 py-2 border border-gray-200 text-right text-gray-600">
                          {zone.availableAreaSqm.toLocaleString()}㎡
                        </td>
                        <td className={`px-3 py-2 border border-gray-200 text-right font-medium ${isOver ? 'text-red-600' : isWarn ? 'text-amber-600' : 'text-green-700'}`}>
                          {zone.maxLoadRate.toFixed(1)}%
                        </td>
                        <td className="px-3 py-2 border border-gray-200 text-right text-gray-600">
                          {zone.avgLoadRate.toFixed(1)}%
                        </td>
                        <td className="px-3 py-2 border border-gray-200 text-center">
                          {isOver ? (
                            <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">초과</span>
                          ) : isWarn ? (
                            <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">주의</span>
                          ) : (
                            <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">여유</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
