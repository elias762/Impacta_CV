import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  buildRecommendationContext,
  deleteProject,
  getProject,
  getProjectSlots,
  recommendForSlot,
  staffSlot,
  unstaffSlot,
} from "@/lib/projects";

export const dynamic = "force-dynamic";

async function staffAction(formData: FormData) {
  "use server";
  const slotId = Number(formData.get("slot_id"));
  const consultantId = Number(formData.get("consultant_id"));
  const projectId = Number(formData.get("project_id"));
  if (!slotId || !consultantId) throw new Error("Missing slot or consultant id");
  await staffSlot(slotId, consultantId);
  revalidatePath(`/projects/${projectId}`);
}

async function unstaffAction(formData: FormData) {
  "use server";
  const staffingId = Number(formData.get("staffing_id"));
  const projectId = Number(formData.get("project_id"));
  if (!staffingId) return;
  await unstaffSlot(staffingId);
  revalidatePath(`/projects/${projectId}`);
}

async function deleteProjectAction(formData: FormData) {
  "use server";
  const id = Number(formData.get("id"));
  if (!id) return;
  await deleteProject(id);
  redirect("/projects");
}

export default async function ProjectDetail({ params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (!Number.isFinite(id)) notFound();
  const project = await getProject(id);
  if (!project) notFound();

  const slots = await getProjectSlots(id);
  const ctx = await buildRecommendationContext(project);
  const filledIds = slots.flatMap((s) => (s.assignment ? [s.assignment.consultant_id] : []));

  // Pre-fetch recommendations for every open slot so the JSX stays sync.
  const recsBySlot = new Map<number, Awaited<ReturnType<typeof recommendForSlot>>>();
  for (const s of slots) {
    if (!s.assignment) {
      recsBySlot.set(s.slot.id, await recommendForSlot(s.slot, ctx, { excludeConsultantIds: filledIds }));
    }
  }

  const filled = slots.filter((s) => s.assignment).length;
  const total = slots.length;

  return (
    <div className="space-y-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <Link href="/projects" className="text-impacta text-sm hover:underline">
            Back to projects
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{project.name}</h1>
          <p className="text-sm text-slate-600">
            {[project.client, project.sector].filter(Boolean).join(" · ")} ·{" "}
            <span className="text-slate-500">
              {project.start_date} – {project.end_date}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-xs uppercase tracking-wide text-slate-500">Staffed</div>
            <div className="text-lg font-semibold">
              {filled}/{total}
            </div>
          </div>
          <form action={deleteProjectAction}>
            <input type="hidden" name="id" value={project.id} />
            <button className="rounded border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50">
              Delete
            </button>
          </form>
        </div>
      </header>

      {(project.description || project.required_skills) && (
        <section className="rounded-lg border bg-white p-5 text-sm shadow-sm">
          {project.required_skills && (
            <>
              <div className="text-xs uppercase tracking-wide text-slate-500">Required skills</div>
              <div className="mt-1 flex flex-wrap gap-1">
                {project.required_skills.split(",").map((s) => (
                  <span key={s} className="bg-impacta/5 text-impacta rounded px-2 py-0.5 text-xs">
                    {s.trim()}
                  </span>
                ))}
              </div>
            </>
          )}
          {project.description && (
            <>
              <div className="mt-3 text-xs uppercase tracking-wide text-slate-500">Description</div>
              <p className="mt-1 whitespace-pre-wrap text-slate-700">{project.description}</p>
            </>
          )}
          {ctx.description_keywords.length > 0 && (
            <div className="mt-3 text-xs text-slate-500">
              Auto-extracted skill keywords:{" "}
              {ctx.description_keywords.map((k) => (
                <span key={k} className="mr-1 rounded bg-slate-100 px-1.5 py-0.5 text-slate-700">
                  {k}
                </span>
              ))}
            </div>
          )}
        </section>
      )}

      <section>
        <h2 className="text-lg font-semibold tracking-tight">Team</h2>
        <p className="text-sm text-slate-500">
          For each open slot the engine shows the top-5 candidates from the pool, filtered by availability over the project window.
        </p>

        <div className="mt-4 space-y-4">
          {slots.map((s) => {
            if (s.assignment) {
              return (
                <FilledSlot
                  key={s.slot.id}
                  projectId={project.id}
                  slot={s.slot}
                  assignment={s.assignment}
                />
              );
            }
            const recs = recsBySlot.get(s.slot.id) ?? [];
            return (
              <OpenSlot
                key={s.slot.id}
                projectId={project.id}
                slot={s.slot}
                recs={recs}
              />
            );
          })}
        </div>
      </section>
    </div>
  );
}

function FilledSlot({
  projectId,
  slot,
  assignment,
}: {
  projectId: number;
  slot: { id: number; seniority: string; allocation_pct: number; label: string | null };
  assignment: {
    staffing_id: number;
    consultant_id: number;
    consultant_name: string;
    consultant_role: string | null;
    consultant_sector: string | null;
    allocation_pct: number;
  };
}) {
  return (
    <div className="rounded-lg border-l-4 border-l-green-500 border bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">
            {slot.seniority} · {slot.allocation_pct}%{slot.label ? ` · ${slot.label}` : ""}
          </div>
          <Link
            href={`/consultants/${assignment.consultant_id}`}
            target="_blank"
            rel="noreferrer"
            title="Open CV in a new tab"
            className="text-impacta text-base font-semibold hover:underline"
          >
            {assignment.consultant_name}
          </Link>
          <div className="text-xs text-slate-500">
            {assignment.consultant_role ?? "—"} · {assignment.consultant_sector ?? "—"}
          </div>
        </div>
        <form action={unstaffAction}>
          <input type="hidden" name="staffing_id" value={assignment.staffing_id} />
          <input type="hidden" name="project_id" value={projectId} />
          <button className="rounded border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-100">
            Unstaff
          </button>
        </form>
      </div>
    </div>
  );
}

function OpenSlot({
  projectId,
  slot,
  recs,
}: {
  projectId: number;
  slot: { id: number; seniority: string; allocation_pct: number; label: string | null };
  recs: Array<{
    consultant: { id: number; name: string; role: string | null; sector: string | null };
    score: number;
    current_allocation: number;
    matched_skills: string[];
    matched_keywords: string[];
    sector_match: boolean;
  }>;
}) {
  return (
    <div className="rounded-lg border-l-4 border-l-amber-400 border bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wide text-slate-500">
          Open · {slot.seniority} · {slot.allocation_pct}%{slot.label ? ` · ${slot.label}` : ""}
        </div>
        <span className="text-xs text-amber-700">{recs.length} candidate{recs.length === 1 ? "" : "s"} available</span>
      </div>

      {recs.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">
          No available consultants at this seniority for the project window. Adjust the dates or lower the allocation.
        </p>
      ) : (
        <ol className="mt-3 space-y-2">
          {recs.map((r, i) => (
            <li
              key={r.consultant.id}
              className="flex items-start justify-between gap-3 rounded border border-slate-200 p-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-slate-400">#{i + 1}</span>
                  <Link
                    href={`/consultants/${r.consultant.id}`}
                    target="_blank"
                    rel="noreferrer"
                    title="Open CV in a new tab"
                    className="text-impacta font-medium hover:underline"
                  >
                    {r.consultant.name}
                  </Link>
                  <span className="bg-impacta/10 text-impacta rounded px-1.5 py-0.5 text-xs font-medium">
                    score {r.score}
                  </span>
                  {r.sector_match && (
                    <span className="rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-800">
                      sector match
                    </span>
                  )}
                  <span className="text-xs text-slate-500">
                    currently {r.current_allocation}% allocated
                  </span>
                </div>
                <div className="mt-0.5 text-xs text-slate-500">
                  {r.consultant.role ?? "—"} · {r.consultant.sector ?? "—"}
                </div>
                {(r.matched_skills.length > 0 || r.matched_keywords.length > 0) && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {r.matched_skills.map((s) => (
                      <span key={`s-${s}`} className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-900">
                        {s}
                      </span>
                    ))}
                    {r.matched_keywords.map((k) => (
                      <span key={`k-${k}`} className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">
                        {k}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <form action={staffAction}>
                <input type="hidden" name="slot_id" value={slot.id} />
                <input type="hidden" name="consultant_id" value={r.consultant.id} />
                <input type="hidden" name="project_id" value={projectId} />
                <button className="bg-impacta-accent text-impacta rounded px-3 py-1.5 text-xs font-medium hover:opacity-90">
                  Staff
                </button>
              </form>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
