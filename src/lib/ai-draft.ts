import Anthropic from "@anthropic-ai/sdk";
import { SECTORS, SENIORITIES } from "./consultants";

export interface ProjectDraft {
  name: string;
  client: string | null;
  sector: (typeof SECTORS)[number] | null;
  duration_weeks: number;
  required_skills: string[];
  summary: string;
  team: Array<{
    seniority: (typeof SENIORITIES)[number];
    headcount: number;
    allocation_pct: number;
    rationale: string;
  }>;
  source: "claude" | "heuristic";
}

export interface BriefingInput {
  description: string;
  clientUrl?: { url: string; title: string | null; text: string } | null;
  attachments?: Array<{ filename: string; text: string }>;
}

const SYSTEM_PROMPT = `You are the staffing assistant for Impacta Strategy, an Italian strategy consulting firm.

Impacta covers exactly six sectors:
- Consumer Products & Retail
- Energy & Utilities
- Fashion & Luxury
- Financial Services
- Industrial Goods & Services
- Private Equity

Impacta uses these seniority levels (top to bottom):
Partner, Principal, Senior Manager, Manager, Senior Consultant, Consultant, Associate, Analyst.

Your job: read a project briefing (which may include a free-text description, the client's website text, and attached documents) and return a draft staffing plan as STRICT JSON.

Reference team shapes (use as guidance, not rules):
- 4–6 week diagnostic / commercial due diligence: 1 Partner @20%, 1 Manager @80% (PM), 1 Senior Consultant @100%, 1 Consultant @100%, 1 Analyst @100%
- 8–12 week strategy / transformation: 1 Principal @25–30%, 1 Senior Manager @50–70%, 2 Senior Consultants @100%, 1–2 Consultants @100%, 1 Analyst @100%
- 12+ week implementation: heavier on Managers and Senior Consultants, add Associates
- PE engagements skew leaner and faster; transformation/implementation engagements skew longer and broader

Rules for the JSON:
- Pick exactly one of the six sectors (or null if truly unclear)
- duration_weeks: integer between 2 and 26
- team: 3–6 entries, each with a known seniority, headcount 1–3, allocation_pct 10–100
- required_skills: 3–8 short phrases, written like consulting capability tags (e.g. "commercial due diligence", "pricing & promo")
- name: a short engagement title (max ~70 chars)
- client: the client name if you can determine it from the briefing or website, else null
- summary: 1–2 sentence engagement summary

Return ONLY the JSON object. No prose, no markdown, no code fences.`;

const RESPONSE_SHAPE = `{
  "name": string,
  "client": string | null,
  "sector": one of the six sectors or null,
  "duration_weeks": integer 2..26,
  "required_skills": string[],
  "summary": string,
  "team": [{ "seniority": string, "headcount": integer, "allocation_pct": integer, "rationale": string }]
}`;

function buildUserMessage(input: BriefingInput): string {
  const parts: string[] = [];
  if (input.description?.trim()) {
    parts.push(`# Briefing\n${input.description.trim()}`);
  }
  if (input.clientUrl?.text) {
    parts.push(
      `# Client website (${input.clientUrl.url}${input.clientUrl.title ? " — " + input.clientUrl.title : ""})\n${input.clientUrl.text}`,
    );
  }
  if (input.attachments?.length) {
    for (const a of input.attachments) {
      parts.push(`# Attached document: ${a.filename}\n${a.text}`);
    }
  }
  parts.push(`# Output\nReturn JSON matching this shape exactly:\n${RESPONSE_SHAPE}`);
  return parts.join("\n\n");
}

// --- Claude path -----------------------------------------------------------

async function generateWithClaude(input: BriefingInput): Promise<ProjectDraft> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" }, // sector list, seniorities and team shapes are stable across calls
      },
    ],
    messages: [
      {
        role: "user",
        content: buildUserMessage(input),
      },
    ],
  });

  const textBlock = message.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") throw new Error("Empty Claude response");
  return parseDraft(textBlock.text, "claude");
}

function parseDraft(raw: string, source: ProjectDraft["source"]): ProjectDraft {
  // tolerate models occasionally wrapping in code fences
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const parsed = JSON.parse(cleaned);

  const sector = SECTORS.includes(parsed.sector) ? parsed.sector : null;
  const team = Array.isArray(parsed.team)
    ? parsed.team
        .filter((t: { seniority: string }) => SENIORITIES.includes(t.seniority as (typeof SENIORITIES)[number]))
        .map((t: { seniority: string; headcount: unknown; allocation_pct: unknown; rationale: unknown }) => ({
          seniority: t.seniority as (typeof SENIORITIES)[number],
          headcount: clampInt(t.headcount, 1, 5, 1),
          allocation_pct: clampInt(t.allocation_pct, 10, 100, 100),
          rationale: typeof t.rationale === "string" ? t.rationale : "",
        }))
    : [];

  return {
    name: typeof parsed.name === "string" ? parsed.name.slice(0, 120) : "Untitled engagement",
    client: typeof parsed.client === "string" ? parsed.client : null,
    sector,
    duration_weeks: clampInt(parsed.duration_weeks, 2, 26, 6),
    required_skills: Array.isArray(parsed.required_skills)
      ? parsed.required_skills.filter((s: unknown): s is string => typeof s === "string").slice(0, 12)
      : [],
    summary: typeof parsed.summary === "string" ? parsed.summary : "",
    team,
    source,
  };
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === "number" ? v : Number.parseInt(String(v), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

// --- Heuristic fallback ----------------------------------------------------

function classifySector(text: string): (typeof SECTORS)[number] | null {
  const t = text.toLowerCase();
  const buckets: Array<{ sector: (typeof SECTORS)[number]; keywords: string[] }> = [
    { sector: "Private Equity", keywords: ["due diligence", "cdd", "lbo", "buy-and-build", "carve-out", "value creation", "portfolio company", "pe fund"] },
    { sector: "Fashion & Luxury", keywords: ["luxury", "maison", "fashion", "leather", "eyewear", "boutique", "couture", "clienteling"] },
    { sector: "Energy & Utilities", keywords: ["energy", "renewable", "grid", "utility", "utilities", "hydrogen", "ev infrastructure", "tso", "power"] },
    { sector: "Financial Services", keywords: ["bank", "banking", "insurance", "wealth", "asset management", "fintech", "open banking", "credit"] },
    { sector: "Industrial Goods & Services", keywords: ["industrial", "manufactur", "machinery", "automotive", "aerospace", "plant", "lean", "industry 4.0"] },
    { sector: "Consumer Products & Retail", keywords: ["retail", "fmcg", "consumer", "grocer", "shopper", "category", "private label", "loyalty"] },
  ];
  for (const b of buckets) if (b.keywords.some((k) => t.includes(k))) return b.sector;
  return null;
}

function inferDurationWeeks(text: string): number {
  const t = text.toLowerCase();
  if (!t.trim()) return 0;
  if (t.includes("diagnostic") || t.includes("rapid assessment")) return 4;
  if (t.includes("due diligence") || t.includes("cdd")) return 6;
  if (t.includes("transformation") || t.includes("implementation")) return 14;
  if (t.includes("strategy") || t.includes("roadmap")) return 10;
  return 8;
}

function defaultTeamFor(sector: (typeof SECTORS)[number] | null, weeks: number): ProjectDraft["team"] {
  const isShort = weeks <= 6;
  const isPE = sector === "Private Equity";
  if (isPE || isShort) {
    return [
      { seniority: "Partner", headcount: 1, allocation_pct: 20, rationale: "Sponsor and quality-assurance" },
      { seniority: "Manager", headcount: 1, allocation_pct: 80, rationale: "PM and primary client interface" },
      { seniority: "Senior Consultant", headcount: 1, allocation_pct: 100, rationale: "Workstream lead" },
      { seniority: "Consultant", headcount: 1, allocation_pct: 100, rationale: "Analytics and content" },
      { seniority: "Analyst", headcount: 1, allocation_pct: 100, rationale: "Research and modelling" },
    ];
  }
  return [
    { seniority: "Principal", headcount: 1, allocation_pct: 30, rationale: "Lead and senior client relationship" },
    { seniority: "Senior Manager", headcount: 1, allocation_pct: 60, rationale: "Day-to-day program lead" },
    { seniority: "Senior Consultant", headcount: 2, allocation_pct: 100, rationale: "Workstream leads" },
    { seniority: "Consultant", headcount: 2, allocation_pct: 100, rationale: "Execution capacity" },
    { seniority: "Analyst", headcount: 1, allocation_pct: 100, rationale: "Research and modelling" },
  ];
}

function extractRequiredSkills(text: string, vocabulary: string[]): string[] {
  const lower = text.toLowerCase();
  const hits = new Set<string>();
  for (const v of vocabulary) {
    if (v.length < 4) continue;
    if (lower.includes(v.toLowerCase())) hits.add(v);
    if (hits.size >= 8) break;
  }
  return Array.from(hits);
}

export function generateHeuristicDraft(input: BriefingInput, skillVocabulary: string[]): ProjectDraft {
  const description = input.description ?? "";
  const supplementary = [
    input.clientUrl?.text ?? "",
    ...(input.attachments?.map((a) => a.text) ?? []),
  ].join("\n");
  const blob = `${description}\n${supplementary}`.slice(0, 30_000);

  // Trust the user's own briefing first — the client website often lists every sector and confuses keyword classifiers.
  const sector = classifySector(description) ?? classifySector(blob);
  const weeks = inferDurationWeeks(description) || inferDurationWeeks(blob);
  // Skills: vocabulary hits that appear in the description rank ahead of those only in URL/attachment text.
  const primarySkills = extractRequiredSkills(description, skillVocabulary);
  const fallbackSkills = primarySkills.length >= 4 ? [] : extractRequiredSkills(supplementary, skillVocabulary);
  const skills = Array.from(new Set([...primarySkills, ...fallbackSkills])).slice(0, 8);

  // try to lift a client name from the URL title or first line of description
  const client = input.clientUrl?.title?.split(/[|·\-—]/)[0]?.trim() ?? null;

  const summary =
    input.description?.split(/(?<=[.!?])\s+/).slice(0, 2).join(" ").slice(0, 280) ||
    "Engagement drafted from the provided briefing.";

  const namePieces = [
    sector ? sector.split(" ")[0] : null,
    weeks <= 6 ? "diagnostic" : weeks >= 12 ? "transformation" : "strategy",
    client ? `for ${client}` : null,
  ].filter(Boolean);
  const name = namePieces.join(" ").slice(0, 70) || "New engagement";

  return {
    name,
    client,
    sector,
    duration_weeks: weeks,
    required_skills: skills,
    summary,
    team: defaultTeamFor(sector, weeks),
    source: "heuristic",
  };
}

// --- Orchestrator ----------------------------------------------------------

export async function generateProjectDraft(
  input: BriefingInput,
  skillVocabulary: string[],
): Promise<ProjectDraft> {
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      return await generateWithClaude(input);
    } catch (err) {
      console.error("Claude draft generation failed, falling back to heuristic:", err);
    }
  }
  return generateHeuristicDraft(input, skillVocabulary);
}
