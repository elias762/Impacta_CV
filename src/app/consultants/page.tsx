import Link from "next/link";
import { searchConsultants, SECTORS, SENIORITIES } from "@/lib/consultants";

export const dynamic = "force-dynamic";

export default async function ConsultantsPage({
  searchParams,
}: {
  searchParams: { q?: string; sector?: string; seniority?: string };
}) {
  const q = searchParams.q ?? "";
  const sector = searchParams.sector ?? "";
  const seniority = searchParams.seniority ?? "";

  const consultants = await searchConsultants({ q, sector, seniority });

  return (
    <div>
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Consultants</h1>
          <p className="text-sm text-slate-600">
            {consultants.length} result{consultants.length === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      <form className="mt-4 grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-white p-4 md:grid-cols-[1fr_220px_220px_auto]">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search name, skills, role, CV text…"
          className="rounded border border-slate-300 px-3 py-2 text-sm"
        />
        <select
          name="sector"
          defaultValue={sector}
          className="rounded border border-slate-300 bg-white px-3 py-2 text-sm"
        >
          <option value="">All sectors</option>
          {SECTORS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          name="seniority"
          defaultValue={seniority}
          className="rounded border border-slate-300 bg-white px-3 py-2 text-sm"
        >
          <option value="">All seniorities</option>
          {SENIORITIES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <button className="bg-impacta hover:bg-impacta/90 rounded px-4 py-2 text-sm font-medium text-white">
            Search
          </button>
          <Link
            href="/consultants"
            className="rounded border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100"
          >
            Reset
          </Link>
        </div>
      </form>

      <div className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white">
        {consultants.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            No consultants yet. <Link className="text-impacta underline" href="/upload">Add the first CV</Link>.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Role</th>
                <th className="px-4 py-2">Seniority</th>
                <th className="px-4 py-2">Sector</th>
                <th className="px-4 py-2">Yrs</th>
                <th className="px-4 py-2">CV</th>
              </tr>
            </thead>
            <tbody>
              {consultants.map((c) => (
                <tr key={c.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-2">
                    <Link href={`/consultants/${c.id}`} className="text-impacta font-medium hover:underline">
                      {c.name}
                    </Link>
                    {c.email ? <div className="text-xs text-slate-500">{c.email}</div> : null}
                  </td>
                  <td className="px-4 py-2">{c.role ?? "—"}</td>
                  <td className="px-4 py-2">{c.seniority ?? "—"}</td>
                  <td className="px-4 py-2">{c.sector ?? "—"}</td>
                  <td className="px-4 py-2">{c.years_experience ?? "—"}</td>
                  <td className="px-4 py-2">
                    {c.cv_file_path ? (
                      <a
                        href={`/api/cv/${c.id}`}
                        className="text-impacta-accent text-xs underline"
                      >
                        download
                      </a>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
