import Link from "next/link";
import { listProjects, projectFillStats } from "@/lib/projects";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const projects = await listProjects();
  const statEntries = await Promise.all(
    projects.map(async (p) => [p.id, await projectFillStats(p.id)] as const),
  );
  const stats = new Map(statEntries);

  return (
    <div>
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="text-sm text-slate-600">{projects.length} project{projects.length === 1 ? "" : "s"}</p>
        </div>
        <Link
          href="/projects/new"
          className="bg-impacta hover:bg-impacta/90 rounded px-4 py-2 text-sm font-medium text-white"
        >
          + New project
        </Link>
      </div>

      <div className="mt-6 overflow-hidden rounded-lg border bg-white shadow-sm">
        {projects.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            No projects yet. <Link className="text-impacta underline" href="/projects/new">Start the first one</Link>.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2">Project</th>
                <th className="px-4 py-2">Client</th>
                <th className="px-4 py-2">Sector</th>
                <th className="px-4 py-2">Period</th>
                <th className="px-4 py-2">Staffing</th>
                <th className="px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => {
                const s = stats.get(p.id) ?? { total: 0, filled: 0 };
                const pct = s.total === 0 ? 0 : Math.round((s.filled / s.total) * 100);
                return (
                  <tr key={p.id} className="border-t hover:bg-slate-50">
                    <td className="px-4 py-2">
                      <Link href={`/projects/${p.id}`} className="text-impacta font-medium hover:underline">
                        {p.name}
                      </Link>
                    </td>
                    <td className="px-4 py-2">{p.client ?? "—"}</td>
                    <td className="px-4 py-2">{p.sector ?? "—"}</td>
                    <td className="px-4 py-2 text-xs text-slate-600">
                      {p.start_date} – {p.end_date}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-24 overflow-hidden rounded bg-slate-200">
                          <div
                            className="bg-impacta h-full"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-xs text-slate-600">
                          {s.filled}/{s.total}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      <StatusPill status={p.status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const cls =
    status === "staffed"
      ? "bg-green-100 text-green-800"
      : status === "closed"
      ? "bg-slate-200 text-slate-700"
      : "bg-amber-100 text-amber-800";
  return <span className={`rounded px-2 py-0.5 text-xs font-medium ${cls}`}>{status}</span>;
}
