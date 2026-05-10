import { asNumber, getDb } from "./db";

export const SECTORS = [
  "Consumer Products & Retail",
  "Energy & Utilities",
  "Fashion & Luxury",
  "Financial Services",
  "Industrial Goods & Services",
  "Private Equity",
] as const;

export const SENIORITIES = [
  "Analyst",
  "Associate",
  "Consultant",
  "Senior Consultant",
  "Manager",
  "Senior Manager",
  "Principal",
  "Partner",
] as const;

export type Sector = (typeof SECTORS)[number];
export type Seniority = (typeof SENIORITIES)[number];

export interface Consultant {
  id: number;
  name: string;
  email: string | null;
  role: string | null;
  seniority: string | null;
  sector: string | null;
  location: string | null;
  years_experience: number | null;
  languages: string | null;
  skills: string | null;
  summary: string | null;
  cv_file_name: string | null;
  cv_file_path: string | null;
  cv_text: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConsultantInput {
  name: string;
  email?: string | null;
  role?: string | null;
  seniority?: string | null;
  sector?: string | null;
  location?: string | null;
  years_experience?: number | null;
  languages?: string | null;
  skills?: string | null;
  summary?: string | null;
  cv_file_name?: string | null;
  cv_file_path?: string | null;
  cv_text?: string | null;
}

export interface SearchFilters {
  q?: string;
  sector?: string;
  seniority?: string;
}

export async function createConsultant(input: ConsultantInput): Promise<number> {
  const db = await getDb();
  const result = await db.execute({
    sql: `INSERT INTO consultants
            (name, email, role, seniority, sector, location, years_experience,
             languages, skills, summary, cv_file_name, cv_file_path, cv_text)
          VALUES
            (:name, :email, :role, :seniority, :sector, :location, :years_experience,
             :languages, :skills, :summary, :cv_file_name, :cv_file_path, :cv_text)`,
    args: {
      name: input.name,
      email: input.email ?? null,
      role: input.role ?? null,
      seniority: input.seniority ?? null,
      sector: input.sector ?? null,
      location: input.location ?? null,
      years_experience: input.years_experience ?? null,
      languages: input.languages ?? null,
      skills: input.skills ?? null,
      summary: input.summary ?? null,
      cv_file_name: input.cv_file_name ?? null,
      cv_file_path: input.cv_file_path ?? null,
      cv_text: input.cv_text ?? null,
    },
  });
  return asNumber(result.lastInsertRowid);
}

export async function getConsultant(id: number): Promise<Consultant | null> {
  const db = await getDb();
  const r = await db.execute({ sql: "SELECT * FROM consultants WHERE id = :id", args: { id } });
  return (r.rows[0] as unknown as Consultant) ?? null;
}

export async function deleteConsultant(id: number): Promise<Consultant | null> {
  const existing = await getConsultant(id);
  if (!existing) return null;
  const db = await getDb();
  await db.execute({ sql: "DELETE FROM consultants WHERE id = :id", args: { id } });
  return existing;
}

function escapeFtsTerm(term: string): string {
  return term
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => `"${t.replace(/"/g, '""')}"*`)
    .join(" AND ");
}

export async function searchConsultants(filters: SearchFilters): Promise<Consultant[]> {
  const db = await getDb();
  const where: string[] = [];
  const params: Record<string, unknown> = {};

  let sql = `SELECT c.* FROM consultants c`;

  if (filters.q && filters.q.trim()) {
    const term = escapeFtsTerm(filters.q.trim());
    if (term) {
      sql += ` JOIN consultants_fts f ON f.rowid = c.id`;
      where.push(`consultants_fts MATCH :q`);
      params.q = term;
    }
  }
  if (filters.sector) {
    where.push(`c.sector = :sector`);
    params.sector = filters.sector;
  }
  if (filters.seniority) {
    where.push(`c.seniority = :seniority`);
    params.seniority = filters.seniority;
  }
  if (where.length) sql += ` WHERE ${where.join(" AND ")}`;
  sql += ` ORDER BY c.updated_at DESC LIMIT 200`;

  const result = await db.execute({ sql, args: params });
  return result.rows as unknown as Consultant[];
}
