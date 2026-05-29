import type { GanttZone, GanttAssignment, DayLoad, DemandSegment, SimPreview } from '../api/client';

const DAY_WIDTH = 8;
const ROW_HEIGHT = 56;
const LABEL_WIDTH = 170;

function daysBetween(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

function loadColor(rate: number): string {
  if (rate > 100) return 'rgba(239,68,68,0.25)';
  if (rate > 80) return 'rgba(234,179,8,0.2)';
  return 'rgba(34,197,94,0.1)';
}

const PALETTE = ['#3b82f6','#8b5cf6','#ec4899','#f97316','#14b8a6','#6366f1','#ef4444','#84cc16','#0ea5e9','#a855f7'];

function barColor(idx: number): string {
  return PALETTE[idx % PALETTE.length];
}

// 2구간 2번째 구간 색 (더 어둡게)
function barColorPhase2(idx: number): string {
  const base = barColor(idx);
  return base + 'bb'; // slightly transparent to signal phase 2
}

// ── DateHeader ─────────────────────────────────────────────────────
function DateHeader({ start, totalDays }: { start: Date; totalDays: number }) {
  const months: { label: string; days: number }[] = [];
  const cur = new Date(start);
  let remaining = totalDays;
  while (remaining > 0) {
    const y = cur.getFullYear(), m = cur.getMonth();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const dayOfMonth = cur.getDate();
    const daysThisMonth = Math.min(daysInMonth - dayOfMonth + 1, remaining);
    months.push({ label: `${y}/${String(m + 1).padStart(2, '0')}`, days: daysThisMonth });
    remaining -= daysThisMonth;
    cur.setMonth(cur.getMonth() + 1);
    cur.setDate(1);
  }
  return (
    <div className="flex" style={{ marginLeft: LABEL_WIDTH }}>
      {months.map((mo, i) => (
        <div key={i} className="border-r border-gray-200 text-xs text-gray-500 font-medium px-1 py-1 bg-gray-50 flex-shrink-0" style={{ width: mo.days * DAY_WIDTH }}>
          {mo.label}
        </div>
      ))}
    </div>
  );
}

// ── AssignmentBar — 단일 구간 or 2구간 분할 ───────────────────────
interface AssignmentBarProps {
  a: GanttAssignment;
  chartStart: Date;
  chartEnd: Date;
  colorIdx: number;
  onClick: (a: GanttAssignment, x: number, y: number) => void;
  isSimPreview?: boolean;
}

function AssignmentBar({ a, chartStart, chartEnd, colorIdx, onClick, isSimPreview }: AssignmentBarProps) {
  const color = isSimPreview ? '#94a3b8' : barColor(colorIdx);
  const aStart = new Date(a.startDate);
  const aEnd = new Date(a.endDate);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClick(a, e.clientX, e.clientY);
  };

  // 세그먼트가 있으면 2구간 분할 바
  if (a.segments.length >= 2) {
    return <TwoPhaseBar a={a} chartStart={chartStart} chartEnd={chartEnd} colorIdx={colorIdx} onClick={onClick} isSimPreview={isSimPreview} />;
  }

  // 단일 바
  const startOffset = Math.max(0, daysBetween(chartStart, aStart));
  const visibleStart = aStart < chartStart ? chartStart : aStart;
  const visibleEnd = aEnd > chartEnd ? chartEnd : aEnd;
  const duration = daysBetween(visibleStart, visibleEnd) + 1;
  if (duration <= 0) return null;

  const left = startOffset * DAY_WIDTH;
  const width = Math.max(duration * DAY_WIDTH - 2, 4);
  const dimLabel = a.widthM && a.heightM ? `${a.widthM}×${a.heightM}m` : null;
  const qtyLabel = (a.quantity && a.quantity > 1) ? `×${a.quantity}` : '';
  const areaLabel = `${a.requiredAreaSqm.toLocaleString()}㎡`;
  const tooltip = `${a.projectNo}${a.clientName ? ' | ' + a.clientName : ''}${a.businessDivision ? ' [' + a.businessDivision + ']' : ''} | ${dimLabel ? dimLabel + qtyLabel + ' = ' : ''}${areaLabel}`;

  return (
    <div
      className="absolute top-1 rounded cursor-pointer select-none overflow-hidden text-white text-xs hover:opacity-90 transition-opacity"
      style={{ left, width, height: ROW_HEIGHT - 10, backgroundColor: color, opacity: isSimPreview ? 0.6 : 0.85, border: isSimPreview ? '2px dashed #64748b' : 'none' }}
      onClick={handleClick}
      title={tooltip}
    >
      <div className="px-1.5 pt-0.5 font-semibold truncate leading-tight">{a.projectNo}</div>
      {dimLabel && width > 60 && (
        <div className="px-1.5 text-white/80 truncate" style={{ fontSize: 10 }}>{dimLabel}{qtyLabel}={areaLabel}</div>
      )}
      {!dimLabel && width > 40 && (
        <div className="px-1.5 text-white/80 truncate" style={{ fontSize: 10 }}>{areaLabel}</div>
      )}
    </div>
  );
}

// ── TwoPhaseBar ────────────────────────────────────────────────────
function TwoPhaseBar({ a, chartStart, chartEnd, colorIdx, onClick, isSimPreview }: AssignmentBarProps) {
  const color1 = isSimPreview ? '#94a3b8' : barColor(colorIdx);
  const color2 = isSimPreview ? '#94a3b8' : barColorPhase2(colorIdx);

  const renderSegment = (seg: DemandSegment) => {
    const sStart = new Date(seg.startDate);
    const sEnd = new Date(seg.endDate);
    const startOffset = Math.max(0, daysBetween(chartStart, sStart));
    const visibleStart = sStart < chartStart ? chartStart : sStart;
    const visibleEnd = sEnd > chartEnd ? chartEnd : sEnd;
    const duration = daysBetween(visibleStart, visibleEnd) + 1;
    if (duration <= 0) return null;

    const left = startOffset * DAY_WIDTH;
    const width = Math.max(duration * DAY_WIDTH - 1, 4);
    const color = seg.phaseNo === 1 ? color1 : color2;
    const phaseLabel = seg.phaseNo === 1 ? '1구간' : '2구간';
    const areaLabel = `${seg.calculatedAreaSqm.toLocaleString()}㎡`;

    return (
      <div
        key={seg.phaseNo}
        className="absolute top-1 rounded cursor-pointer select-none overflow-hidden text-white text-xs hover:opacity-90 transition-opacity"
        style={{ left, width, height: ROW_HEIGHT - 10, backgroundColor: color, opacity: isSimPreview ? 0.55 : 0.85, border: isSimPreview ? '2px dashed #64748b' : seg.phaseNo === 2 ? '2px dashed rgba(255,255,255,0.5)' : 'none' }}
        onClick={(e) => { e.stopPropagation(); onClick(a, e.clientX, e.clientY); }}
        title={`${a.projectNo} [${phaseLabel}] ${seg.widthM}×${seg.heightM}m = ${areaLabel}`}
      >
        <div className="px-1.5 pt-0.5 font-semibold truncate leading-tight">{a.projectNo}</div>
        {width > 50 && (
          <div className="px-1.5 text-white/80 truncate" style={{ fontSize: 10 }}>{phaseLabel} {areaLabel}</div>
        )}
      </div>
    );
  };

  return <>{a.segments.map(renderSegment)}</>;
}

// ── DayHeatmap ─────────────────────────────────────────────────────
function DayHeatmap({ days, start }: { days: DayLoad[]; start: Date }) {
  if (days.length === 0) return null;
  const segs: { left: number; width: number; color: string }[] = [];
  let i = 0;
  while (i < days.length) {
    const color = loadColor(days[i].loadRate);
    let j = i + 1;
    while (j < days.length && loadColor(days[j].loadRate) === color) j++;
    const offset = daysBetween(start, new Date(days[i].date));
    segs.push({ left: offset * DAY_WIDTH, width: (j - i) * DAY_WIDTH, color });
    i = j;
  }
  return (
    <>
      {segs.map((s, idx) => (
        <div key={idx} className="absolute top-0 bottom-0 pointer-events-none" style={{ left: s.left, width: s.width, backgroundColor: s.color }} />
      ))}
    </>
  );
}

// ── Main GanttChart ────────────────────────────────────────────────
interface GanttChartProps {
  zones: GanttZone[];
  start: Date;
  end: Date;
  simPreview?: SimPreview | null;
  onAssignmentClick: (a: GanttAssignment, zoneId: number, x: number, y: number) => void;
  onZoneClick: (zoneId: number, zoneName: string, maxLoadRate: number) => void;
}

export default function GanttChart({ zones, start, end, simPreview, onAssignmentClick, onZoneClick }: GanttChartProps) {
  const totalDays = daysBetween(start, end) + 1;
  const todayOffset = daysBetween(start, new Date());
  const showToday = todayOffset >= 0 && todayOffset <= totalDays;

  const projectColorMap = new Map<number, number>();
  let colorCounter = 0;
  zones.forEach(z => z.assignments.forEach(a => {
    if (!projectColorMap.has(a.projectId)) projectColorMap.set(a.projectId, colorCounter++);
  }));

  return (
    <div className="overflow-auto border border-gray-200 rounded-lg bg-white">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-white border-b border-gray-200">
        <DateHeader start={start} totalDays={totalDays} />
      </div>

      {zones.map(z => {
        const isOverloaded = z.maxLoadRate > 100;
        const isWarning = !isOverloaded && z.maxLoadRate > 80;

        return (
          <div
            key={z.zone.id}
            className={`flex border-b border-gray-100 ${isOverloaded ? 'cursor-pointer hover:bg-red-50/30' : 'hover:bg-gray-50/30'}`}
            style={{ height: ROW_HEIGHT }}
            onClick={() => isOverloaded && onZoneClick(z.zone.id, z.zone.name, z.maxLoadRate)}
          >
            {/* Zone label */}
            <div
              className={`flex-shrink-0 flex flex-col justify-center px-3 border-r border-gray-200 sticky left-0 z-10 ${isOverloaded ? 'bg-red-50' : 'bg-white'}`}
              style={{ width: LABEL_WIDTH }}
            >
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-medium text-gray-800 truncate">{z.zone.name}</span>
                {isOverloaded && <span className="text-xs bg-red-500 text-white px-1 py-0.5 rounded shrink-0">초과</span>}
                {isWarning && <span className="text-xs bg-amber-400 text-white px-1 py-0.5 rounded shrink-0">주의</span>}
              </div>
              <span className="text-xs text-gray-400">{z.zone.availableAreaSqm.toLocaleString()}㎡</span>
              {z.maxLoadRate > 0 && (
                <div className="mt-0.5 h-1 bg-gray-100 rounded-full overflow-hidden" style={{ width: LABEL_WIDTH - 24 }}>
                  <div className={`h-full rounded-full ${isOverloaded ? 'bg-red-400' : isWarning ? 'bg-amber-400' : 'bg-emerald-400'}`} style={{ width: `${Math.min(z.maxLoadRate, 100)}%` }} />
                </div>
              )}
            </div>

            {/* Timeline */}
            <div className="relative flex-1" style={{ minWidth: totalDays * DAY_WIDTH, height: ROW_HEIGHT }}>
              <DayHeatmap days={z.days} start={start} />

              {showToday && (
                <div className="absolute top-0 bottom-0 w-px bg-red-400 z-10 pointer-events-none" style={{ left: todayOffset * DAY_WIDTH }} />
              )}

              {z.assignments.map(a => {
                const isPreview = simPreview?.assignmentId === a.id;
                if (isPreview && simPreview!.targetZoneId !== z.zone.id) return null;

                const aStart = new Date(a.startDate);
                const aEnd = new Date(a.endDate);
                if (aEnd < start || aStart > end) return null;

                return (
                  <AssignmentBar
                    key={a.id}
                    a={a}
                    chartStart={start}
                    chartEnd={end}
                    colorIdx={projectColorMap.get(a.projectId) ?? 0}
                    onClick={(assignment, x, y) => onAssignmentClick(assignment, z.zone.id, x, y)}
                    isSimPreview={isPreview}
                  />
                );
              })}

              {/* Simulation ghost bar in target zone */}
              {simPreview?.targetZoneId === z.zone.id && (() => {
                const srcA = zones.flatMap(zz => zz.assignments).find(a => a.id === simPreview.assignmentId);
                if (!srcA) return null;
                const aStart = new Date(srcA.startDate);
                const aEnd = new Date(srcA.endDate);
                if (aEnd < start || aStart > end) return null;
                return (
                  <AssignmentBar
                    key={`preview-${srcA.id}`}
                    a={srcA}
                    chartStart={start}
                    chartEnd={end}
                    colorIdx={projectColorMap.get(srcA.projectId) ?? 0}
                    onClick={() => {}}
                    isSimPreview
                  />
                );
              })()}
            </div>
          </div>
        );
      })}
    </div>
  );
}
