import { asNumber, getDb } from "./db";
import { Consultant, SECTORS, SENIORITIES } from "./consultants";
import { consultantAllocationInRange } from "./availability";

export type ProjectStatus = "open" | "staffed" | "closed";

export interface Project {
  id: number;
  name: string;
  client: string | null;
  sector: string | null;
  description: string | null;
  required_skills: string | null;
  start_date: string;
  end_date: string;
  status: ProjectStatus;
  created_at: string;
}

export interface ProjectSlot {
  id: number;
  project_id: number;
  seniority: string;
  allocation_pct: number;
  label: string | null;
  position: number;
}

export interface SlotAssignment {
  staffing_id: number;
  consultant_id: number;
  consultant_name: string;
  consultant_role: string | null;
  consultant_sector: string | null;
  allocation_pct: number;
  start_date: string;
  end_date: string;
}

export interface SlotWithAssignment {
  slot: ProjectSlot;
  assignment: SlotAssignment | null;
}

export interface ProjectInput {
  name: string;
  client?: string | null;
  sector?: string | null;
  description?: string | null;
  required_skills?: string | null;
  start_date: string;
  end_date: string;
}

export interface SlotInput {
  seniority: string;
  allocation_pct: number;
  label?: string | null;
}

// --- CRUD ------------------------------------------------------------------

export async function createProject(input: ProjectInput, slots: SlotInput[]): Promise<number> {
  const db = await getDb();
  const tx = await db.transaction("write");
  try {
    const projectResult = await tx.execute({
      sql: `INSERT INTO projects (name, client, sector, description, required_skills, start_date, end_date)
            VALUES (:name, :client, :sector, :description, :required_skills, :start_date, :end_date)`,
      args: {
        name: input.name,
        client: input.client ?? null,
        sector: input.sector ?? null,
        description: input.description ?? null,
        required_skills: input.required_skills ?? null,
        start_date: input.start_date,
        end_date: input.end_date,
      },
    });
    const projectId = asNumber(projectResult.lastInsertRowid);
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i]!;
      await tx.execute({
        sql: `INSERT INTO project_slots (project_id, seniority, allocation_pct, label, position)
              VALUES (:project_id, :seniority, :allocation_pct, :label, :position)`,
        args: {
          project_id: projectId,
          seniority: s.seniority,
          allocation_pct: s.allocation_pct,
          label: s.label ?? null,
          position: i,
        },
      });
    }
    await tx.commit();
    return projectId;
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}

export async function listProjects(): Promise<Project[]> {
  const db = await getDb();
  const r = await db.execute("SELECT * FROM projects ORDER BY start_date DESC");
  return r.rows as unknown as Project[];
}

export async function getProject(id: number): Promise<Project | null> {
  const db = await getDb();
  const r = await db.execute({ sql: "SELECT * FROM projects WHERE id = :id", args: { id } });
  return (r.rows[0] as unknown as Project) ?? null;
}

export async function deleteProject(id: number): Promise<void> {
  const db = await getDb();
  await db.execute({ sql: "DELETE FROM projects WHERE id = :id", args: { id } });
}

export async function getProjectSlots(projectId: number): Promise<SlotWithAssignment[]> {
  const db = await getDb();
  const slotsResult = await db.execute({
    sql: `SELECT * FROM project_slots WHERE project_id = :pid ORDER BY position ASC, id ASC`,
    args: { pid: projectId },
  });
  const slots = slotsResult.rows as unknown as ProjectSlot[];
  if (!slots.length) return [];

  const assignmentsResult = await db.execute({
    sql: `SELECT s.id              AS staffing_id,
                 s.project_slot_id AS slot_id,
                 s.consultant_id   AS consultant_id,
                 c.name            AS consultant_name,
                 c.role            AS consultant_role,
                 c.sector          AS consultant_sector,
                 s.allocation_pct  AS allocation_pct,
                 s.start_date      AS start_date,
                 s.end_date        AS end_date
            FROM staffings s
            JOIN consultants c ON c.id = s.consultant_id
           WHERE s.project_slot_id IN (SELECT id FROM project_slots WHERE project_id = :pid)`,
    args: { pid: projectId },
  });

  const bySlot = new Map<number, SlotAssignment>();
  for (const row of assignmentsResult.rows as unknown as Array<SlotAssignment & { slot_id: number }>) {
    const { slot_id, ...rest } = row;
    bySlot.set(slot_id, rest);
  }
  return slots.map((slot) => ({ slot, assignment: bySlot.get(slot.id) ?? null }));
}

export async function staffSlot(slotId: number, consultantId: number): Promise<void> {
  const db = await getDb();
  const slotR = await db.execute({ sql: "SELECT * FROM project_slots WHERE id = :id", args: { id: slotId } });
  const slot = (slotR.rows[0] as unknown as ProjectSlot) ?? null;
  if (!slot) throw new Error("Slot not found");
  const projectR = await db.execute({ sql: "SELECT * FROM projects WHERE id = :id", args: { id: slot.project_id } });
  const project = (projectR.rows[0] as unknown as Project) ?? null;
  if (!project) throw new Error("Project not found");

  const current = await consultantAllocationInRange(consultantId, project.start_date, project.end_date);
  if (current + slot.allocation_pct > 100) {
    throw new Error(`Consultant would be over-allocated (${current}% + ${slot.allocation_pct}% > 100%)`);
  }

  await db.execute({
    sql: `INSERT INTO staffings (project_slot_id, consultant_id, allocation_pct, start_date, end_date)
          VALUES (:slot_id, :cid, :alloc, :start_date, :end_date)`,
    args: {
      slot_id: slotId,
      cid: consultantId,
      alloc: slot.allocation_pct,
      start_date: project.start_date,
      end_date: project.end_date,
    },
  });

  await refreshProjectStatus(project.id);
}

export async function unstaffSlot(staffingId: number): Promise<void> {
  const db = await getDb();
  const r = await db.execute({
    sql: `SELECT ps.project_id AS pid FROM staffings s
            JOIN project_slots ps ON ps.id = s.project_slot_id
           WHERE s.id = :id`,
    args: { id: staffingId },
  });
  const pid = (r.rows[0] as unknown as { pid: number } | undefined)?.pid;
  await db.execute({ sql: "DELETE FROM staffings WHERE id = :id", args: { id: staffingId } });
  if (pid) await refreshProjectStatus(pid);
}

async function refreshProjectStatus(projectId: number): Promise<void> {
  const stats = await projectFillStats(projectId);
  const status: ProjectStatus = stats.total === 0 ? "open" : stats.filled >= stats.total ? "staffed" : "open";
  const db = await getDb();
  await db.execute({ sql: "UPDATE projects SET status = :s WHERE id = :id", args: { s: status, id: projectId } });
}

export async function projectFillStats(projectId: number): Promise<{ total: number; filled: number }> {
  const db = await getDb();
  const r = await db.execute({
    sql: `SELECT
            (SELECT count(*) FROM project_slots WHERE project_id = :pid) AS total,
            (SELECT count(*) FROM project_slots ps
                JOIN staffings s ON s.project_slot_id = ps.id
               WHERE ps.project_id = :pid) AS filled`,
    args: { pid: projectId },
  });
  return (r.rows[0] as unknown as { total: number; filled: number }) ?? { total: 0, filled: 0 };
}

// --- Recommendation engine -------------------------------------------------

export interface Recommendation {
  consultant: Consultant;
  score: number;
  current_allocation: number;
  matched_skills: string[];
  matched_keywords: string[];
  sector_match: boolean;
}

const STOPWORDS = new Set([
  "the","a","an","and","or","but","of","for","to","in","on","at","by","with","from","as",
  "is","are","was","were","be","been","being","this","that","these","those","it","its",
  "we","our","us","you","your","they","their","them","he","she","his","her","i","me",
  "will","would","should","can","could","may","might","do","does","did","has","have","had",
  "ein","eine","eines","einer","der","die","das","den","dem","des","und","oder","aber",
  "von","zu","im","an","auf","mit","fuer","für","auch","sich","wir","sie","es","ist",
  "sind","war","waren","sein","wird","werden","kann","koennen","können","soll","sollen",
  "il","la","lo","gli","le","di","del","della","dei","delle","e","ed","o","ma","per","con",
  "che","si","un","una","uno","alle","alla","ai","negli","nelle","su",
]);

function normalizeSkill(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 +#&]/g, "").replace(/\s+/g, " ").trim();
}

async function extractKeywordsFromDescription(description: string): Promise<string[]> {
  if (!description.trim()) return [];
  const corpus = description.toLowerCase();
  const db = await getDb();
  const r = await db.execute("SELECT DISTINCT skills FROM consultants WHERE skills IS NOT NULL");
  const phrases = new Set<string>();
  for (const row of r.rows as unknown as Array<{ skills: string }>) {
    for (const skill of row.skills.split(",").map((s) => s.trim()).filter(Boolean)) {
      const norm = normalizeSkill(skill);
      if (norm.length >= 3 && corpus.includes(norm)) phrases.add(skill.trim());
    }
  }
  return Array.from(phrases);
}

export interface RecommendationContext {
  project: Project;
  required_skills: string[];
  description_keywords: string[];
}

export async function buildRecommendationContext(project: Project): Promise<RecommendationContext> {
  const required = (project.required_skills ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const fromDesc = await extractKeywordsFromDescription(project.description ?? "");
  return { project, required_skills: required, description_keywords: fromDesc };
}

export async function recommendForSlot(
  slot: ProjectSlot,
  ctx: RecommendationContext,
  options: { limit?: number; excludeConsultantIds?: number[] } = {},
): Promise<Recommendation[]> {
  const limit = options.limit ?? 5;
  const exclude = new Set(options.excludeConsultantIds ?? []);

  const db = await getDb();
  const cR = await db.execute({
    sql: "SELECT * FROM consultants WHERE seniority = :sen",
    args: { sen: slot.seniority },
  });
  const candidates = cR.rows as unknown as Consultant[];

  const requiredNorm = ctx.required_skills.map(normalizeSkill).filter(Boolean);
  const keywordNorm = ctx.description_keywords.map(normalizeSkill).filter(Boolean);

  const sectorMatched: Recommendation[] = [];
  const others: Recommendation[] = [];

  for (const c of candidates) {
    if (exclude.has(c.id)) continue;

    const allocation = await consultantAllocationInRange(c.id, ctx.project.start_date, ctx.project.end_date);
    if (allocation + slot.allocation_pct > 100) continue;

    const consultantSkillsNorm = (c.skills ?? "").toLowerCase();
    const consultantTextNorm = `${c.skills ?? ""} ${c.summary ?? ""} ${c.cv_text ?? ""}`.toLowerCase();

    const matchedSkills: string[] = [];
    for (let i = 0; i < requiredNorm.length; i++) {
      if (consultantSkillsNorm.includes(requiredNorm[i]!) || consultantTextNorm.includes(requiredNorm[i]!)) {
        matchedSkills.push(ctx.required_skills[i]!);
      }
    }

    const matchedKeywords: string[] = [];
    for (let i = 0; i < keywordNorm.length; i++) {
      if (consultantTextNorm.includes(keywordNorm[i]!)) {
        matchedKeywords.push(ctx.description_keywords[i]!);
      }
    }

    const sectorMatch = !!ctx.project.sector && c.sector === ctx.project.sector;

    let score = 0;
    if (sectorMatch) score += 80;
    score += matchedSkills.length * 15;
    score += matchedKeywords.length * 5;
    score += Math.max(0, 100 - allocation - slot.allocation_pct) / 20;

    const rec: Recommendation = {
      consultant: c,
      score: Math.round(score * 10) / 10,
      current_allocation: allocation,
      matched_skills: matchedSkills,
      matched_keywords: matchedKeywords,
      sector_match: sectorMatch,
    };
    if (sectorMatch) sectorMatched.push(rec);
    else others.push(rec);
  }

  const sortByScore = (a: Recommendation, b: Recommendation) =>
    b.score - a.score || a.consultant.name.localeCompare(b.consultant.name);
  sectorMatched.sort(sortByScore);
  others.sort(sortByScore);
  return [...sectorMatched, ...others].slice(0, limit);
}

export { SECTORS, SENIORITIES };
