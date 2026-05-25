import type { HeatmapFactory } from '../api/client';

const MONTHS = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];

function cellStyle(maxLoadRate: number): string {
  if (maxLoadRate === 0) return 'bg-gray-50 text-gray-300';
  if (maxLoadRate > 100) return 'bg-red-200 text-red-800';
  if (maxLoadRate > 80) return 'bg-amber-100 text-amber-800';
  return 'bg-emerald-100 text-emerald-800';
}

interface Props {
  factories: HeatmapFactory[];
  onCellClick: (factoryId: number, month: number) => void;
}

export default function HeatmapMatrix({ factories, onCellClick }: Props) {
  return (
    <div className="overflow-auto">
      <table className="border-collapse text-xs w-full">
        <thead>
          <tr>
            <th className="text-left px-3 py-2 bg-gray-50 border border-gray-200 font-medium text-gray-600 min-w-28 sticky left-0 z-10">
              공장
            </th>
            {MONTHS.map((m, i) => (
              <th
                key={i}
                className="px-2 py-2 bg-gray-50 border border-gray-200 font-medium text-gray-600 text-center min-w-16"
              >
                {m}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {factories.map((factory) => (
            <tr key={factory.factoryId} className="hover:bg-gray-50/30">
              <td className="px-3 py-2 border border-gray-200 font-medium text-gray-700 bg-white sticky left-0 z-10">
                {factory.factoryName}
              </td>
              {factory.months.map((cell) => {
                const isEmpty = cell.maxLoadRate === 0;
                return (
                  <td
                    key={cell.month}
                    className={`border border-gray-200 text-center cursor-pointer transition-opacity hover:opacity-80 ${cellStyle(cell.maxLoadRate)}`}
                    onClick={() => !isEmpty && onCellClick(factory.factoryId, cell.month)}
                    title={
                      isEmpty
                        ? '데이터 없음'
                        : `최대 ${cell.maxLoadRate.toFixed(1)}% / 평균 ${cell.avgLoadRate.toFixed(1)}%`
                    }
                  >
                    <div className="px-2 py-2">
                      {isEmpty ? (
                        <span className="text-gray-300">—</span>
                      ) : (
                        <>
                          <div className="font-bold">{cell.maxLoadRate.toFixed(0)}%</div>
                          <div className="text-gray-400 text-[10px]">avg {cell.avgLoadRate.toFixed(0)}%</div>
                        </>
                      )}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
