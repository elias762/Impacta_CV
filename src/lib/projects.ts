import { getDb } from "./db";
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

export function createProject(input: ProjectInput, slots: SlotInput[]): number {
  const db = getDb();
  const insertProject = db.prepare(`
    INSERT INTO projects (name, client, sector, description, required_skills, start_date, end_date)
    VALUES (@name, @client, @sector, @description, @required_skills, @start_date, @end_date)
  `);
  const insertSlot = db.prepare(`
    INSERT INTO project_slots (project_id, seniority, allocation_pct, label, position)
    VALUES (@project_id, @seniority, @allocation_pct, @label, @position)
  `);

  const tx = db.prepare("BEGIN");
  const commit = db.prepare("COMMIT");
  const rollback = db.prepare("ROLLBACK");
  tx.run();
  try {
    const result = insertProject.run({
      name: input.name,
      client: input.client ?? null,
      sector: input.sector ?? null,
      description: input.description ?? null,
      required_skills: input.required_skills ?? null,
      start_date: input.start_date,
      end_date: input.end_date,
    });
    const projectId = Number(result.lastInsertRowid);
    slots.forEach((s, idx) => {
      insertSlot.run({
        project_id: projectId,
        seniority: s.seniority,
        allocation_pct: s.allocation_pct,
        label: s.label ?? null,
        position: idx,
      });
    });
    commit.run();
    return projectId;
  } catch (e) {
    rollback.run();
    throw e;
  }
}

export function listProjects(): Project[] {
  return getDb().prepare("SELECT * FROM projects ORDER BY start_date DESC").all() as Project[];
}

export function getProject(id: number): Project | null {
  return (getDb().prepare("SELECT * FROM projects WHERE id = ?").get(id) as Project | undefined) ?? null;
}

export function deleteProject(id: number): void {
  getDb().prepare("DELETE FROM projects WHERE id = ?").run(id);
}

export function getProjectSlots(projectId: number): SlotWithAssignment[] {
  const slots = getDb()
    .prepare(`SELECT * FROM project_slots WHERE project_id = ? ORDER BY position ASC, id ASC`)
    .all(projectId) as ProjectSlot[];
  if (!slots.length) return [];
  const slotIds = slots.map((s) => s.id);
  const placeholders = slotIds.map(() => "?").join(",");
  const assignmentRows = getDb()
    .prepare(
      `SELECT s.id              AS staffing_id,
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
        WHERE s.project_slot_id IN (${placeholders})`,
    )
    .all(...slotIds) as Array<SlotAssignment & { slot_id: number }>;
  const bySlot = new Map<number, SlotAssignment>();
  for (const a of assignmentRows) {
    const { slot_id, ...rest } = a;
    bySlot.set(slot_id, rest);
  }
  return slots.map((slot) => ({ slot, assignment: bySlot.get(slot.id) ?? null }));
}

export function staffSlot(slotId: number, consultantId: number): void {
  const db = getDb();
  const slot = db.prepare("SELECT * FROM project_slots WHERE id = ?").get(slotId) as ProjectSlot | undefined;
  if (!slot) throw new Error("Slot not found");
  const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(slot.project_id) as Project | undefined;
  if (!project) throw new Error("Project not found");

  const current = consultantAllocationInRange(consultantId, project.start_date, project.end_date);
  if (current + slot.allocation_pct > 100) {
    throw new Error(
      `Consultant would be over-allocated (${current}% + ${slot.allocation_pct}% > 100%)`,
    );
  }

  db.prepare(
    `INSERT INTO staffings (project_slot_id, consultant_id, allocation_pct, start_date, end_date)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(slotId, consultantId, slot.allocation_pct, project.start_date, project.end_date);

  refreshProjectStatus(project.id);
}

export function unstaffSlot(staffingId: number): void {
  const db = getDb();
  const row = db.prepare("SELECT s.*, ps.project_id AS pid FROM staffings s JOIN project_slots ps ON ps.id = s.project_slot_id WHERE s.id = ?")
    .get(staffingId) as { pid: number } | undefined;
  db.prepare("DELETE FROM staffings WHERE id = ?").run(staffingId);
  if (row?.pid) refreshProjectStatus(row.pid);
}

function refreshProjectStatus(projectId: number): void {
  const db = getDb();
  const row = db.prepare(
    `SELECT
        (SELECT count(*) FROM project_slots WHERE project_id = ?) AS total,
        (SELECT count(*) FROM project_slots ps
            JOIN staffings s ON s.project_slot_id = ps.id
           WHERE ps.project_id = ?) AS filled`,
  ).get(projectId, projectId) as { total: number; filled: number };
  const status: ProjectStatus = row.total === 0 ? "open" : row.filled >= row.total ? "staffed" : "open";
  db.prepare("UPDATE projects SET status = ? WHERE id = ?").run(status, projectId);
}

export function projectFillStats(projectId: number): { total: number; filled: number } {
  return getDb()
    .prepare(
      `SELECT
        (SELECT count(*) FROM project_slots WHERE project_id = ?) AS total,
        (SELECT count(*) FROM project_slots ps
            JOIN staffings s ON s.project_slot_id = ps.id
           WHERE ps.project_id = ?) AS filled`,
    )
    .get(projectId, projectId) as { total: number; filled: number };
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
  "von","zu","im","in","an","auf","mit","fuer","für","auch","sich","wir","sie","es","ist",
  "sind","war","waren","sein","sind","wird","werden","kann","koennen","können","soll","sollen",
  "il","la","lo","gli","le","di","del","della","dei","delle","e","ed","o","ma","per","con",
  "che","si","un","una","uno","del","alle","alla","ai","negli","nelle","in","su",
]);

function normalizeSkill(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 +#&]/g, "").replace(/\s+/g, " ").trim();
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9äöüßéèàùìòáíóú\s-]/gi, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

/** Pull skill-like phrases (1-3 words) from the project description by matching against the
 *  vocabulary already present in the consultants table. Cheap, deterministic, "knows our world". */
function extractKeywordsFromDescription(description: string): string[] {
  if (!description.trim()) return [];
  const corpus = description.toLowerCase();
  const vocab = getDb()
    .prepare(`SELECT DISTINCT skills FROM consultants WHERE skills IS NOT NULL`)
    .all() as Array<{ skills: string }>;
  const phrases = new Set<string>();
  for (const row of vocab) {
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

export function buildRecommendationContext(project: Project): RecommendationContext {
  const required = (project.required_skills ?? "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  const fromDesc = extractKeywordsFromDescription(project.description ?? "");
  return { project, required_skills: required, description_keywords: fromDesc };
}

export function recommendForSlot(
  slot: ProjectSlot,
  ctx: RecommendationContext,
  options: { limit?: number; excludeConsultantIds?: number[] } = {},
): Recommendation[] {
  const limit = options.limit ?? 5;
  const exclude = new Set(options.excludeConsultantIds ?? []);

  const candidates = getDb()
    .prepare(`SELECT * FROM consultants WHERE seniority = ?`)
    .all(slot.seniority) as Consultant[];

  const requiredNorm = ctx.required_skills.map(normalizeSkill).filter(Boolean);
  const keywordNorm = ctx.description_keywords.map(normalizeSkill).filter(Boolean);

  const sectorMatched: Recommendation[] = [];
  const others: Recommendation[] = [];

  for (const c of candidates) {
    if (exclude.has(c.id)) continue;

    const allocation = consultantAllocationInRange(c.id, ctx.project.start_date, ctx.project.end_date);
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

  // Sector-aligned candidates always come first; off-sector candidates only fill up the remainder.
  return [...sectorMatched, ...others].slice(0, limit);
}

// re-exports so server actions can import from one place
export { SECTORS, SENIORITIES };
