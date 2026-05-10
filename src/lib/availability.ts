import { getDb } from "./db";

export interface ConsultantStaffing {
  staffing_id: number;
  project_id: number;
  project_name: string;
  client: string | null;
  start_date: string;
  end_date: string;
  allocation_pct: number;
  seniority: string;
  slot_label: string | null;
}

/**
 * Sum of allocation_pct for all staffings of `consultantId` whose date range
 * overlaps [start, end]. Used to detect over-allocation.
 */
export function consultantAllocationInRange(
  consultantId: number,
  start: string,
  end: string,
): number {
  const row = getDb()
    .prepare(
      `SELECT COALESCE(SUM(allocation_pct), 0) AS total
         FROM staffings
        WHERE consultant_id = @cid
          AND start_date <= @end
          AND end_date   >= @start`,
    )
    .get({ cid: consultantId, start, end }) as { total: number };
  return row.total;
}

export function listConsultantStaffings(consultantId: number): ConsultantStaffing[] {
  return getDb()
    .prepare(
      `SELECT s.id              AS staffing_id,
              p.id              AS project_id,
              p.name            AS project_name,
              p.client          AS client,
              s.start_date      AS start_date,
              s.end_date        AS end_date,
              s.allocation_pct  AS allocation_pct,
              ps.seniority      AS seniority,
              ps.label          AS slot_label
         FROM staffings s
         JOIN project_slots ps ON ps.id = s.project_slot_id
         JOIN projects p       ON p.id  = ps.project_id
        WHERE s.consultant_id = @cid
        ORDER BY s.start_date ASC`,
    )
    .all({ cid: consultantId }) as ConsultantStaffing[];
}

/** Allocation overlapping today (UTC) for a quick "current utilization" badge. */
export function currentUtilizationPct(consultantId: number): number {
  const today = new Date().toISOString().slice(0, 10);
  return consultantAllocationInRange(consultantId, today, today);
}
