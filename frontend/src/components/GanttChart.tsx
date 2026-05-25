import { useState, useRef, useEffect } from 'react';
import type { GanttZone, GanttAssignment, DayLoad } from '../api/client';

const DAY_WIDTH = 8;   // px per day
const ROW_HEIGHT = 52; // px per zone row
const LABEL_WIDTH = 160; // px for zone label column

// ── helpers ────────────────────────────────────────────────────
function dateStr(d: Date) {
  return d.toISOString().slice(0, 10);
}

function daysBetween(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

function loadColor(rate: number): string {
  if (rate > 100) return 'rgba(239,68,68,0.25)';   // red-500/25
  if (rate > 80) return 'rgba(234,179,8,0.2)';      // yellow-500/20
  return 'rgba(34,197,94,0.1)';                      // green-500/10
}

function barColor(idx: number): string {
  const palette = [
    '#3b82f6', '#8b5cf6', '#ec4899', '#f97316',
    '#14b8a6', '#6366f1', '#ef4444', '#84cc16',
  ];
  return palette[idx % palette.length];
}

// ── sub-components ─────────────────────────────────────────────
function DateHeader({ start, totalDays }: { start: Date; totalDays: number }) {
  const months: { label: string; days: number }[] = [];
  const cur = new Date(start);
  let remaining = totalDays;

  while (remaining > 0) {
    const y = cur.getFullYear(), m = cur.getMonth();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const dayOfMonth = cur.getDate();
    const daysThisMonth = Math.min(daysInMonth - dayOfMonth + 1, remaining);
    months.push({
      label: `${y}/${String(m + 1).padStart(2, '0')}`,
      days: daysThisMonth,
    });
    remaining -= daysThisMonth;
    cur.setMonth(cur.getMonth() + 1);
    cur.setDate(1);
  }

  return (
    <div className="flex" style={{ marginLeft: LABEL_WIDTH }}>
      {months.map((mo, i) => (
        <div
          key={i}
          className="border-r border-gray-200 text-xs text-gray-500 font-medium px-1 py-1 bg-gray-50 flex-shrink-0"
          style={{ width: mo.days * DAY_WIDTH }}
        >
          {mo.label}
        </div>
      ))}
    </div>
  );
}

interface AssignmentBarProps {
  a: GanttAssignment;
  startOffset: number; // days from chart start
  duration: number;    // days
  colorIdx: number;
  rowHeight: number;
  onClick: (a: GanttAssignment, x: number, y: number) => void;
  isSimPreview?: boolean;
}

function AssignmentBar({ a, startOffset, duration, colorIdx, rowHeight, onClick, isSimPreview }: AssignmentBarProps) {
  const left = startOffset * DAY_WIDTH;
  const width = Math.max(duration * DAY_WIDTH - 2, 4);
  const color = isSimPreview ? '#94a3b8' : barColor(colorIdx);
  const label = `${a.projectNo}${a.requiredAreaSqm ? ` · ${a.requiredAreaSqm.toLocaleString()}㎡` : ''}`;

  return (
    <div
      className="absolute top-1 rounded cursor-pointer select-none overflow-hidden text-white text-xs flex items-center px-1.5 transition-opacity hover:opacity-90"
      style={{
        left,
        width,
        height: rowHeight - 8,
        backgroundColor: color,
        opacity: isSimPreview ? 0.6 : 0.85,
        border: isSimPreview ? '2px dashed #64748b' : 'none',
      }}
      onClick={(e) => { e.stopPropagation(); onClick(a, e.clientX, e.clientY); }}
      title={`${a.projectNo} | ${a.clientName ?? ''} | ${a.requiredAreaSqm.toLocaleString()}㎡`}
    >
      <span className="truncate font-medium">{label}</span>
    </div>
  );
}

// ── main component ─────────────────────────────────────────────
export interface SimPreview {
  assignmentId: number;
  targetZoneId: number;
}

interface GanttChartProps {
  zones: GanttZone[];
  start: Date;
  end: Date;
  simPreview?: SimPreview | null;
  onAssignmentClick: (a: GanttAssignment, zoneId: number, x: number, y: number) => void;
  onZoneClick: (zoneId: number, zoneName: string, maxLoadRate: number) => void;
}

export default function GanttChart({
  zones,
  start,
  end,
  simPreview,
  onAssignmentClick,
  onZoneClick,
}: GanttChartProps) {
  const totalDays = daysBetween(start, end) + 1;
  const todayOffset = daysBetween(start, new Date());
  const showToday = todayOffset >= 0 && todayOffset <= totalDays;

  // build project → color index map
  const projectColorMap = new Map<number, number>();
  let colorCounter = 0;
  zones.forEach((z) =>
    z.assignments.forEach((a) => {
      if (!projectColorMap.has(a.projectId)) {
        projectColorMap.set(a.projectId, colorCounter++);
      }
    })
  );

  return (
    <div className="overflow-auto border border-gray-200 rounded-lg bg-white">
      {/* Date header */}
      <div className="sticky top-0 z-20 bg-white border-b border-gray-200">
        <DateHeader start={start} totalDays={totalDays} />
      </div>

      {/* Zone rows */}
      {zones.map((z) => {
        const isOverloaded = z.maxLoadRate > 100;
        const isWarning = !isOverloaded && z.maxLoadRate > 80;

        return (
          <div
            key={z.zone.id}
            className={`flex border-b border-gray-100 hover:bg-gray-50/50 ${isOverloaded ? 'cursor-pointer' : ''}`}
            style={{ height: ROW_HEIGHT }}
            onClick={() => isOverloaded && onZoneClick(z.zone.id, z.zone.name, z.maxLoadRate)}
          >
            {/* Zone label */}
            <div
              className={`flex-shrink-0 flex flex-col justify-center px-3 border-r border-gray-200 sticky left-0 z-10 bg-white ${isOverloaded ? 'bg-red-50' : ''}`}
              style={{ width: LABEL_WIDTH }}
            >
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-medium text-gray-800 truncate">{z.zone.name}</span>
                {isOverloaded && (
                  <span className="text-xs bg-red-500 text-white px-1 py-0.5 rounded shrink-0">초과</span>
                )}
                {isWarning && (
                  <span className="text-xs bg-yellow-400 text-white px-1 py-0.5 rounded shrink-0">주의</span>
                )}
              </div>
              <span className="text-xs text-gray-400">{z.zone.availableAreaSqm.toLocaleString()}㎡</span>
            </div>

            {/* Timeline area */}
            <div
              className="relative flex-1"
              style={{ minWidth: totalDays * DAY_WIDTH, height: ROW_HEIGHT }}
            >
              {/* Background: daily load rate heat */}
              <DayHeatmap days={z.days} start={start} />

              {/* Today line */}
              {showToday && (
                <div
                  className="absolute top-0 bottom-0 w-px bg-red-400 z-10 pointer-events-none"
                  style={{ left: todayOffset * DAY_WIDTH }}
                />
              )}

              {/* Assignment bars */}
              {z.assignments.map((a) => {
                const isPreview = simPreview?.assignmentId === a.id;
                const effectiveZoneId = isPreview ? simPreview!.targetZoneId : z.zone.id;
                // If simPreview targets THIS zone but the assignment is FROM another zone, show ghost
                const isGhost = simPreview?.targetZoneId === z.zone.id && !z.assignments.find((x) => x.id === simPreview.assignmentId);

                if (isPreview && effectiveZoneId !== z.zone.id) return null; // hide from original zone

                const aStart = new Date(a.startDate);
                const aEnd = new Date(a.endDate);
                const startOffset = Math.max(0, daysBetween(start, aStart));
                const visibleStart = aStart < start ? start : aStart;
                const visibleEnd = aEnd > end ? end : aEnd;
                const duration = daysBetween(visibleStart, visibleEnd) + 1;
                if (duration <= 0) return null;

                return (
                  <AssignmentBar
                    key={a.id}
                    a={a}
                    startOffset={startOffset}
                    duration={duration}
                    colorIdx={projectColorMap.get(a.projectId) ?? 0}
                    rowHeight={ROW_HEIGHT}
                    onClick={(assignment, x, y) => onAssignmentClick(assignment, z.zone.id, x, y)}
                    isSimPreview={isPreview}
                  />
                );
              })}

              {/* Simulation preview ghost bar in target zone */}
              {simPreview?.targetZoneId === z.zone.id && (() => {
                const srcZone = zones.find((zz) =>
                  zz.assignments.some((a) => a.id === simPreview.assignmentId)
                );
                const srcAssignment = srcZone?.assignments.find((a) => a.id === simPreview.assignmentId);
                if (!srcAssignment) return null;
                const aStart = new Date(srcAssignment.startDate);
                const aEnd = new Date(srcAssignment.endDate);
                const startOffset = Math.max(0, daysBetween(start, aStart));
                const visibleEnd = aEnd > end ? end : aEnd;
                const duration = daysBetween(aStart < start ? start : aStart, visibleEnd) + 1;
                if (duration <= 0) return null;
                return (
                  <AssignmentBar
                    key={`preview-${srcAssignment.id}`}
                    a={srcAssignment}
                    startOffset={startOffset}
                    duration={duration}
                    colorIdx={projectColorMap.get(srcAssignment.projectId) ?? 0}
                    rowHeight={ROW_HEIGHT}
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

// ── day heatmap background ─────────────────────────────────────
function DayHeatmap({ days, start }: { days: DayLoad[]; start: Date }) {
  if (days.length === 0) return null;
  // group consecutive days with same color bucket
  const segments: { left: number; width: number; color: string }[] = [];
  let i = 0;
  while (i < days.length) {
    const color = loadColor(days[i].loadRate);
    let j = i + 1;
    while (j < days.length && loadColor(days[j].loadRate) === color) j++;
    const offset = daysBetween(start, new Date(days[i].date));
    segments.push({ left: offset * DAY_WIDTH, width: (j - i) * DAY_WIDTH, color });
    i = j;
  }
  return (
    <>
      {segments.map((s, idx) => (
        <div
          key={idx}
          className="absolute top-0 bottom-0 pointer-events-none"
          style={{ left: s.left, width: s.width, backgroundColor: s.color }}
        />
      ))}
    </>
  );
}
