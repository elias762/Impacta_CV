import Link from "next/link";
import {
  getStaffingDashboard,
  relativeKickoff,
  shortSeniority,
  SENIORITY_DASHBOARD_ORDER,
} from "@/lib/dashboard";

export const dynamic = "force-dynamic";

export default function DashboardPage() {
  const data = getStaffingDashboard();
  const { kpis, openSeats, benchSorted, benchAllCount, today } = data;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Staffing dashboard</h1>
        <p className="text-sm text-slate-600">
          What needs staffing · who is free · how loaded the firm is over the next four weeks.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <KpiOpenSeats
          total={kpis.totalOpenSeats}
          projects={kpis.openProjectCount}
          bySeniority={kpis.openBySeniority}
        />
        <KpiBench freeNow={kpis.freeThisWeek} under60={kpis.under60} />
        <KpiUtilization pct={kpis.avgUtil4w} over={kpis.overAllocated} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <OpenSeatsPanel list={openSeats} today={today} />
        <BenchPanel list={benchSorted} totalRows={benchAllCount} />
      </div>
    </div>
  );
}

// --- KPIs ---------------------------------------------------------------

function KpiOpenSeats({
  total,
  projects,
  bySeniority,
}: {
  total: number;
  projects: number;
  bySeniority: Map<string, number>;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <SectLabel>Open seats</SectLabel>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-3xl font-semibold tracking-tight text-amber-700">{total}</span>
        <span className="text-xs text-slate-500">
          across {projects} project{projects === 1 ? "" : "s"}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-1">
        {SENIORITY_DASHBOARD_ORDER.filter((s) => bySeniority.has(s)).map((s) => (
          <Tag key={s} tone="slate">
            {bySeniority.get(s)}× {shortSeniority(s)}
          </Tag>
        ))}
        {total === 0 && <span className="text-xs text-slate-400">All seats filled</span>}
      </div>
    </div>
  );
}

function KpiBench({ freeNow, under60 }: { freeNow: number; under60: number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <SectLabel>Available capacity</SectLabel>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-3xl font-semibold tracking-tight text-emerald-700">{freeNow}</span>
        <span className="text-xs text-slate-500">free this week</span>
      </div>
      <div className="mt-3 text-xs text-slate-500">
        <span className="font-medium text-slate-700">{under60}</span> consultants under 60% over the next 4 weeks
      </div>
    </div>
  );
}

function KpiUtilization({ pct, over }: { pct: number; over: number }) {
  const tone =
    pct < 50
      ? "text-slate-700"
      : pct < 80
      ? "text-emerald-700"
      : pct < 100
      ? "text-amber-700"
      : "text-rose-700";
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <SectLabel>Firm utilization</SectLabel>
      <div className="mt-2 flex items-baseline gap-2">
        <span className={`text-3xl font-semibold tracking-tight ${tone}`}>{pct}%</span>
        <span className="text-xs text-slate-500">avg next 4 weeks</span>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div className="bg-impacta h-full" style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <div
        className={`mt-2 text-[11px] ${over > 0 ? "text-rose-700" : "text-slate-500"}`}
      >
        {over > 0
          ? `${over} consultant${over === 1 ? "" : "s"} over-allocated`
          : "No over-allocations"}
      </div>
    </div>
  );
}

// --- Panels --------------------------------------------------------------

function OpenSeatsPanel({
  list,
  today,
}: {
  list: ReturnType<typeof getStaffingDashboard>["openSeats"];
  today: string;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
        <SectTitle>Open seats — sorted by kickoff</SectTitle>
        <Tag tone={list.length > 0 ? "amber" : "emerald"}>
          {list.length} project{list.length === 1 ? "" : "s"}
        </Tag>
      </div>
      {list.length === 0 ? (
        <div className="px-6 py-10 text-center text-sm text-slate-500">Every slot is staffed.</div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {list.slice(0, 6).map((entry) => {
            const pct =
              entry.fill.total === 0 ? 0 : Math.round((entry.fill.filled / entry.fill.total) * 100);
            const k = relativeKickoff(today, entry.project.start_date);
            return (
              <li key={entry.project.id} className="px-6 py-4">
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={`/projects/${entry.project.id}`}
                      className="hover:text-impacta block truncate text-sm font-medium text-slate-900 hover:underline"
                    >
                      {entry.project.name}
                    </Link>
                    <div className="truncate text-[11px] text-slate-500">
                      {entry.project.client ?? "—"} · {entry.project.sector ?? "—"}
                    </div>
                  </div>
                  <Tag tone={k.tone}>{k.label}</Tag>
                </div>
                <div className="mb-2 flex flex-wrap gap-1">
                  {SENIORITY_DASHBOARD_ORDER.filter((s) => entry.seniorityCount.has(s)).map((s) => (
                    <Tag key={s} tone="indigo">
                      {entry.seniorityCount.get(s)}× {shortSeniority(s)}
                    </Tag>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div className="bg-impacta h-full" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="shrink-0 font-mono text-[10px] text-slate-500">
                    {entry.fill.filled}/{entry.fill.total}
                  </span>
                </div>
              </li>
            );
          })}
          {list.length > 6 && (
            <li className="px-6 py-3 text-[11px] text-slate-500">
              + {list.length - 6} more on the{" "}
              <Link href="/projects" className="text-impacta hover:underline">
                Projects
              </Link>{" "}
              page
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

function BenchPanel({
  list,
  totalRows,
}: {
  list: ReturnType<typeof getStaffingDashboard>["benchSorted"];
  totalRows: number;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
        <SectTitle>Available capacity — least loaded first</SectTitle>
        <Tag tone={list.length > 0 ? "emerald" : "rose"}>
          {list.length} of {totalRows}
        </Tag>
      </div>
      {list.length === 0 ? (
        <div className="px-6 py-10 text-center text-sm text-slate-500">
          No consultants under 60% over the next four weeks. Firm is hot.
        </div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {list.slice(0, 7).map((b) => {
            const utilTone =
              b.avgNext4 === 0 || b.avgNext4 < 30 ? "text-emerald-700" : "text-amber-700";
            const free =
              b.longestFree > 0
                ? `${b.longestFree} week${b.longestFree === 1 ? "" : "s"} free${
                    b.freeFromLabel ? ` from ${b.freeFromLabel}` : ""
                  }`
                : "fragmented availability";
            return (
              <li key={b.consultant_id} className="flex items-center gap-3 px-6 py-3">
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-indigo-100 font-mono text-[10px] font-medium text-indigo-700">
                  {initialsOf(b.consultant_name)}
                </div>
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/consultants/${b.consultant_id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-impacta block truncate text-sm font-medium text-slate-900 hover:underline"
                  >
                    {b.consultant_name}
                  </Link>
                  <div className="truncate text-[11px] text-slate-500">
                    {b.seniority ?? "—"} · {b.sector ?? "—"}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className={`font-mono text-[11px] font-medium ${utilTone}`}>
                    {b.avgNext4}% next 4w
                  </div>
                  <div className="text-[10px] text-slate-500">{free}</div>
                </div>
              </li>
            );
          })}
          {list.length > 7 && (
            <li className="px-6 py-3 text-[11px] text-slate-500">
              + {list.length - 7} more on the{" "}
              <Link href="/capacity" className="text-impacta hover:underline">
                Capacity
              </Link>{" "}
              page
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

// --- small primitives ---------------------------------------------------

function SectLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">{children}</div>
  );
}

function SectTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">{children}</h3>
  );
}

function Tag({
  tone,
  children,
}: {
  tone: "slate" | "indigo" | "emerald" | "amber" | "rose";
  children: React.ReactNode;
}) {
  const tones: Record<string, string> = {
    slate: "bg-slate-100 text-slate-700 border-slate-200",
    indigo: "bg-indigo-50 text-indigo-700 border-indigo-200",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
    amber: "bg-amber-50 text-amber-800 border-amber-200",
    rose: "bg-rose-50 text-rose-700 border-rose-200",
  };
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}
