import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { unlink } from "node:fs/promises";
import { join } from "node:path";
import { deleteConsultant, getConsultant } from "@/lib/consultants";
import { UPLOADS_DIR } from "@/lib/db-path";
import { currentUtilizationPct, listConsultantStaffings } from "@/lib/availability";

export const dynamic = "force-dynamic";

async function deleteAction(formData: FormData) {
  "use server";
  const id = Number(formData.get("id"));
  if (!Number.isFinite(id)) return;
  const removed = await deleteConsultant(id);
  if (removed?.cv_file_path) {
    await unlink(join(UPLOADS_DIR, removed.cv_file_path)).catch(() => {});
  }
  redirect("/consultants");
}

export default async function ConsultantDetail({ params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (!Number.isFinite(id)) notFound();
  const c = await getConsultant(id);
  if (!c) notFound();

  const staffings = await listConsultantStaffings(c.id);
  const utilization = await currentUtilizationPct(c.id);
  const utilColor =
    utilization >= 100
      ? "bg-red-100 text-red-800"
      : utilization >= 70
      ? "bg-amber-100 text-amber-800"
      : utilization > 0
      ? "bg-green-100 text-green-800"
      : "bg-slate-100 text-slate-700";

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-start justify-between">
        <div>
          <Link href="/consultants" className="text-impacta text-sm hover:underline">
            Back to consultants
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{c.name}</h1>
          <p className="text-sm text-slate-600">
            {[c.role, c.seniority, c.sector, c.location].filter(Boolean).join(" · ") || "No metadata"}
          </p>
          <div className="mt-2">
            <span className={`rounded px-2 py-0.5 text-xs font-medium ${utilColor}`}>
              {utilization}% currently allocated
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          {c.cv_file_path && (
            <a
              href={`/api/cv/${c.id}`}
              className="bg-impacta-accent text-impacta rounded px-3 py-1.5 text-sm font-medium hover:opacity-90"
            >
              Download CV
            </a>
          )}
          <form action={deleteAction}>
            <input type="hidden" name="id" value={c.id} />
            <button className="rounded border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50">
              Delete
            </button>
          </form>
        </div>
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 rounded-lg border bg-white p-6 text-sm shadow-sm">
        <Detail label="Email" value={c.email} />
        <Detail label="Years of experience" value={c.years_experience?.toString() ?? null} />
        <Detail label="Languages" value={c.languages} />
        <Detail label="Skills" value={c.skills} full />
        <Detail label="Summary" value={c.summary} full multiline />
        <Detail label="CV file" value={c.cv_file_name} />
        <Detail label="Added" value={c.created_at} />
      </dl>

      <section className="mt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Staffings</h2>
        {staffings.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">Not staffed on any project right now.</p>
        ) : (
          <ul className="mt-2 divide-y rounded-lg border bg-white text-sm shadow-sm">
            {staffings.map((s) => (
              <li key={s.staffing_id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <Link
                    href={`/projects/${s.project_id}`}
                    className="text-impacta font-medium hover:underline"
                  >
                    {s.project_name}
                  </Link>
                  <div className="text-xs text-slate-500">
                    {s.client ?? "—"} · {s.seniority}
                    {s.slot_label ? ` · ${s.slot_label}` : ""}
                  </div>
                </div>
                <div className="text-right text-xs text-slate-600">
                  <div className="font-medium text-slate-900">{s.allocation_pct}%</div>
                  <div>
                    {s.start_date} – {s.end_date}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {c.cv_text && (
        <details className="mt-4 rounded-lg border bg-white p-4 text-sm shadow-sm">
          <summary className="cursor-pointer text-slate-700">Extracted CV text (used for search)</summary>
          <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap text-xs text-slate-600">
            {c.cv_text}
          </pre>
        </details>
      )}
    </div>
  );
}

function Detail({
  label,
  value,
  full,
  multiline,
}: {
  label: string;
  value: string | null;
  full?: boolean;
  multiline?: boolean;
}) {
  return (
    <div className={full ? "col-span-2" : ""}>
      <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className={`mt-1 text-slate-900 ${multiline ? "whitespace-pre-wrap" : ""}`}>
        {value ?? <span className="text-slate-400">—</span>}
      </dd>
    </div>
  );
}
