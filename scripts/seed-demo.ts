/**
 * Seeds 50 demo consultants for the Impacta CVs prototype.
 * - Italian names, six Impacta sectors, realistic skills/languages/locations
 * - Writes a plain-text CV file per consultant under uploads/ so the download
 *   button + extracted-text full-text search both work end-to-end
 * - Idempotent: wipes all existing rows and their files before reseeding
 *
 * Run:  npm run db:seed
 */
import { mkdirSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { getDb } from "../src/lib/db";
import { createConsultant, SECTORS, SENIORITIES } from "../src/lib/consultants";
import { createProject, getProjectSlots, recommendForSlot, buildRecommendationContext, staffSlot, SlotInput } from "../src/lib/projects";
import { UPLOADS_DIR } from "../src/lib/db-path";

// --- deterministic RNG so the seed is reproducible -------------------------
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260509);
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)]!;
const pickN = <T,>(arr: readonly T[], n: number): T[] => {
  const copy = [...arr];
  const out: T[] = [];
  while (out.length < n && copy.length) {
    out.push(copy.splice(Math.floor(rand() * copy.length), 1)[0]!);
  }
  return out;
};

// --- Italian name pools ----------------------------------------------------
const FIRST_NAMES_M = [
  "Alessandro", "Andrea", "Davide", "Federico", "Filippo", "Francesco", "Gabriele",
  "Giovanni", "Giulio", "Leonardo", "Lorenzo", "Luca", "Marco", "Matteo", "Mattia",
  "Niccolò", "Paolo", "Riccardo", "Stefano", "Tommaso",
];
const FIRST_NAMES_F = [
  "Alessia", "Anna", "Beatrice", "Chiara", "Elena", "Elisa", "Federica", "Francesca",
  "Giorgia", "Giulia", "Ilaria", "Laura", "Martina", "Paola", "Sara", "Silvia",
  "Sofia", "Valentina", "Veronica", "Vittoria",
];
const LAST_NAMES = [
  "Rossi", "Russo", "Ferrari", "Esposito", "Bianchi", "Romano", "Colombo", "Ricci",
  "Marino", "Greco", "Bruno", "Gallo", "Conti", "De Luca", "Mancini", "Costa",
  "Giordano", "Rizzo", "Lombardi", "Moretti", "Barbieri", "Fontana", "Santoro",
  "Mariani", "Rinaldi", "Caruso", "Ferrara", "Galli", "Martini", "Leone",
];

// --- Locations -------------------------------------------------------------
const LOCATIONS = [
  { city: "Milan", weight: 7 },
  { city: "Rome", weight: 3 },
  { city: "London (on assignment)", weight: 1 },
  { city: "Milan / Remote", weight: 1 },
];
function pickLocation(): string {
  const total = LOCATIONS.reduce((s, l) => s + l.weight, 0);
  let r = rand() * total;
  for (const l of LOCATIONS) {
    if ((r -= l.weight) <= 0) return l.city;
  }
  return LOCATIONS[0]!.city;
}

// --- Sector-specific roles + skills ---------------------------------------
const SECTOR_PROFILES: Record<
  (typeof SECTORS)[number],
  { roles: string[]; skills: string[]; clients: string[] }
> = {
  "Consumer Products & Retail": {
    roles: ["CPG Strategy Consultant", "Retail Operations Lead", "Category Strategy Consultant"],
    skills: [
      "category management", "omnichannel strategy", "shopper insights", "trade promotion",
      "store-format design", "pricing & promo", "private label", "supply chain optimisation",
      "loyalty programmes", "e-commerce growth",
    ],
    clients: ["a top-3 Italian grocer", "a global FMCG leader", "a premium coffee brand", "a mass-market apparel chain"],
  },
  "Energy & Utilities": {
    roles: ["Energy Transition Consultant", "Utilities Strategy Lead", "Renewables Advisor"],
    skills: [
      "energy transition", "renewables financing", "grid modernisation", "regulatory strategy",
      "carbon accounting", "hydrogen strategy", "EV infrastructure", "PPA structuring",
      "demand-response design", "ESG reporting",
    ],
    clients: ["a major Italian utility", "a Southern European TSO", "an EU renewables developer", "a midstream gas operator"],
  },
  "Fashion & Luxury": {
    roles: ["Luxury Strategy Consultant", "Brand Equity Lead", "Retail Excellence Consultant"],
    skills: [
      "brand positioning", "clienteling", "wholesale strategy", "DTC transformation",
      "luxury pricing", "store productivity", "creative-business interface", "China market entry",
      "sustainable luxury", "experiential retail",
    ],
    clients: ["a Maison du Quadrilatero", "a third-generation leather house", "a Florentine luxury brand", "an Italian eyewear group"],
  },
  "Financial Services": {
    roles: ["FS Strategy Consultant", "Banking Transformation Lead", "Insurance Advisor"],
    skills: [
      "core banking modernisation", "open banking", "wealth management", "risk & compliance",
      "Basel IV readiness", "credit underwriting", "insurance product design", "claims automation",
      "fintech partnerships", "CFO-office transformation",
    ],
    clients: ["a top-5 Italian bank", "a mutual insurance group", "a private banking arm", "a European challenger bank"],
  },
  "Industrial Goods & Services": {
    roles: ["Industrial Strategy Consultant", "Operations Excellence Lead", "B2B Go-to-Market Consultant"],
    skills: [
      "operational excellence", "lean manufacturing", "footprint optimisation", "procurement transformation",
      "Industry 4.0", "B2B pricing", "after-sales monetisation", "service productisation",
      "supply chain resilience", "make-or-buy analysis",
    ],
    clients: ["a Brescia-based machinery group", "an aerospace tier-1 supplier", "a Tuscan industrial conglomerate", "a Piedmont automotive supplier"],
  },
  "Private Equity": {
    roles: ["PE Due Diligence Consultant", "Value Creation Lead", "Portfolio Operations Advisor"],
    skills: [
      "commercial due diligence", "value-creation planning", "100-day plans", "buy-and-build",
      "carve-out support", "LBO modelling", "exit readiness", "operational due diligence",
      "portfolio benchmarking", "synergy capture",
    ],
    clients: ["a mid-market PE fund", "a pan-European GP", "an Italian family office", "a sector-focused growth fund"],
  },
};

// --- Languages, education, certifications ---------------------------------
const EXTRA_LANGUAGES = [
  "French (B2)", "French (C1)", "Spanish (B2)", "Spanish (C1)",
  "German (B1)", "German (B2)", "Mandarin (A2)", "Portuguese (B2)",
];
const UNIVERSITIES = [
  "Bocconi University, MSc Management",
  "Politecnico di Milano, MSc Management Engineering",
  "LUISS Guido Carli, MSc Strategy",
  "Università Cattolica del Sacro Cuore, MSc Economics",
  "INSEAD MBA",
  "London Business School, MSc Finance",
  "Politecnico di Torino, MSc Industrial Engineering",
  "Università di Bologna, MSc Economics & Management",
];
const CERTIFICATIONS = [
  "Lean Six Sigma Green Belt", "PMP", "CFA Level II", "CFA Level III",
  "Prosci Change Management", "AWS Cloud Practitioner", "Scrum Master (PSM I)",
];

// --- Seniority distribution ------------------------------------------------
const SENIORITY_PLAN: Array<{ level: (typeof SENIORITIES)[number]; count: number; yrs: [number, number] }> = [
  { level: "Analyst",           count: 8, yrs: [0, 2] },
  { level: "Associate",         count: 8, yrs: [2, 4] },
  { level: "Consultant",        count: 10, yrs: [3, 6] },
  { level: "Senior Consultant", count: 8, yrs: [5, 8] },
  { level: "Manager",           count: 7, yrs: [7, 11] },
  { level: "Senior Manager",    count: 5, yrs: [10, 14] },
  { level: "Principal",         count: 3, yrs: [12, 17] },
  { level: "Partner",           count: 1, yrs: [16, 22] },
];

function chooseGenderedFirst(): { name: string; gender: "M" | "F" } {
  const g: "M" | "F" = rand() < 0.5 ? "M" : "F";
  return { name: pick(g === "M" ? FIRST_NAMES_M : FIRST_NAMES_F), gender: g };
}

function buildCvText(args: {
  name: string;
  role: string;
  seniority: string;
  sector: string;
  location: string;
  yrs: number;
  skills: string[];
  languages: string;
  university: string;
  certs: string[];
  clients: string[];
}): string {
  const projectsCount = Math.min(5, Math.max(2, Math.round(args.yrs / 2)));
  const projects = pickN(args.clients, Math.min(projectsCount, args.clients.length))
    .map((c, i) => `  ${i + 1}. Led a ${pick(args.skills)} workstream for ${c}.`)
    .join("\n");

  return `${args.name}
${args.role} — ${args.seniority}
Impacta Strategy · ${args.location}

PROFILE
${args.yrs} years of strategy consulting experience focused on ${args.sector}.
Trusted advisor on ${args.skills.slice(0, 3).join(", ")} and broader transformation programmes.

EXPERIENCE
Impacta Strategy — ${args.seniority}
${projects}

EDUCATION
${args.university}

LANGUAGES
${args.languages}

CERTIFICATIONS
${args.certs.length ? args.certs.join(", ") : "—"}

KEY SKILLS
${args.skills.join(" · ")}
`;
}

// --- Reset ----------------------------------------------------------------
async function resetAll() {
  const db = await getDb();
  const rowsR = await db.execute("SELECT cv_file_path FROM consultants WHERE cv_file_path IS NOT NULL");
  for (const r of rowsR.rows as unknown as Array<{ cv_file_path: string }>) {
    try { unlinkSync(join(UPLOADS_DIR, r.cv_file_path)); } catch { /* ignore */ }
  }
  // staffings + project_slots cascade from projects; consultants delete cascades through staffings
  await db.execute("DELETE FROM staffings");
  await db.execute("DELETE FROM project_slots");
  await db.execute("DELETE FROM projects");
  await db.execute("DELETE FROM consultants");
  await db.execute("DELETE FROM sqlite_sequence WHERE name IN ('consultants','projects','project_slots','staffings')");

  try {
    for (const f of readdirSync(UPLOADS_DIR)) {
      if (f.endsWith(".txt") || f.endsWith(".pdf") || f.endsWith(".docx")) {
        try { unlinkSync(join(UPLOADS_DIR, f)); } catch { /* ignore */ }
      }
    }
  } catch { /* uploads dir might not exist yet */ }
}

// --- Demo projects ---------------------------------------------------------
function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
const today = new Date().toISOString().slice(0, 10);

interface DemoProject {
  name: string;
  client: string;
  sector: string;
  description: string;
  required_skills: string;
  start_offset_days: number;
  duration_days: number;
  slots: SlotInput[];
  /** how many slots (top-down) to auto-staff via the recommendation engine */
  prefillTopK?: number;
}

const DEMO_PROJECTS: DemoProject[] = [
  {
    name: "CDD: Italian luxury eyewear roll-up",
    client: "Apex Capital Partners",
    sector: "Fashion & Luxury",
    description:
      "Mid-market PE fund evaluating a buy-and-build thesis around independent Italian eyewear brands. Need commercial due diligence covering brand positioning, wholesale strategy and DTC transformation potential, plus a value-creation hypothesis around clienteling and luxury pricing.",
    required_skills: "commercial due diligence, brand positioning, DTC transformation, luxury pricing, wholesale strategy",
    start_offset_days: -7,
    duration_days: 42,
    slots: [
      { seniority: "Partner", allocation_pct: 20, label: "Sponsor" },
      { seniority: "Manager", allocation_pct: 80, label: "PM" },
      { seniority: "Senior Consultant", allocation_pct: 100 },
      { seniority: "Consultant", allocation_pct: 100 },
      { seniority: "Analyst", allocation_pct: 100 },
    ],
    prefillTopK: 3,
  },
  {
    name: "Energy transition roadmap for Southern European utility",
    client: "Mediterraneo Energia",
    sector: "Energy & Utilities",
    description:
      "Top-down energy transition roadmap with focus on renewables financing, grid modernisation and hydrogen strategy. Engagement includes regulatory strategy review and an EV infrastructure investment case for the next five years.",
    required_skills: "energy transition, renewables financing, grid modernisation, hydrogen strategy, regulatory strategy",
    start_offset_days: 14,
    duration_days: 84,
    slots: [
      { seniority: "Principal", allocation_pct: 30, label: "Lead" },
      { seniority: "Senior Manager", allocation_pct: 70 },
      { seniority: "Senior Consultant", allocation_pct: 100 },
      { seniority: "Consultant", allocation_pct: 100 },
      { seniority: "Consultant", allocation_pct: 100 },
    ],
    prefillTopK: 2,
  },
  {
    name: "DTC transformation for Florentine maison",
    client: "Casa Lavinia (Florence)",
    sector: "Fashion & Luxury",
    description:
      "Third-generation leather house wants to rebalance from wholesale into DTC. Scope includes clienteling programme design, store productivity, omnichannel rollout and a sustainable luxury narrative for the new collection.",
    required_skills: "DTC transformation, clienteling, store productivity, omnichannel strategy, sustainable luxury",
    start_offset_days: 0,
    duration_days: 56,
    slots: [
      { seniority: "Manager", allocation_pct: 60, label: "PM" },
      { seniority: "Senior Consultant", allocation_pct: 100 },
      { seniority: "Consultant", allocation_pct: 100 },
    ],
    prefillTopK: 1,
  },
  {
    name: "Open banking go-to-market for challenger bank",
    client: "Vela Banca Digitale",
    sector: "Financial Services",
    description:
      "Italian challenger bank scaling its open banking partnerships. Need go-to-market, fintech partnership pipeline, core banking modernisation roadmap and a CFO-office transformation case to support fundraising.",
    required_skills: "open banking, fintech partnerships, core banking modernisation, CFO-office transformation",
    start_offset_days: 21,
    duration_days: 70,
    slots: [
      { seniority: "Senior Manager", allocation_pct: 50 },
      { seniority: "Senior Consultant", allocation_pct: 100 },
      { seniority: "Consultant", allocation_pct: 100 },
      { seniority: "Analyst", allocation_pct: 100 },
    ],
  },
  {
    name: "Operational excellence diagnostic — Brescia machinery",
    client: "Forgia Lombarda S.p.A.",
    sector: "Industrial Goods & Services",
    description:
      "Six-week diagnostic of operational excellence across two Brescia plants. Lean manufacturing assessment, footprint optimisation hypotheses, procurement transformation quick wins and an Industry 4.0 maturity scan.",
    required_skills: "operational excellence, lean manufacturing, footprint optimisation, Industry 4.0, procurement transformation",
    start_offset_days: -14,
    duration_days: 42,
    slots: [
      { seniority: "Manager", allocation_pct: 80, label: "PM" },
      { seniority: "Senior Consultant", allocation_pct: 100 },
      { seniority: "Associate", allocation_pct: 100 },
    ],
    prefillTopK: 2,
  },
  {
    name: "Category strategy for Italian grocer",
    client: "Mercato Verde Italia",
    sector: "Consumer Products & Retail",
    description:
      "Top-3 Italian grocer rebuilding its private label and trade promo strategy. Workstreams include category management, shopper insights, pricing & promo and a loyalty programme refresh tied to e-commerce growth ambitions.",
    required_skills: "category management, shopper insights, pricing & promo, private label, loyalty programmes",
    start_offset_days: 7,
    duration_days: 49,
    slots: [
      { seniority: "Senior Manager", allocation_pct: 40 },
      { seniority: "Senior Consultant", allocation_pct: 100 },
      { seniority: "Consultant", allocation_pct: 100 },
    ],
  },
];

async function seedDemoProjects() {
  for (const dp of DEMO_PROJECTS) {
    const start = addDays(today, dp.start_offset_days);
    const end = addDays(start, dp.duration_days);
    const projectId = await createProject(
      {
        name: dp.name,
        client: dp.client,
        sector: dp.sector,
        description: dp.description,
        required_skills: dp.required_skills,
        start_date: start,
        end_date: end,
      },
      dp.slots,
    );

    if (!dp.prefillTopK) continue;

    const db = await getDb();
    const r = await db.execute({ sql: "SELECT * FROM projects WHERE id = :id", args: { id: projectId } });
    const project = r.rows[0] as unknown as Parameters<typeof buildRecommendationContext>[0];
    const ctx = await buildRecommendationContext(project);
    const slotPairs = await getProjectSlots(projectId);
    const usedConsultantIds: number[] = [];
    let prefilled = 0;
    for (const sp of slotPairs) {
      if (prefilled >= dp.prefillTopK) break;
      const recs = await recommendForSlot(sp.slot, ctx, { excludeConsultantIds: usedConsultantIds, limit: 1 });
      if (recs.length === 0) continue;
      try {
        await staffSlot(sp.slot.id, recs[0]!.consultant.id);
        usedConsultantIds.push(recs[0]!.consultant.id);
        prefilled++;
      } catch {
        // over-allocation guard fired — skip this slot
      }
    }
  }
}

// --- Main -----------------------------------------------------------------
async function main() {
  try { mkdirSync(UPLOADS_DIR, { recursive: true }); } catch { /* read-only fs is fine */ }
  await resetAll();

  const sectorList = [...SECTORS];
  let sectorCursor = 0;
  let inserted = 0;

  for (const tier of SENIORITY_PLAN) {
    for (let i = 0; i < tier.count; i++) {
      const sector = sectorList[sectorCursor++ % sectorList.length]!;
      const profile = SECTOR_PROFILES[sector];
      const role = pick(profile.roles);

      const { name: first } = chooseGenderedFirst();
      const last = pick(LAST_NAMES);
      const fullName = `${first} ${last}`;
      const slug = `${first}.${last}`.toLowerCase().replace(/\s+/g, "");
      const email = `${slug}@impactastrategy.com`;

      const yrs = tier.yrs[0] + Math.floor(rand() * (tier.yrs[1] - tier.yrs[0] + 1));
      const skills = pickN(profile.skills, 4 + Math.floor(rand() * 3));
      const langs = ["Italian (native)", "English (C2)"];
      if (rand() < 0.55) langs.push(pick(EXTRA_LANGUAGES));
      const certs = rand() < 0.4 ? pickN(CERTIFICATIONS, 1 + (rand() < 0.3 ? 1 : 0)) : [];
      const university = pick(UNIVERSITIES);
      const location = pickLocation();

      const cvText = buildCvText({
        name: fullName,
        role,
        seniority: tier.level,
        sector,
        location,
        yrs,
        skills,
        languages: langs.join(", "),
        university,
        certs,
        clients: profile.clients,
      });

      const stored = `${randomUUID()}.txt`;
      let storedPath: string | null = null;
      try {
        writeFileSync(join(UPLOADS_DIR, stored), cvText, "utf8");
        storedPath = stored;
      } catch {
        // read-only filesystem (e.g. Vercel) — keep cv_text but skip the file.
      }

      await createConsultant({
        name: fullName,
        email,
        role,
        seniority: tier.level,
        sector,
        location,
        years_experience: yrs,
        languages: langs.join(", "),
        skills: skills.join(", "),
        summary: `${tier.level} in ${sector}. ${yrs} yrs. Focus: ${skills.slice(0, 3).join(", ")}.`,
        cv_file_name: storedPath ? `${slug}_CV.txt` : null,
        cv_file_path: storedPath,
        cv_text: cvText,
      });
      inserted++;
    }
  }

  console.log(`Seeded ${inserted} consultants across ${sectorList.length} sectors.`);

  await seedDemoProjects();
  const db = await getDb();
  const pc = (await db.execute("SELECT count(*) AS n FROM projects")).rows[0] as unknown as { n: number };
  const sc = (await db.execute("SELECT count(*) AS n FROM staffings")).rows[0] as unknown as { n: number };
  console.log(`Seeded ${pc.n} projects with ${sc.n} pre-filled staffings.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
