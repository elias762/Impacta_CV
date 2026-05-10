import { NextRequest, NextResponse } from "next/server";
import { createProject, SlotInput } from "@/lib/projects";
import { SECTORS, SENIORITIES } from "@/lib/consultants";

export const runtime = "nodejs";

interface CreateBody {
  name: string;
  client?: string | null;
  sector?: string | null;
  description?: string | null;
  required_skills?: string[];
  start_date: string;
  end_date: string;
  team: Array<{ seniority: string; headcount: number; allocation_pct: number; rationale?: string }>;
}

export async function POST(req: NextRequest) {
  let body: CreateBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (!body.start_date || !body.end_date) return NextResponse.json({ error: "Dates are required" }, { status: 400 });
  if (body.start_date > body.end_date) return NextResponse.json({ error: "Start must be on/before end" }, { status: 400 });
  if (body.sector && !(SECTORS as readonly string[]).includes(body.sector)) {
    return NextResponse.json({ error: "Unknown sector" }, { status: 400 });
  }

  const slots: SlotInput[] = [];
  for (const t of body.team ?? []) {
    if (!(SENIORITIES as readonly string[]).includes(t.seniority)) continue;
    const head = Math.max(1, Math.min(5, Math.floor(t.headcount || 1)));
    const alloc = Math.max(1, Math.min(100, Math.floor(t.allocation_pct || 100)));
    for (let i = 0; i < head; i++) {
      slots.push({
        seniority: t.seniority,
        allocation_pct: alloc,
        label: head > 1 ? `#${i + 1}` : null,
      });
    }
  }
  if (slots.length === 0) return NextResponse.json({ error: "At least one slot is required" }, { status: 400 });

  const id = createProject(
    {
      name: body.name.trim(),
      client: body.client?.trim() || null,
      sector: body.sector || null,
      description: body.description?.trim() || null,
      required_skills: (body.required_skills ?? []).map((s) => s.trim()).filter(Boolean).join(", ") || null,
      start_date: body.start_date,
      end_date: body.end_date,
    },
    slots,
  );

  return NextResponse.json({ id });
}
