import type { GanttAssignment } from '../api/client';

interface Props {
  assignment: GanttAssignment;
  zoneName: string;
  x: number;
  y: number;
  onClose: () => void;
  onSuggestReplacement: (a: GanttAssignment) => void;
}

export default function AssignmentPopup({ assignment: a, zoneName, x, y, onClose, onSuggestReplacement }: Props) {
  const days = Math.round(
    (new Date(a.endDate).getTime() - new Date(a.startDate).getTime()) / 86400000
  ) + 1;

  // keep popup within viewport
  const left = Math.min(x + 12, window.innerWidth - 280);
  const top = Math.min(y - 8, window.innerHeight - 220);

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="fixed z-50 bg-white rounded-lg shadow-xl border border-gray-200 p-4 w-64"
        style={{ left, top }}
      >
        <div className="flex justify-between items-start mb-2">
          <span className="font-semibold text-gray-800 text-sm">{a.projectNo}</span>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xs">✕</button>
        </div>
        {a.clientName && <p className="text-xs text-gray-500 mb-2">{a.clientName}</p>}
        <div className="space-y-1 text-xs text-gray-600 border-t border-gray-100 pt-2">
          <div className="flex justify-between"><span className="text-gray-400">구역</span><span>{zoneName}</span></div>
          <div className="flex justify-between"><span className="text-gray-400">기간</span><span>{a.startDate} ~ {a.endDate}</span></div>
          <div className="flex justify-between"><span className="text-gray-400">일수</span><span>{days}일</span></div>
          <div className="flex justify-between"><span className="text-gray-400">면적</span><span className="font-medium">{a.requiredAreaSqm.toLocaleString()} ㎡</span></div>
          {a.notes && <div className="flex justify-between"><span className="text-gray-400">비고</span><span className="text-right">{a.notes}</span></div>}
        </div>
        <button
          onClick={() => { onClose(); onSuggestReplacement(a); }}
          className="mt-3 w-full px-3 py-1.5 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          대체 구역 찾기
        </button>
      </div>
    </>
  );
}
