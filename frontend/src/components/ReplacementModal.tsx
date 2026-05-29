import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { suggestReplacement, updateAssignment } from '../api/client';
import type { GanttAssignment, ReplacementSuggestion, SimPreview } from '../api/client';

interface Props {
  assignment: GanttAssignment;
  currentZoneId: number;
  currentZoneName: string;
  onClose: () => void;
  onSimPreview: (preview: SimPreview | null) => void;
  onConfirmed: () => void;
}

export default function ReplacementModal({
  assignment,
  currentZoneId: _currentZoneId,
  currentZoneName,
  onClose,
  onSimPreview,
  onConfirmed,
}: Props) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<ReplacementSuggestion | null>(null);
  const [error, setError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['replacement', assignment.id],
    queryFn: () => suggestReplacement(assignment.id),
  });

  const confirmMut = useMutation({
    mutationFn: () =>
      updateAssignment(assignment.id, {
        zoneId: selected!.zone.id,
        startDate: assignment.startDate,
        endDate: assignment.endDate,
        widthM: assignment.widthM ?? undefined,
        heightM: assignment.heightM ?? undefined,
        quantity: assignment.quantity ?? undefined,
        marginRate: assignment.marginRate ?? undefined,
        force: selected!.hasConflict,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['gantt'] });
      onSimPreview(null);
      onConfirmed();
      onClose();
    },
    onError: () => setError('확정 실패. 다시 시도해주세요.'),
  });

  const selectSuggestion = (s: ReplacementSuggestion) => {
    setSelected(s);
    onSimPreview({ assignmentId: assignment.id, targetZoneId: s.zone.id });
  };

  const cancel = () => {
    onSimPreview(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-[540px] max-h-[85vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-200">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="font-semibold text-gray-800">대체 구역 시뮬레이션</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                {assignment.projectNo} · {currentZoneName} · {assignment.requiredAreaSqm.toLocaleString()}㎡
              </p>
            </div>
            <button onClick={cancel} className="text-gray-400 hover:text-gray-600">✕</button>
          </div>
          <div className="text-xs text-gray-500 mt-2 bg-gray-50 rounded px-3 py-2">
            기간: {assignment.startDate} ~ {assignment.endDate}
          </div>
        </div>

        {/* Suggestion list */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {isLoading && <p className="text-gray-400 text-sm text-center py-6">대안 탐색 중…</p>}
          {!isLoading && data?.suggestions.length === 0 && (
            <p className="text-gray-400 text-sm text-center py-6">동일 공장 내 다른 구역이 없습니다</p>
          )}
          {!isLoading && data?.suggestions.map((s) => {
            const isSelected = selected?.zone.id === s.zone.id;
            const pct = s.maxLoadRateIfMoved;
            const pctColor = pct > 100 ? 'text-red-600' : pct > 80 ? 'text-yellow-600' : 'text-green-600';
            const pctBg = pct > 100 ? 'bg-red-100' : pct > 80 ? 'bg-yellow-50' : 'bg-green-50';

            return (
              <div
                key={s.zone.id}
                className={`flex items-center justify-between px-4 py-3 mb-2 rounded-lg border cursor-pointer transition-all ${
                  isSelected
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }`}
                onClick={() => selectSuggestion(s)}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm text-gray-800">{s.zone.name}</span>
                    {s.hasConflict && (
                      <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded">초과</span>
                    )}
                    {!s.hasConflict && (
                      <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">가능</span>
                    )}
                  </div>
                  <span className="text-xs text-gray-400">{s.zone.availableAreaSqm.toLocaleString()}㎡ 가용</span>
                </div>
                <div className={`text-right ${pctBg} px-3 py-1.5 rounded-lg`}>
                  <div className={`text-base font-bold ${pctColor}`}>{pct.toFixed(1)}%</div>
                  <div className="text-xs text-gray-400">이동 후 부하</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-200 bg-gray-50">
          {selected && (
            <div className="flex items-center gap-2 text-xs text-gray-500 mb-3 bg-blue-50 rounded-lg px-3 py-2">
              <span className="text-blue-600">▶</span>
              <span>
                간트 차트에서 미리보기 중: <strong>{selected.zone.name}</strong>으로 이동
                {selected.hasConflict && <span className="text-red-500 ml-1">(초과 — 강제 확정)</span>}
              </span>
            </div>
          )}
          {error && <p className="text-red-500 text-xs mb-2">{error}</p>}
          <div className="flex gap-2 justify-end">
            <button onClick={cancel} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-200 rounded-lg">
              취소
            </button>
            <button
              onClick={() => confirmMut.mutate()}
              disabled={!selected || confirmMut.isPending}
              className={`px-4 py-2 text-sm text-white rounded-lg disabled:opacity-50 ${
                selected?.hasConflict ? 'bg-red-500 hover:bg-red-600' : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {confirmMut.isPending ? '저장 중…' : selected?.hasConflict ? '강제 확정' : '확정'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
