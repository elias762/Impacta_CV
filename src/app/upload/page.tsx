import { redirect } from "next/navigation";
import { mkdir, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { createConsultant, SECTORS, SENIORITIES } from "@/lib/consultants";
import { UPLOADS_DIR } from "@/lib/db-path";
import { extractCvText, isAllowedCvFile } from "@/lib/cv-extract";

async function uploadAction(formData: FormData) {
  "use server";

  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Name is required");

  const file = formData.get("cv") as File | null;
  let cvFileName: string | null = null;
  let cvFilePath: string | null = null;
  let cvText: string | null = null;

  if (file && file.size > 0) {
    if (!isAllowedCvFile(file.name)) {
      throw new Error("CV must be a PDF, DOCX, or TXT file");
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    cvFileName = file.name;
    cvText = await extractCvText(buffer, file.name);
    // Filesystem writes only succeed where the runtime is writable (local dev,
    // Fly/Railway with a disk). Vercel serverless is read-only — we skip the
    // file persistence in that case but still keep the extracted text in the DB.
    try {
      await mkdir(UPLOADS_DIR, { recursive: true });
      const ext = extname(file.name) || ".bin";
      const stored = `${randomUUID()}${ext}`;
      await writeFile(join(UPLOADS_DIR, stored), buffer);
      cvFilePath = stored;
    } catch (err) {
      console.warn("CV file storage skipped (read-only filesystem?):", (err as Error).message);
    }
  }

  const yearsRaw = String(formData.get("years_experience") ?? "").trim();
  const years = yearsRaw === "" ? null : Number.parseInt(yearsRaw, 10);

  const id = await createConsultant({
    name,
    email: orNull(formData.get("email")),
    role: orNull(formData.get("role")),
    seniority: orNull(formData.get("seniority")),
    sector: orNull(formData.get("sector")),
    location: orNull(formData.get("location")),
    years_experience: Number.isFinite(years as number) ? (years as number) : null,
    languages: orNull(formData.get("languages")),
    skills: orNull(formData.get("skills")),
    summary: orNull(formData.get("summary")),
    cv_file_name: cvFileName,
    cv_file_path: cvFilePath,
    cv_text: cvText,
  });

  redirect(`/consultants/${id}`);
}

function orNull(v: FormDataEntryValue | null): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

export default function UploadPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight">Add a consultant CV</h1>
      <p className="mt-1 text-sm text-slate-600">
        Upload the CV file and capture the structured fields used by search and proposal staffing.
      </p>

      <form action={uploadAction} className="mt-6 space-y-5 rounded-lg border bg-white p-6 shadow-sm">
        <Field label="Full name" name="name" required />
        <div className="grid grid-cols-2 gap-4">
          <Field label="Email" name="email" type="email" />
          <Field label="Location" name="location" placeholder="Milan, Rome, …" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Role" name="role" placeholder="Strategy Consultant" />
          <Select label="Seniority" name="seniority" options={SENIORITIES} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Select label="Primary sector" name="sector" options={SECTORS} />
          <Field label="Years of experience" name="years_experience" type="number" min="0" />
        </div>
        <Field label="Languages" name="languages" placeholder="Italian (native), English (C2), French (B2)" />
        <Field label="Skills" name="skills" placeholder="Comma-separated: PE due diligence, pricing, M&A" />
        <Textarea label="Summary" name="summary" rows={4} placeholder="Short bio used in proposal CV bundles" />

        <div>
          <label className="block text-sm font-medium">CV file (PDF, DOCX, TXT)</label>
          <input
            type="file"
            name="cv"
            accept=".pdf,.docx,.txt"
            className="mt-1 block w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm"
          />
          <p className="mt-1 text-xs text-slate-500">
            Text content is extracted on upload to enable full-text search.
          </p>
        </div>

        <div className="flex justify-end gap-3">
          <a href="/consultants" className="rounded border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100">
            Cancel
          </a>
          <button
            type="submit"
            className="bg-impacta hover:bg-impacta/90 rounded px-4 py-2 text-sm font-medium text-white"
          >
            Save consultant
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  name,
  type = "text",
  required,
  placeholder,
  min,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  min?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium" htmlFor={name}>
        {label} {required && <span className="text-red-600">*</span>}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        min={min}
        className="focus:border-impacta focus:ring-impacta mt-1 block w-full rounded border border-slate-300 px-3 py-2 text-sm shadow-sm focus:ring-1"
      />
    </div>
  );
}

function Textarea({
  label,
  name,
  rows = 3,
  placeholder,
}: {
  label: string;
  name: string;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium" htmlFor={name}>
        {label}
      </label>
      <textarea
        id={name}
        name={name}
        rows={rows}
        placeholder={placeholder}
        className="focus:border-impacta focus:ring-impacta mt-1 block w-full rounded border border-slate-300 px-3 py-2 text-sm shadow-sm focus:ring-1"
      />
    </div>
  );
}

function Select({
  label,
  name,
  options,
}: {
  label: string;
  name: string;
  options: readonly string[];
}) {
  return (
    <div>
      <label className="block text-sm font-medium" htmlFor={name}>
        {label}
      </label>
      <select
        id={name}
        name={name}
        defaultValue=""
        className="focus:border-impacta focus:ring-impacta mt-1 block w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:ring-1"
      >
        <option value="">—</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}
