import { getDb } from "./db";

export interface CapacityWeek {
  index: number;
  start: string; // YYYY-MM-DD (Monday)
  end: string;   // YYYY-MM-DD (Sunday)
  iso_label: string; // e.g. "W10"
  short_label: string; // e.g. "Mar 03"
}

export interface CapacityCellProject {
  project_id: number;
  project_name: string;
  client: string | null;
  allocation_pct: number;
}

export interface CapacityCell {
  total_pct: number;
  projects: CapacityCellProject[];
}

export interface CapacityBar {
  staffing_id: number;
  project_id: number;
  project_name: string;
  client: string | null;
  allocation_pct: number;
  /** inclusive start week index in the visible window */
  start_idx: number;
  /** inclusive end week index */
  end_idx: number;
  /** vertical lane (0-based) so that overlapping projects stack rather than collide */
  track: number;
  /** true if the staffing extends earlier than the visible window */
  clipped_left: boolean;
  /** true if the staffing extends later than the visible window */
  clipped_right: boolean;
}

export interface CapacityRow {
  consultant_id: number;
  consultant_name: string;
  seniority: string | null;
  sector: string | null;
  cells: CapacityCell[];
  bars: CapacityBar[];
  track_count: number;
}

export interface CapacityGrid {
  weeks: CapacityWeek[];
  rows: CapacityRow[];
}

export interface CapacityArgs {
  fromDate: string; // any ISO date; we snap to its Monday
  weeks: number;
  seniority?: string;
  sector?: string;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function toIsoDate(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function snapToMonday(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) throw new Error(`Bad date: ${iso}`);
  const dow = d.getUTCDay(); // 0=Sun..6=Sat
  const offset = dow === 0 ? -6 : 1 - dow;
  d.setUTCDate(d.getUTCDate() + offset);
  return toIsoDate(d);
}

function isoWeekNumber(d: Date): number {
  // ISO 8601 week number
  const tmp = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  return Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function buildWeeks(fromMonday: string, count: number): CapacityWeek[] {
  const weeks: CapacityWeek[] = [];
  const d = new Date(`${fromMonday}T00:00:00Z`);
  for (let i = 0; i < count; i++) {
    const start = new Date(d);
    const end = new Date(d);
    end.setUTCDate(end.getUTCDate() + 6);
    weeks.push({
      index: i,
      start: toIsoDate(start),
      end: toIsoDate(end),
      iso_label: `W${pad(isoWeekNumber(start))}`,
      short_label: `${MONTH_SHORT[start.getUTCMonth()]} ${pad(start.getUTCDate())}`,
    });
    d.setUTCDate(d.getUTCDate() + 7);
  }
  return weeks;
}

interface OverlappingStaffing {
  staffing_id: number;
  consultant_id: number;
  start_date: string;
  end_date: string;
  allocation_pct: number;
  project_id: number;
  project_name: string;
  client: string | null;
}

export function getCapacityGrid(args: CapacityArgs): CapacityGrid {
  const fromMonday = snapToMonday(args.fromDate);
  const weeks = buildWeeks(fromMonday, args.weeks);
  const windowStart = weeks[0]!.start;
  const windowEnd = weeks[weeks.length - 1]!.end;

  const db = getDb();

  const consultantConditions: string[] = [];
  const consultantParams: Record<string, unknown> = {};
  if (args.seniority) {
    consultantConditions.push("seniority = @seniority");
    consultantParams.seniority = args.seniority;
  }
  if (args.sector) {
    consultantConditions.push("sector = @sector");
    consultantParams.sector = args.sector;
  }
  const where = consultantConditions.length ? `WHERE ${consultantConditions.join(" AND ")}` : "";
  const consultants = db
    .prepare(
      `SELECT id, name, seniority, sector FROM consultants ${where}
       ORDER BY
         CASE seniority
           WHEN 'Partner' THEN 1
           WHEN 'Principal' THEN 2
           WHEN 'Senior Manager' THEN 3
           WHEN 'Manager' THEN 4
           WHEN 'Senior Consultant' THEN 5
           WHEN 'Consultant' THEN 6
           WHEN 'Associate' THEN 7
           WHEN 'Analyst' THEN 8
           ELSE 9
         END,
         name`,
    )
    .all(consultantParams) as Array<{ id: number; name: string; seniority: string | null; sector: string | null }>;

  const overlapping = db
    .prepare(
      `SELECT s.id              AS staffing_id,
              s.consultant_id   AS consultant_id,
              s.start_date      AS start_date,
              s.end_date        AS end_date,
              s.allocation_pct  AS allocation_pct,
              p.id              AS project_id,
              p.name            AS project_name,
              p.client          AS client
         FROM staffings s
         JOIN project_slots ps ON ps.id = s.project_slot_id
         JOIN projects p       ON p.id  = ps.project_id
        WHERE s.start_date <= @windowEnd
          AND s.end_date   >= @windowStart`,
    )
    .all({ windowStart, windowEnd }) as OverlappingStaffing[];

  const byConsultant = new Map<number, OverlappingStaffing[]>();
  for (const s of overlapping) {
    const list = byConsultant.get(s.consultant_id) ?? [];
    list.push(s);
    byConsultant.set(s.consultant_id, list);
  }

  const rows: CapacityRow[] = consultants.map((c) => {
    const cells: CapacityCell[] = weeks.map(() => ({ total_pct: 0, projects: [] }));
    const list = byConsultant.get(c.id) ?? [];

    const rawBars: Array<Omit<CapacityBar, "track">> = [];

    for (const s of list) {
      let startIdx = -1;
      let endIdx = -1;
      for (let i = 0; i < weeks.length; i++) {
        const w = weeks[i]!;
        if (s.start_date <= w.end && s.end_date >= w.start) {
          if (startIdx === -1) startIdx = i;
          endIdx = i;
          cells[i]!.total_pct += s.allocation_pct;
          cells[i]!.projects.push({
            project_id: s.project_id,
            project_name: s.project_name,
            client: s.client,
            allocation_pct: s.allocation_pct,
          });
        }
      }
      if (startIdx !== -1 && endIdx !== -1) {
        rawBars.push({
          staffing_id: s.staffing_id,
          project_id: s.project_id,
          project_name: s.project_name,
          client: s.client,
          allocation_pct: s.allocation_pct,
          start_idx: startIdx,
          end_idx: endIdx,
          clipped_left: s.start_date < weeks[0]!.start,
          clipped_right: s.end_date > weeks[weeks.length - 1]!.end,
        });
      }
    }

    const { bars, trackCount } = packTracks(rawBars);

    return {
      consultant_id: c.id,
      consultant_name: c.name,
      seniority: c.seniority,
      sector: c.sector,
      cells,
      bars,
      track_count: Math.max(trackCount, 1),
    };
  });

  return { weeks, rows };
}

function packTracks(input: Array<Omit<CapacityBar, "track">>): {
  bars: CapacityBar[];
  trackCount: number;
} {
  const sorted = [...input].sort(
    (a, b) => a.start_idx - b.start_idx || a.end_idx - b.end_idx,
  );
  const trackEnds: number[] = []; // last end_idx assigned per track; -1 means free
  const out: CapacityBar[] = [];
  for (const bar of sorted) {
    let track = trackEnds.findIndex((end) => end < bar.start_idx);
    if (track === -1) {
      track = trackEnds.length;
      trackEnds.push(bar.end_idx);
    } else {
      trackEnds[track] = bar.end_idx;
    }
    out.push({ ...bar, track });
  }
  return { bars: out, trackCount: trackEnds.length };
}
