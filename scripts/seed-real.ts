/**
 * Seeds the database with the 17 real Impacta Strategy profiles.
 * Source: c:/Users/Dell/Downloads/impacta_strategy_profiles.json (snapshot).
 *
 * Wipes any prior consultants/projects/staffings, then inserts the real team
 * plus a small set of demo engagements sized to the real seniority mix.
 *
 *   npm run db:seed:real
 */
import { unlinkSync, readdirSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { getDb } from "../src/lib/db";
import { createConsultant } from "../src/lib/consultants";
import {
  buildRecommendationContext,
  createProject,
  getProjectSlots,
  recommendForSlot,
  SlotInput,
  staffSlot,
} from "../src/lib/projects";
import { UPLOADS_DIR } from "../src/lib/db-path";

// ---------- profile data ----------
interface RealProfile {
  name: string;
  role: string;
  seniority: string;
  sector: string | null;
  location: string;
  years_experience: number;
  languages: string;
  skills: string;
  summary: string;
  about: string;
  previous: string;
  education: string;
}

const PROFILES: RealProfile[] = [
  {
    name: "Federico Bonelli",
    role: "Senior Partner · Retail, Fashion & Luxury Practice Leader",
    seniority: "Senior Partner",
    sector: "Fashion & Luxury",
    location: "Milan",
    years_experience: 15,
    languages: "English (Full professional), French (Full professional), Italian (Native)",
    skills:
      "luxury strategy, fashion & beauty, retail, private equity, value creation, growth strategy, CEO leadership, transactions",
    summary:
      "Senior Partner and Retail, Fashion & Luxury Practice Leader. 15+ years in luxury, fashion & beauty, retail and PE.",
    about:
      "Results-oriented professional with 15+ years of expertise in luxury, fashion & beauty industry, retail and private equity. Former CEO of Pinko, Senior Advisor at Roberto Cavalli (DAMAC Holdings mandate), Senior Partner at EY Strategy & Transactions, and Principal at BCG and Bain & Co. Advised 70+ leading companies and PE funds.",
    previous: "EY-Parthenon, Roberto Cavalli, PINKO (CEO), BCG, Bain & Company",
    education:
      "Università degli Studi di Milano, MSc Theoretical Physics (2006-2008); Università degli Studi di Milano, BSc Physics (2003-2006)",
  },
  {
    name: "Davide Iorio",
    role: "Senior Partner · Industrial Goods & Services and Energy",
    seniority: "Senior Partner",
    sector: "Industrial Goods & Services",
    location: "Rome",
    years_experience: 22,
    languages: "Italian (Native), English",
    skills:
      "business transformation, growth strategy, performance improvement, energy & utilities regulation, water and wastewater, regulated power and gas, industrial transformation",
    summary:
      "Senior Partner based in Rome. Expert in Industrial Goods & Services and Energy. 22 years at Bain & Company through 2025.",
    about:
      "Senior partner based in Rome office. Expert in Industrial Goods & Services and Energy. Extensive experience across sectors including water and wastewater, regulated power and gas. Particular expertise in business transformation, growth strategy and performance improvement.",
    previous: "Bain & Company (Partner, 2003-2025)",
    education: "Luiss Guido Carli University, Business Administration (1999-2003)",
  },
  {
    name: "Guelfo Bartalucci Torlonia",
    role: "Partner · Consumer Products & Retail",
    seniority: "Partner",
    sector: "Consumer Products & Retail",
    location: "Rome",
    years_experience: 10,
    languages: "English (Full professional), French (Limited working), Italian (Native)",
    skills:
      "consumer products, retail strategy, restructuring, value creation, turnaround, financial advisory, industrial",
    summary: "Partner in the Consumer Product & Retail practice.",
    about:
      "Partner at Impacta Strategy with experience across consumer products, retail and restructuring. Background in Director-level advisory at AlixPartners and PE/Industrial roles.",
    previous: "AlixPartners (Director), LONSIN Capital Ltd, CNH Industrial",
    education:
      "Luiss Business School, MBA (2015-2016); University of San Diego - Knauss School of Business, MBA Exchange Program (2016)",
  },
  {
    name: "Marco Rastiello",
    role: "Partner · Energy & Infrastructure",
    seniority: "Partner",
    sector: "Energy & Utilities",
    location: "Rome",
    years_experience: 18,
    languages: "Italian (Native), English",
    skills:
      "energy strategy, infrastructure, power systems, TSOs, DSOs, regulated environments, rail and transportation, growth, transformation, value creation",
    summary:
      "Partner. 18 years advising industrial players, infrastructure operators and investors. Focus on power systems, TSOs/DSOs, regulated environments and rail/transportation.",
    about:
      "Advising industrial players, infrastructure operators and investors on growth, transformation and value creation. 18 years of experience in energy and infrastructure, with a focus on power systems, TSOs/DSOs, regulated environments and rail/transportation.",
    previous: "Bain & Company (Partner, 2013-2025), ACEA SPA",
    education:
      "University of Rome Tor Vergata, MSc Management Engineering; University of Rome Tor Vergata, BSc Management Engineering",
  },
  {
    name: "Fabio Sgro",
    role: "Associate Partner · Energy & Utilities",
    seniority: "Associate Partner",
    sector: "Energy & Utilities",
    location: "Italy",
    years_experience: 21,
    languages: "Italian (Native), English",
    skills:
      "energy & utilities, organization transformation, digital transformation, project management, renewable energy, business strategy, business process improvement",
    summary:
      "Associate Partner. 21+ years in Energy & Utilities. Bain alumnus, ex-Terna Head of Organization, ex-Enel.",
    about:
      "Expert in Strategy, Organization & Digital Transformation with 21+ years of experience, deeply rooted in the Energy & Utilities sector. Combines strategic rigor of top-tier consulting with execution capability of an industrial executive to drive large-scale corporate change.",
    previous:
      "Terna SpA (Head of Organization, Processes, Policies & HR Information Systems), Bain & Company (Associate Partner), Enel Spa, Alitalia Spa",
    education:
      "University of Rome Tor Vergata, M.Eng. Business Administration and Management (1999-2004)",
  },
  {
    name: "Marenza Vinci",
    role: "Associate Partner · Consumer, Retail, Fashion & Luxury",
    seniority: "Associate Partner",
    sector: "Fashion & Luxury",
    location: "Milan",
    years_experience: 26,
    languages: "English, Italian (Native)",
    skills:
      "fashion strategy, luxury, beauty, value creation, PE platform build-ups, consumer & retail, transformation",
    summary:
      "Associate Partner, founding team member. Supports leading corporations and international PE funds on value creation plans in Fashion, Luxury and Beauty.",
    about:
      "Associate Partner and member of the founding team of Impacta Strategy. Supports leading corporations and international Private Equity funds in the design and execution of value creation plans for third-party platform build-ups in the Fashion, Luxury, and Beauty sectors.",
    previous:
      "Ernst & Young Global Consulting Services, ELISABETTA FRANCHI, Tonino Lamborghini S.p.A., AREA group",
    education: "Alma Mater Studiorum – Università di Bologna, Laurea in Economics (1993-1999)",
  },
  {
    name: "Arianna Baccini",
    role: "Associate Partner · Consumer, Retail, Fashion & Luxury",
    seniority: "Associate Partner",
    sector: "Fashion & Luxury",
    location: "Italy",
    years_experience: 10,
    languages: "English (Full professional), French (Full professional), Italian (Native)",
    skills:
      "strategic consulting, private equity, general management, consumer strategy, retail, fashion & luxury, value creation",
    summary:
      "Associate Partner. 10+ years across Strategic Consulting, Private Equity and General Management in Consumer, Retail and Fashion & Luxury.",
    about:
      "10+ years of experience in Strategic Consulting, Private Equity and General Management. Career focused on Consumer, Retail, and Fashion & Luxury sectors. Part of the founding team of Exentially within Carisma Impact.",
    previous: "EY-Parthenon (Partner), EY, Deloitte Consulting, Primiziexpress Srl",
    education:
      "Luiss Guido Carli University, Economia e Direzione delle Imprese (2012-2014); Università degli Studi di Firenze, Business Administration (2009-2012)",
  },
  {
    name: "Guido Biasi",
    role: "Associate Partner · Energy & Utilities",
    seniority: "Associate Partner",
    sector: "Energy & Utilities",
    location: "Italy",
    years_experience: 21,
    languages: "Italian (Native), English",
    skills:
      "renewable energy, distributed generation, energy efficiency, energy transition, strategy consulting, business administration",
    summary:
      "Associate Partner. Background in renewable energy and distributed generation. Ex-Bain, ex-KPMG Advisory.",
    about:
      "Associate Partner at Impacta Strategy. Experience in renewable energy, distributed generation and energy efficiency through Politecnico di Milano Master and a Bain & Company tenure.",
    previous: "Bain & Company, KPMG Advisory, Ratech Srl, Biasi",
    education:
      "Politecnico di Milano, Master on Renewable Energy / Distributed Generation and Energy Efficiency (2009-2010); Università Cattolica del Sacro Cuore, Business Administration (2000-2005)",
  },
  {
    name: "Federico Premoli",
    role: "Senior Manager · Financial Services (Payments, Retail Banking, Consumer Finance)",
    seniority: "Senior Manager",
    sector: "Financial Services",
    location: "Milan",
    years_experience: 8,
    languages: "English (Professional), Italian (Native)",
    skills:
      "payments, retail banking, consumer finance, strategic business plans, business models, business case development, business opportunity assessment",
    summary:
      "Senior Manager focused on payments, retail banking and consumer finance. 8+ years across small and large players.",
    about:
      "Financial Services consultant with a focus on payments, retail banking and consumer finance. 8+ years of experience helping small and large players develop strategic business plans, defining new business models and assessing business opportunities.",
    previous: "Strategy&, PwC Italy",
    education:
      "Politecnico di Milano, MSc Management Engineering - Finance (2015-2017); Peter the Great St.Petersburg Polytechnic University, Exchange Program (2015)",
  },
  {
    name: "Andrea Taurelli Salimbeni",
    role: "Senior Manager · Search Fund & Strategy",
    seniority: "Senior Manager",
    sector: "Private Equity",
    location: "Italy",
    years_experience: 11,
    languages: "English (Full professional), French (Elementary), Italian (Native)",
    skills:
      "search funds, M&A, private equity, strategy consulting, international management, value creation",
    summary:
      "Senior Manager focused on search funds and strategy. Managing Partner at LDue Capital, ex-Bain, ex-EY.",
    about:
      "Senior Manager at Impacta with parallel role as Managing Partner at LDue Capital. Background in strategy consulting at Bain & Company and EY.",
    previous: "LDue Capital (Managing Partner, still current), Bain & Company, EY",
    education:
      "Esade, MSc International Management (2014-2015); Università Bocconi, BSc International Management - Finance and Economics (2011-2014)",
  },
  {
    name: "Alessandro Brunetti",
    role: "Senior Manager · Strategy & Value Creation",
    seniority: "Senior Manager",
    sector: "Private Equity",
    location: "Naples",
    years_experience: 16,
    languages: "English (Full professional), French (Native), Italian (Native)",
    skills:
      "strategy & value creation, operating model transformation, business model transformation, profitable growth, pricing & margin management, innovation deployment, M&A, post-merger integration, scenario modelling, commercial policy design, market access",
    summary:
      "Senior Manager focused on Strategy & Value Creation. Helps CEOs deliver profitable growth through hands-on operating model and execution.",
    about:
      "Works with CEOs and executive teams to deliver profitable growth in complex, fast-changing environments. Co-creates strategy with clients, combining rigorous value-creation methodology with leadership team's vision. End-to-end ownership from strategic ideation through hands-on execution.",
    previous: "Luiss Business School (Visiting Lecturer), Finsoft, 3HORIZONS, 3H Partners, Pfizer",
    education:
      "ESCP Business School, MSc Diplôme de Grande Ecole / Diplom-Kaufmann / International Management (2004-2009); Università degli Studi di Napoli Federico II, Laurea Business Administration and Law (2001-2004)",
  },
  {
    name: "Maria Letizia Locapo",
    role: "Senior Manager · Fashion, Luxury & Retail",
    seniority: "Senior Manager",
    sector: "Fashion & Luxury",
    location: "Milan",
    years_experience: 9,
    languages: "English (Full professional), Italian (Native)",
    skills:
      "fashion strategy, luxury, retail, international management, strategy consulting, consumer goods",
    summary:
      "Senior Manager. Focus on Fashion, Luxury & Retail. Ex EY-Parthenon, ex Strategy&, ex P&G.",
    about:
      "Senior Manager at Impacta Strategy with focus on Fashion, Luxury & Retail. Background spans EY-Parthenon, PwC México (Strategy&) and Procter & Gamble.",
    previous: "EY-Parthenon, PwC México (Strategy&), Procter & Gamble",
    education:
      "Università Bocconi, MSc International Management (2015-2017); Universidade Católica Portuguesa, Exchange Program (2017)",
  },
  {
    name: "Scipione Della Chiesa d'Isasca",
    role: "Senior Manager · Innovation, Real Estate & Agribusiness",
    seniority: "Senior Manager",
    sector: null,
    location: "Milan",
    years_experience: 11,
    languages: "English (Full professional), French (Full professional), Italian (Native)",
    skills:
      "innovation and technology economics, real estate, agribusiness, strategy consulting, board advisory",
    summary:
      "Senior Manager. Cross-sector experience including Barone Ricasoli (Consigliere, ongoing), Strategy& and Klepierre.",
    about:
      "Senior Manager at Impacta Strategy. Cross-sector exposure spanning agribusiness (Barone Ricasoli — wine), retail real estate (Klepierre) and strategy consulting at Strategy&.",
    previous: "Barone Ricasoli S.p.A. Agricola (Consigliere, ongoing), Strategy&, KLEPIERRE",
    education:
      "Università Bocconi, MSc Economics and Management of Innovation and Technology (2013-2015); Sciences Po, MSc Exchange Program (2015)",
  },
  {
    name: "Alessandro De Marchis",
    role: "Manager · Strategy & Operations",
    seniority: "Manager",
    sector: null,
    location: "Italy",
    years_experience: 10,
    languages: "English (Professional working), Italian (Native)",
    skills:
      "management consulting, operations management, business management, strategy",
    summary: "Manager. Background spans Monitor Deloitte, BIP and Deloitte Italia, plus a founder stint.",
    about:
      "Manager at Impacta Strategy with consulting background at Monitor Deloitte, BIP and Deloitte Italia. Founder of Lowcostarredamenti.com.",
    previous: "Monitor Deloitte, BIP, Deloitte Italia, Lowcostarredamenti.com (Founder)",
    education:
      "The Wharton School, Operations Management (2020); Università degli studi Roma TRE, Laurea Magistrale LM in Scienze dell'Economia e della Gestione Aziendale (2014-2016)",
  },
  {
    name: "Filippo Maria Zanchi",
    role: "Senior Consultant · Strategy",
    seniority: "Senior Consultant",
    sector: null,
    location: "Milan",
    years_experience: 4,
    languages: "English (Full professional), French (Professional working), Italian (Native)",
    skills:
      "communication, financial modeling, problem solving, team building, business analysis, strategy",
    summary: "Senior Consultant. London Business School Master in Management. Ex Bain & Company.",
    about:
      "Driven and globally educated professional with a fervor for investment, strategic planning, and leadership. Demonstrated success in delivering tangible outcomes, navigating uncertainty, and employing analytical problem-solving.",
    previous: "Bain & Company, AIESEC in Italy",
    education:
      "London Business School, Master's in Management; Korea University, Exchange Semester",
  },
  {
    name: "Camilla Orazi",
    role: "Consultant · Fashion & Luxury",
    seniority: "Consultant",
    sector: "Fashion & Luxury",
    location: "Milan",
    years_experience: 5,
    languages: "English (Full professional), French (Limited working), Chinese (Elementary), Italian (Native)",
    skills:
      "management consulting, luxury retail, business management, fashion industry, strategy",
    summary: "Consultant. Bocconi grad. Ex EY-Parthenon, ex Louis Vuitton.",
    about:
      "Consultant at Impacta Strategy. Background includes EY-Parthenon and Louis Vuitton.",
    previous: "EY-Parthenon, Louis Vuitton, KYMA TEAM",
    education:
      "Università Bocconi, MSc Management (2019-2021); University of Deusto, Exchange Program (2018-2019)",
  },
  {
    name: "Ignazio Cimino",
    role: "Associate Consultant · Finance & PE",
    seniority: "Associate Consultant",
    sector: "Private Equity",
    location: "Naples",
    years_experience: 2,
    languages: "English (Full professional), French (Elementary), Italian (Native)",
    skills:
      "alternative investments, corporate finance, financial analysis, retail tech, M&A",
    summary:
      "Associate Consultant. Luiss + Federico II + Paris Dauphine. Ex P&G Alternative Investments, ex Amazon.",
    about:
      "Associate Consultant at Impacta Strategy. Education at Luiss, Federico II, and Paris Dauphine. Background in P&G SGR (alternative investments) and Amazon.",
    previous: "P&G SGR SpA, Amazon, Studio Legale Consales",
    education:
      "Luiss Guido Carli University, Master's Corporate Finance (2022-2024); Université Paris Dauphine - PSL, Master's Corporate Finance (Sep-Dec 2023)",
  },
];

function buildCvText(p: RealProfile): string {
  return `${p.name}
${p.role}
Impacta Strategy · ${p.location}

PROFILE
${p.about || p.summary}

EXPERIENCE
Impacta Strategy — ${p.seniority}
Previous: ${p.previous}

EDUCATION
${p.education}

LANGUAGES
${p.languages}

KEY SKILLS
${p.skills}
`;
}

// ---------- demo projects sized to the real team ----------
function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

interface DemoProject {
  name: string;
  client: string;
  sector: string;
  description: string;
  required_skills: string;
  start_offset_days: number;
  duration_days: number;
  slots: SlotInput[];
  prefillTopK?: number;
}

const TODAY = new Date().toISOString().slice(0, 10);

const DEMO_PROJECTS: DemoProject[] = [
  {
    name: "PE-backed luxury rollup CDD",
    client: "Apex Capital Partners",
    sector: "Fashion & Luxury",
    description:
      "Mid-market PE fund evaluating a buy-and-build of independent Italian luxury brands. Commercial due diligence covering brand positioning, wholesale strategy and DTC transformation potential, plus a value-creation hypothesis around clienteling and luxury pricing. Steering committee chaired by a Senior Partner.",
    required_skills:
      "commercial due diligence, brand positioning, DTC transformation, luxury pricing, wholesale strategy, value creation",
    start_offset_days: -7,
    duration_days: 42,
    slots: [
      { seniority: "Senior Partner", allocation_pct: 20, label: "Sponsor" },
      { seniority: "Senior Manager", allocation_pct: 80, label: "PM" },
      { seniority: "Senior Consultant", allocation_pct: 100 },
      { seniority: "Consultant", allocation_pct: 100 },
      { seniority: "Associate Consultant", allocation_pct: 100 },
    ],
    prefillTopK: 3,
  },
  {
    name: "Energy transition roadmap for Southern European utility",
    client: "Mediterraneo Energia",
    sector: "Energy & Utilities",
    description:
      "Top-down energy transition roadmap for a Southern European utility. Workstreams cover renewables financing, grid modernisation, hydrogen strategy and regulatory strategy, plus an EV infrastructure investment case.",
    required_skills:
      "energy transition, renewables financing, grid modernisation, hydrogen strategy, regulatory strategy, power systems, TSOs, DSOs",
    start_offset_days: 14,
    duration_days: 84,
    slots: [
      { seniority: "Senior Partner", allocation_pct: 25, label: "Sponsor" },
      { seniority: "Associate Partner", allocation_pct: 60, label: "Lead" },
      { seniority: "Senior Manager", allocation_pct: 100 },
      { seniority: "Manager", allocation_pct: 100 },
    ],
    prefillTopK: 2,
  },
  {
    name: "Retail value-creation plan for PE platform",
    client: "Carisma Impact (portfolio company)",
    sector: "Consumer Products & Retail",
    description:
      "Value-creation plan for a PE-backed consumer & retail platform. Covers commercial strategy, pricing & promotion, omnichannel rollout and a 100-day operational plan post-acquisition.",
    required_skills:
      "value creation, consumer strategy, retail strategy, pricing, omnichannel, post-merger integration, 100-day plan",
    start_offset_days: 0,
    duration_days: 56,
    slots: [
      { seniority: "Partner", allocation_pct: 20, label: "Sponsor" },
      { seniority: "Associate Partner", allocation_pct: 50, label: "Lead" },
      { seniority: "Senior Manager", allocation_pct: 100 },
      { seniority: "Consultant", allocation_pct: 100 },
    ],
    prefillTopK: 2,
  },
  {
    name: "Search fund advisory engagement",
    client: "LDue Capital co-investors",
    sector: "Private Equity",
    description:
      "Advisory engagement for a search fund evaluating mid-market Italian SMEs. Scope includes target screening, financial modelling and a commercial diligence on the shortlist of three opportunities.",
    required_skills:
      "search funds, M&A, target screening, financial modelling, commercial diligence, private equity, corporate finance",
    start_offset_days: 21,
    duration_days: 42,
    slots: [
      { seniority: "Senior Manager", allocation_pct: 60, label: "Lead" },
      { seniority: "Senior Consultant", allocation_pct: 100 },
      { seniority: "Associate Consultant", allocation_pct: 100 },
    ],
    // intentionally not prefilled — leaves open seats for the dashboard
  },
];

// ---------- main ----------
async function main() {
  try {
    mkdirSync(UPLOADS_DIR, { recursive: true });
  } catch {
    /* read-only fs is fine */
  }

  const db = await getDb();

  // Wipe prior data + any local CV files.
  const oldR = await db.execute("SELECT cv_file_path FROM consultants WHERE cv_file_path IS NOT NULL");
  for (const r of oldR.rows as unknown as Array<{ cv_file_path: string }>) {
    try { unlinkSync(join(UPLOADS_DIR, r.cv_file_path)); } catch { /* ignore */ }
  }
  try {
    for (const f of readdirSync(UPLOADS_DIR)) {
      if (f.endsWith(".txt") || f.endsWith(".pdf") || f.endsWith(".docx")) {
        try { unlinkSync(join(UPLOADS_DIR, f)); } catch { /* ignore */ }
      }
    }
  } catch { /* uploads dir may not exist */ }

  await db.execute("DELETE FROM staffings");
  await db.execute("DELETE FROM project_slots");
  await db.execute("DELETE FROM projects");
  await db.execute("DELETE FROM consultants");
  await db.execute(
    "DELETE FROM sqlite_sequence WHERE name IN ('consultants','projects','project_slots','staffings')",
  );

  // Insert real consultants.
  for (const p of PROFILES) {
    await createConsultant({
      name: p.name,
      email: null,
      role: p.role,
      seniority: p.seniority,
      sector: p.sector,
      location: p.location,
      years_experience: p.years_experience,
      languages: p.languages,
      skills: p.skills,
      summary: p.summary,
      cv_file_name: null,
      cv_file_path: null,
      cv_text: buildCvText(p),
    });
  }
  console.log(`Seeded ${PROFILES.length} real consultants.`);

  // Insert demo projects sized for the real team, prefill some staffings.
  let prefilledTotal = 0;
  for (const dp of DEMO_PROJECTS) {
    const start = addDays(TODAY, dp.start_offset_days);
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

    const projectR = await db.execute({
      sql: "SELECT * FROM projects WHERE id = :id",
      args: { id: projectId },
    });
    const project = projectR.rows[0] as unknown as Parameters<typeof buildRecommendationContext>[0];
    const ctx = await buildRecommendationContext(project);
    const slotPairs = await getProjectSlots(projectId);
    const used: number[] = [];
    let n = 0;
    for (const sp of slotPairs) {
      if (n >= dp.prefillTopK) break;
      const recs = await recommendForSlot(sp.slot, ctx, { excludeConsultantIds: used, limit: 1 });
      if (recs.length === 0) continue;
      try {
        await staffSlot(sp.slot.id, recs[0]!.consultant.id);
        used.push(recs[0]!.consultant.id);
        n += 1;
        prefilledTotal += 1;
      } catch {
        // over-allocation guard; skip
      }
    }
  }
  console.log(`Seeded ${DEMO_PROJECTS.length} projects with ${prefilledTotal} pre-filled staffings.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
