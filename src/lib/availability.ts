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

export async function consultantAllocationInRange(
  consultantId: number,
  start: string,
  end: string,
): Promise<number> {
  const db = await getDb();
  const r = await db.execute({
    sql: `SELECT COALESCE(SUM(allocation_pct), 0) AS total
            FROM staffings
           WHERE consultant_id = :cid
             AND start_date <= :end_date
             AND end_date   >= :start_date`,
    args: { cid: consultantId, start_date: start, end_date: end },
  });
  return ((r.rows[0] as unknown as { total: number })?.total) ?? 0;
}

export async function listConsultantStaffings(consultantId: number): Promise<ConsultantStaffing[]> {
  const db = await getDb();
  const r = await db.execute({
    sql: `SELECT s.id              AS staffing_id,
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
           WHERE s.consultant_id = :cid
           ORDER BY s.start_date ASC`,
    args: { cid: consultantId },
  });
  return r.rows as unknown as ConsultantStaffing[];
}

export async function currentUtilizationPct(consultantId: number): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  return consultantAllocationInRange(consultantId, today, today);
}
