import { getCapacityGrid } from "./capacity";
import { getProjectSlots, listProjects, projectFillStats, Project } from "./projects";

export const SENIORITY_DASHBOARD_ORDER = [
  "Partner",
  "Principal",
  "Senior Manager",
  "Manager",
  "Senior Consultant",
  "Consultant",
  "Associate",
  "Analyst",
] as const;

export interface OpenSeatEntry {
  project: Project;
  fill: { total: number; filled: number };
  daysToKickoff: number;
  seniorityCount: Map<string, number>;
}

export interface BenchEntry {
  consultant_id: number;
  consultant_name: string;
  seniority: string | null;
  sector: string | null;
  avgNext4: number;
  longestFree: number;
  freeFromLabel: string | null;
}

export interface DashboardData {
  today: string;
  openSeats: OpenSeatEntry[];
  benchSorted: BenchEntry[];
  benchAllCount: number;
  kpis: {
    totalOpenSeats: number;
    openProjectCount: number;
    openBySeniority: Map<string, number>;
    freeThisWeek: number;
    under60: number;
    avgUtil4w: number;
    overAllocated: number;
  };
}

export function daysBetween(fromIso: string, toIso: string): number {
  const a = new Date(`${fromIso}T00:00:00Z`).getTime();
  const b = new Date(`${toIso}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

export function shortSeniority(s: string): string {
  return s.replace(/^Senior /, "Sr ");
}

export type KickoffTone = "rose" | "amber" | "slate";

export function relativeKickoff(today: string, start: string): { label: string; tone: KickoffTone } {
  const d = daysBetween(today, start);
  if (d < -7) return { label: `started ${-d} days ago`, tone: "slate" };
  if (d < 0) return { label: `started ${-d}d ago`, tone: "amber" };
  if (d === 0) return { label: "starts today", tone: "rose" };
  if (d <= 7) return { label: `starts in ${d} day${d === 1 ? "" : "s"}`, tone: "rose" };
  if (d <= 21) return { label: `starts in ${d} days`, tone: "amber" };
  return { label: `starts ${start}`, tone: "slate" };
}

export async function getStaffingDashboard(): Promise<DashboardData> {
  const today = new Date().toISOString().slice(0, 10);

  const projects = await listProjects();
  const projectsWithSlots = await Promise.all(
    projects.map(async (p) => ({
      project: p,
      slots: await getProjectSlots(p.id),
      fill: await projectFillStats(p.id),
    })),
  );

  const openSeats: OpenSeatEntry[] = projectsWithSlots
    .map((p) => {
      const open = p.slots.filter((s) => !s.assignment);
      if (open.length === 0) return null;
      const seniorityCount = new Map<string, number>();
      for (const s of open) {
        seniorityCount.set(s.slot.seniority, (seniorityCount.get(s.slot.seniority) ?? 0) + 1);
      }
      return {
        project: p.project,
        fill: p.fill,
        daysToKickoff: daysBetween(today, p.project.start_date),
        seniorityCount,
      };
    })
    .filter((x): x is OpenSeatEntry => x !== null)
    .sort((x, y) => {
      const xPos = x.daysToKickoff >= 0;
      const yPos = y.daysToKickoff >= 0;
      if (xPos !== yPos) return xPos ? -1 : 1;
      return Math.abs(x.daysToKickoff) - Math.abs(y.daysToKickoff);
    });

  const totalOpenSeats = openSeats.reduce(
    (sum, p) => sum + Array.from(p.seniorityCount.values()).reduce((s, n) => s + n, 0),
    0,
  );
  const openBySeniority = new Map<string, number>();
  for (const p of openSeats) {
    for (const [sen, n] of p.seniorityCount) {
      openBySeniority.set(sen, (openBySeniority.get(sen) ?? 0) + n);
    }
  }

  const grid = await getCapacityGrid({ fromDate: today, weeks: 12 });

  let freeThisWeek = 0;
  let utilSum = 0;
  let utilCells = 0;
  let overAllocated = 0;

  const benchAll: BenchEntry[] = grid.rows.map((r) => {
    if ((r.cells[0]?.total_pct ?? 0) === 0) freeThisWeek += 1;

    const next4 = r.cells.slice(0, 4);
    let any4Over = false;
    for (const c of next4) {
      utilSum += c.total_pct;
      utilCells += 1;
      if (c.total_pct > 100) any4Over = true;
    }
    if (any4Over) overAllocated += 1;

    const avgNext4 =
      next4.length === 0 ? 0 : Math.round(next4.reduce((s, c) => s + c.total_pct, 0) / next4.length);

    let longestFree = 0;
    let cur = 0;
    let bestStart = -1;
    let curStart = -1;
    for (let i = 0; i < r.cells.length; i++) {
      if (r.cells[i]!.total_pct === 0) {
        if (cur === 0) curStart = i;
        cur += 1;
        if (cur > longestFree) {
          longestFree = cur;
          bestStart = curStart;
        }
      } else {
        cur = 0;
      }
    }

    return {
      consultant_id: r.consultant_id,
      consultant_name: r.consultant_name,
      seniority: r.seniority,
      sector: r.sector,
      avgNext4,
      longestFree,
      freeFromLabel: bestStart >= 0 ? grid.weeks[bestStart]!.short_label : null,
    };
  });

  const benchUnder60 = benchAll.filter((x) => x.avgNext4 < 60);
  const benchSorted = [...benchUnder60].sort(
    (x, y) => x.avgNext4 - y.avgNext4 || y.longestFree - x.longestFree,
  );

  const avgUtil4w = utilCells === 0 ? 0 : Math.round(utilSum / utilCells);

  return {
    today,
    openSeats,
    benchSorted,
    benchAllCount: grid.rows.length,
    kpis: {
      totalOpenSeats,
      openProjectCount: openSeats.length,
      openBySeniority,
      freeThisWeek,
      under60: benchUnder60.length,
      avgUtil4w,
      overAllocated,
    },
  };
}
