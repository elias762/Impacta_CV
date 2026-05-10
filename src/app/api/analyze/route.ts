import { NextRequest, NextResponse } from "next/server";
import { extractCvText, isAllowedCvFile } from "@/lib/cv-extract";
import { fetchUrlAsText } from "@/lib/url-fetch";
import { generateProjectDraft, BriefingInput } from "@/lib/ai-draft";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function uniqueSkillVocabulary(): Promise<string[]> {
  const db = await getDb();
  const r = await db.execute("SELECT skills FROM consultants WHERE skills IS NOT NULL");
  const set = new Set<string>();
  for (const row of r.rows as unknown as Array<{ skills: string }>) {
    for (const s of row.skills.split(",")) {
      const t = s.trim();
      if (t.length >= 3) set.add(t);
    }
  }
  return Array.from(set);
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const description = String(form.get("description") ?? "").trim();
    const clientUrlRaw = String(form.get("client_url") ?? "").trim();
    const files = form.getAll("files").filter((f): f is File => f instanceof File);

    const briefing: BriefingInput = { description };
    const sourceNotes: string[] = [];

    if (clientUrlRaw) {
      try {
        const fetched = await fetchUrlAsText(clientUrlRaw);
        briefing.clientUrl = fetched;
        sourceNotes.push(`fetched ${fetched.url}${fetched.title ? ` ("${fetched.title}")` : ""}`);
      } catch (e) {
        sourceNotes.push(`URL fetch failed: ${(e as Error).message}`);
      }
    }

    if (files.length) {
      briefing.attachments = [];
      for (const f of files) {
        if (!f.size || !isAllowedCvFile(f.name)) continue;
        const buf = Buffer.from(await f.arrayBuffer());
        const text = await extractCvText(buf, f.name);
        if (text) {
          briefing.attachments.push({ filename: f.name, text });
          sourceNotes.push(`extracted ${text.length} chars from ${f.name}`);
        } else {
          sourceNotes.push(`could not extract text from ${f.name}`);
        }
      }
    }

    if (!description && !briefing.clientUrl && !(briefing.attachments && briefing.attachments.length)) {
      return NextResponse.json(
        { error: "Provide at least a description, a client URL, or an attachment" },
        { status: 400 },
      );
    }

    const draft = await generateProjectDraft(briefing, await uniqueSkillVocabulary());
    return NextResponse.json({ draft, sources: sourceNotes });
  } catch (err) {
    console.error("/api/analyze failed:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
