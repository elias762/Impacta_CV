import Link from "next/link";
import { CapacityBar, CapacityRow, CapacityWeek, getCapacityGrid, snapToMonday } from "@/lib/capacity";
import { SECTORS, SENIORITIES } from "@/lib/consultants";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: { from?: string; weeks?: string; seniority?: string; sector?: string };
}

const WEEK_PRESETS = [8, 12, 16, 24];

const PROJECT_PALETTE = [
  "bg-blue-100 text-blue-900 border-blue-300",
  "bg-emerald-100 text-emerald-900 border-emerald-300",
  "bg-amber-100 text-amber-900 border-amber-300",
  "bg-rose-100 text-rose-900 border-rose-300",
  "bg-violet-100 text-violet-900 border-violet-300",
  "bg-cyan-100 text-cyan-900 border-cyan-300",
  "bg-orange-100 text-orange-900 border-orange-300",
  "bg-pink-100 text-pink-900 border-pink-300",
  "bg-teal-100 text-teal-900 border-teal-300",
  "bg-indigo-100 text-indigo-900 border-indigo-300",
] as const;

function colorForProject(projectId: number): string {
  return PROJECT_PALETTE[projectId % PROJECT_PALETTE.length]!;
}

const TRACK_HEIGHT_REM = 1.75; // h-7
const WEEK_MIN_REM = 4.25;

export default async function CapacityPage({ searchParams }: PageProps) {
  const today = new Date().toISOString().slice(0, 10);
  const fromInput = searchParams.from?.trim() || today;
  let fromMonday: string;
  try {
    fromMonday = snapToMonday(fromInput);
  } catch {
    fromMonday = snapToMonday(today);
  }
  const weeksRaw = Number.parseInt(searchParams.weeks ?? "", 10);
  const weeks = Number.isFinite(weeksRaw) && weeksRaw >= 4 && weeksRaw <= 52 ? weeksRaw : 12;
  const seniority = searchParams.seniority || undefined;
  const sector = searchParams.sector || undefined;

  const grid = await getCapacityGrid({ fromDate: fromMonday, weeks, seniority, sector });
  const stats = computeStats(grid);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Capacity</h1>
        <p className="text-sm text-slate-600">
          Who is on which project, week by week. Use the filters to scan a seniority or sector,
          then look for white space when staffing a new engagement.
        </p>
      </header>

      <form className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-white p-4 md:grid-cols-[160px_180px_200px_220px_auto]">
        <div>
          <label className="block text-xs font-medium text-slate-600">Week of</label>
          <input
            type="date"
            name="from"
            defaultValue={fromMonday}
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600">Horizon</label>
          <select
            name="weeks"
            defaultValue={String(weeks)}
            className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
          >
            {WEEK_PRESETS.map((w) => (
              <option key={w} value={w}>
                {w} weeks
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600">Seniority</label>
          <select
            name="seniority"
            defaultValue={seniority ?? ""}
            className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
          >
            <option value="">All</option>
            {SENIORITIES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600">Sector</label>
          <select
            name="sector"
            defaultValue={sector ?? ""}
            className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
          >
            <option value="">All</option>
            {SECTORS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end gap-2">
          <button
            type="submit"
            className="bg-impacta hover:bg-impacta/90 rounded px-4 py-2 text-sm font-medium text-white"
          >
            Apply
          </button>
          <Link
            href="/capacity"
            className="rounded border border-slate-300 px-3 py-2 text-sm hover:bg-slate-100"
          >
            Reset
          </Link>
        </div>
      </form>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Consultants in view" value={String(grid.rows.length)} />
        <Stat label="Avg utilization" value={`${stats.avgUtil}%`} />
        <Stat label="Available now" value={`${stats.availableNow}`} sub="0% in week 1" />
        <Stat label="Over-allocated" value={`${stats.overAllocated}`} sub=">100% any week" />
      </div>

      <Timeline grid={grid} />

      <ProjectLegend rows={grid.rows} />
    </div>
  );
}

function Timeline({
  grid,
}: {
  grid: { weeks: CapacityWeek[]; rows: CapacityRow[] };
}) {
  const consultantColWidth = "16rem";
  const timelineMinWidth = `${grid.weeks.length * WEEK_MIN_REM}rem`;

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="max-h-[72vh] overflow-auto">
        {/* Header row */}
        <div
          className="sticky top-0 z-30 grid border-b border-slate-200 bg-slate-50"
          style={{ gridTemplateColumns: `${consultantColWidth} minmax(${timelineMinWidth}, 1fr)` }}
        >
          <div className="sticky left-0 z-40 border-r border-slate-200 bg-slate-50 px-3 py-2 text-[11px] uppercase tracking-wide text-slate-500">
            Consultant
          </div>
          <div
            className="grid"
            style={{ gridTemplateColumns: `repeat(${grid.weeks.length}, minmax(${WEEK_MIN_REM}rem, 1fr))` }}
          >
            {grid.weeks.map((w) => (
              <div
                key={w.index}
                className="border-l border-slate-200 px-1 py-2 text-center text-[11px] text-slate-600"
                title={`${w.start} – ${w.end}`}
              >
                <div className="text-[10px] text-slate-400">{w.iso_label}</div>
                <div>{w.short_label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Rows */}
        {grid.rows.map((row) => (
          <ConsultantRow
            key={row.consultant_id}
            row={row}
            weeks={grid.weeks}
            consultantColWidth={consultantColWidth}
            timelineMinWidth={timelineMinWidth}
          />
        ))}

        {grid.rows.length === 0 && (
          <div className="px-4 py-10 text-center text-sm text-slate-500">
            No consultants match the current filters.
          </div>
        )}
      </div>
    </div>
  );
}

function ConsultantRow({
  row,
  weeks,
  consultantColWidth,
  timelineMinWidth,
}: {
  row: CapacityRow;
  weeks: CapacityWeek[];
  consultantColWidth: string;
  timelineMinWidth: string;
}) {
  const trackCount = Math.max(row.track_count, 1);
  const rowHeight = `${trackCount * TRACK_HEIGHT_REM + 0.5}rem`;

  return (
    <div
      className="grid border-b border-slate-100 hover:bg-slate-50/40"
      style={{
        gridTemplateColumns: `${consultantColWidth} minmax(${timelineMinWidth}, 1fr)`,
        minHeight: rowHeight,
      }}
    >
      <div className="sticky left-0 z-10 flex flex-col justify-center border-r border-slate-200 bg-white px-3 py-1.5">
        <Link
          href={`/consultants/${row.consultant_id}`}
          target="_blank"
          rel="noreferrer"
          className="text-impacta truncate text-sm font-medium hover:underline"
        >
          {row.consultant_name}
        </Link>
        <div className="truncate text-[10px] text-slate-500">
          {row.seniority ?? "—"} · {row.sector ?? "—"}
        </div>
      </div>

      <div
        className="relative grid p-1"
        style={{
          gridTemplateColumns: `repeat(${weeks.length}, minmax(${WEEK_MIN_REM}rem, 1fr))`,
          gridTemplateRows: `repeat(${trackCount}, ${TRACK_HEIGHT_REM}rem)`,
          gap: "2px",
        }}
      >
        {/* faint week dividers behind the bars */}
        {weeks.map((w, i) => (
          <div
            key={`bg-${w.index}`}
            aria-hidden
            className={`pointer-events-none ${i === 0 ? "" : "border-l border-slate-100"}`}
            style={{ gridColumn: `${i + 1} / span 1`, gridRow: `1 / span ${trackCount}` }}
          />
        ))}
        {row.bars.length === 0 ? (
          <div
            aria-hidden
            className="text-[10px] text-slate-300"
            style={{ gridColumn: `1 / span ${weeks.length}`, gridRow: "1" }}
          >
            <div className="flex h-full items-center pl-2">available</div>
          </div>
        ) : (
          row.bars.map((bar) => <ProjectBar key={bar.staffing_id} bar={bar} weeksCount={weeks.length} />)
        )}
      </div>
    </div>
  );
}

function ProjectBar({ bar, weeksCount }: { bar: CapacityBar; weeksCount: number }) {
  const colStart = bar.start_idx + 1;
  const colEnd = bar.end_idx + 2; // grid-column end is exclusive
  const span = bar.end_idx - bar.start_idx + 1;
  const showName = span >= 2;
  const tooltip = [
    bar.project_name,
    bar.client ? `Client: ${bar.client}` : null,
    `Allocation: ${bar.allocation_pct}%`,
    bar.clipped_left ? "(starts before window)" : null,
    bar.clipped_right || bar.end_idx === weeksCount - 1 ? "(continues past window)" : null,
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <Link
      href={`/projects/${bar.project_id}`}
      title={tooltip}
      style={{
        gridColumn: `${colStart} / ${colEnd}`,
        gridRow: `${bar.track + 1}`,
      }}
      className={`flex items-center justify-between gap-1 rounded border px-2 text-[11px] font-medium leading-none hover:opacity-90 ${colorForProject(bar.project_id)}`}
    >
      <span className="min-w-0 flex-1 truncate">
        {showName ? bar.project_name : ""}
      </span>
      <span className="flex-none whitespace-nowrap text-[10px] opacity-80">
        {bar.allocation_pct}%
      </span>
    </Link>
  );
}

function ProjectLegend({ rows }: { rows: CapacityRow[] }) {
  const seen = new Map<number, { name: string; client: string | null }>();
  for (const r of rows) {
    for (const b of r.bars) {
      if (!seen.has(b.project_id)) {
        seen.set(b.project_id, { name: b.project_name, client: b.client });
      }
    }
  }
  if (seen.size === 0) return null;
  const list = Array.from(seen.entries()).sort((a, b) => a[1].name.localeCompare(b[1].name));
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">Projects in view</div>
      <div className="mt-2 flex flex-wrap gap-2">
        {list.map(([id, p]) => (
          <Link
            key={id}
            href={`/projects/${id}`}
            className={`rounded border px-2 py-1 text-xs font-medium ${colorForProject(id)} hover:opacity-90`}
          >
            {p.name}
            {p.client ? <span className="ml-1 opacity-70">· {p.client}</span> : null}
          </Link>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-semibold text-slate-900">{value}</div>
      {sub && <div className="text-[11px] text-slate-500">{sub}</div>}
    </div>
  );
}

function computeStats(grid: { rows: CapacityRow[]; weeks: CapacityWeek[] }): {
  avgUtil: number;
  availableNow: number;
  overAllocated: number;
} {
  if (grid.rows.length === 0 || grid.weeks.length === 0) {
    return { avgUtil: 0, availableNow: 0, overAllocated: 0 };
  }
  let sum = 0;
  let count = 0;
  let availableNow = 0;
  let over = 0;
  for (const r of grid.rows) {
    let rowOver = false;
    for (const c of r.cells) {
      sum += c.total_pct;
      count += 1;
      if (c.total_pct > 100) rowOver = true;
    }
    if (rowOver) over += 1;
    if (r.cells[0] && r.cells[0].total_pct === 0) availableNow += 1;
  }
  return {
    avgUtil: count === 0 ? 0 : Math.round(sum / count),
    availableNow,
    overAllocated: over,
  };
}
