import { NextRequest, NextResponse } from "next/server";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { join, extname } from "node:path";
import { Readable } from "node:stream";
import { getConsultant } from "@/lib/consultants";
import { UPLOADS_DIR } from "@/lib/db-path";

const MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".txt": "text/plain; charset=utf-8",
};

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (!Number.isFinite(id)) return new NextResponse("Bad id", { status: 400 });

  const c = await getConsultant(id);
  if (!c || !c.cv_file_path) return new NextResponse("Not found", { status: 404 });

  const fullPath = join(UPLOADS_DIR, c.cv_file_path);
  try {
    await stat(fullPath);
  } catch {
    return new NextResponse("File missing", { status: 404 });
  }

  const ext = extname(c.cv_file_name ?? c.cv_file_path).toLowerCase();
  const mime = MIME[ext] ?? "application/octet-stream";
  const downloadName = c.cv_file_name ?? `cv-${id}${ext}`;

  const stream = Readable.toWeb(createReadStream(fullPath)) as ReadableStream<Uint8Array>;
  return new NextResponse(stream, {
    headers: {
      "Content-Type": mime,
      "Content-Disposition": `attachment; filename="${downloadName.replace(/"/g, "")}"`,
    },
  });
}
