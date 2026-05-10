"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface DraftTeamRow {
  seniority: string;
  headcount: number;
  allocation_pct: number;
  rationale: string;
}
interface ProjectDraft {
  name: string;
  client: string | null;
  sector: string | null;
  duration_weeks: number;
  required_skills: string[];
  summary: string;
  team: DraftTeamRow[];
  source: "claude" | "heuristic";
}

export default function NewProjectWizard({
  sectors,
  seniorities,
  today,
  hasApiKey,
}: {
  sectors: string[];
  seniorities: string[];
  today: string;
  hasApiKey: boolean;
}) {
  const router = useRouter();

  // briefing input state
  const [description, setDescription] = useState("");
  const [clientUrl, setClientUrl] = useState("");
  const [files, setFiles] = useState<File[]>([]);

  // analyze state
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [draft, setDraft] = useState<ProjectDraft | null>(null);
  const [sources, setSources] = useState<string[]>([]);
  const [startDate, setStartDate] = useState(today);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // speech state
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const [recording, setRecording] = useState(false);
  const [interim, setInterim] = useState("");
  const [speechSupported, setSpeechSupported] = useState(true);

  useEffect(() => {
    const SR = (window as unknown as { SpeechRecognition?: typeof SpeechRecognition; webkitSpeechRecognition?: typeof SpeechRecognition }).SpeechRecognition
      ?? (window as unknown as { webkitSpeechRecognition?: typeof SpeechRecognition }).webkitSpeechRecognition;
    if (!SR) {
      setSpeechSupported(false);
      return;
    }
    const r = new SR();
    r.lang = "en-US";
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e: SpeechRecognitionEvent) => {
      let final = "";
      let stillInterim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i]![0]!.transcript;
        if (e.results[i]!.isFinal) final += t;
        else stillInterim += t;
      }
      if (final) {
        setDescription((prev) => (prev ? prev.trim() + " " : "") + final.trim());
      }
      setInterim(stillInterim);
    };
    r.onend = () => {
      setRecording(false);
      setInterim("");
    };
    r.onerror = () => {
      setRecording(false);
      setInterim("");
    };
    recognitionRef.current = r;
    return () => {
      try { r.stop(); } catch { /* ignore */ }
    };
  }, []);

  const toggleRecording = () => {
    const r = recognitionRef.current;
    if (!r) return;
    if (recording) {
      try { r.stop(); } catch { /* ignore */ }
      setRecording(false);
    } else {
      try {
        r.start();
        setRecording(true);
      } catch { /* already started */ }
    }
  };

  const onFilesPicked = (selected: FileList | null) => {
    if (!selected) return;
    const accepted: File[] = [];
    for (const f of Array.from(selected)) {
      const lower = f.name.toLowerCase();
      if (lower.endsWith(".pdf") || lower.endsWith(".docx") || lower.endsWith(".txt")) {
        accepted.push(f);
      }
    }
    setFiles((prev) => [...prev, ...accepted]);
  };

  const removeFile = (i: number) => setFiles((prev) => prev.filter((_, idx) => idx !== i));

  const canAnalyze = description.trim().length > 0 || clientUrl.trim().length > 0 || files.length > 0;

  const onAnalyze = async () => {
    setAnalyzing(true);
    setAnalyzeError(null);
    setCreateError(null);
    try {
      const fd = new FormData();
      fd.set("description", description);
      if (clientUrl.trim()) fd.set("client_url", clientUrl.trim());
      for (const f of files) fd.append("files", f);
      const res = await fetch("/api/analyze", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setDraft(json.draft as ProjectDraft);
      setSources(json.sources ?? []);
    } catch (e) {
      setAnalyzeError((e as Error).message);
    } finally {
      setAnalyzing(false);
    }
  };

  const endDate = useMemo(() => {
    if (!draft) return today;
    const d = new Date(startDate);
    d.setUTCDate(d.getUTCDate() + draft.duration_weeks * 7);
    return d.toISOString().slice(0, 10);
  }, [draft, startDate, today]);

  const onCreate = async () => {
    if (!draft) return;
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draft.name,
          client: draft.client,
          sector: draft.sector,
          description: description || draft.summary,
          required_skills: draft.required_skills,
          start_date: startDate,
          end_date: endDate,
          team: draft.team,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      router.push(`/projects/${json.id}`);
    } catch (e) {
      setCreateError((e as Error).message);
      setCreating(false);
    }
  };

  // --- editable draft handlers ---
  const updateTeam = (i: number, patch: Partial<DraftTeamRow>) => {
    if (!draft) return;
    const next = [...draft.team];
    next[i] = { ...next[i]!, ...patch };
    setDraft({ ...draft, team: next });
  };
  const removeTeamRow = (i: number) => {
    if (!draft) return;
    setDraft({ ...draft, team: draft.team.filter((_, idx) => idx !== i) });
  };
  const addTeamRow = () => {
    if (!draft) return;
    setDraft({
      ...draft,
      team: [...draft.team, { seniority: "Consultant", headcount: 1, allocation_pct: 100, rationale: "" }],
    });
  };
  const updateSkillsText = (text: string) => {
    if (!draft) return;
    setDraft({
      ...draft,
      required_skills: text.split(",").map((s) => s.trim()).filter(Boolean),
    });
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* LEFT — briefing */}
      <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Briefing</h2>
          {!hasApiKey && (
            <span
              className="text-[11px] text-slate-500"
              title="ANTHROPIC_API_KEY not set — using heuristic draft generator"
            >
              heuristic mode
            </span>
          )}
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="text-sm font-medium" htmlFor="description">
              Describe the engagement
            </label>
            <button
              type="button"
              onClick={toggleRecording}
              disabled={!speechSupported}
              className={`rounded px-2 py-1 text-xs font-medium ${
                recording
                  ? "animate-pulse bg-red-600 text-white"
                  : "bg-impacta text-white hover:opacity-90 disabled:bg-slate-300 disabled:text-slate-500"
              }`}
              title={speechSupported ? "Dictate (en-US)" : "Speech recognition not available in this browser"}
            >
              {recording ? "Stop dictation" : "Dictate"}
            </button>
          </div>

          <div className="mb-2 rounded-md bg-slate-100 p-3 text-xs text-slate-700">
            <div className="font-medium text-slate-800">Cover these points to get a better draft</div>
            <ul className="mt-1.5 list-inside list-disc space-y-0.5 marker:text-slate-400">
              <li>What is the client trying to achieve, and which decision is the engagement supporting?</li>
              <li>Sector / industry cues and the type of work (CDD, transformation, diagnostic, …)</li>
              <li>Timeline and urgency — kickoff date, hard deadlines</li>
              <li>Specific skills, geographies, languages, or seniority must-haves</li>
              <li>Constraints (budget envelope, sensitivities, prior history with the client)</li>
            </ul>
          </div>

          <textarea
            id="description"
            value={description + (interim ? ` ${interim}` : "")}
            onChange={(e) => setDescription(e.target.value)}
            rows={8}
            placeholder="Example: Mid-market PE fund evaluating a buy-and-build of independent Italian eyewear brands. 6-week CDD scope: brand positioning, wholesale strategy, DTC potential, value-creation hypothesis. Kickoff in two weeks; partner sponsor expected for the steering committee."
            className="focus:border-impacta focus:ring-impacta block w-full rounded border border-slate-300 px-3 py-2 text-sm shadow-sm focus:ring-1"
          />
          {!speechSupported && (
            <p className="mt-1 text-xs text-slate-500">
              Voice input needs Chrome, Edge, or Safari. Type instead, or upload a recording transcript.
            </p>
          )}
        </div>

        <div>
          <label className="text-sm font-medium" htmlFor="client_url">
            Client URL (optional)
          </label>
          <input
            id="client_url"
            type="url"
            value={clientUrl}
            onChange={(e) => setClientUrl(e.target.value)}
            placeholder="https://www.client-website.com"
            className="focus:border-impacta focus:ring-impacta mt-1 block w-full rounded border border-slate-300 px-3 py-2 text-sm shadow-sm focus:ring-1"
          />
          <p className="mt-1 text-xs text-slate-500">
            We&apos;ll fetch the page and add its text to the briefing context.
          </p>
        </div>

        <div>
          <label className="text-sm font-medium">Attach documents (optional)</label>
          <input
            type="file"
            multiple
            accept=".pdf,.docx,.txt"
            onChange={(e) => onFilesPicked(e.target.files)}
            className="mt-1 block w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm"
          />
          {files.length > 0 && (
            <ul className="mt-2 space-y-1">
              {files.map((f, i) => (
                <li key={i} className="flex items-center justify-between rounded bg-slate-100 px-2 py-1 text-xs">
                  <span className="truncate">{f.name} <span className="text-slate-500">· {(f.size / 1024).toFixed(0)} KB</span></span>
                  <button onClick={() => removeFile(i)} className="ml-2 text-red-600 hover:underline">remove</button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-1 text-xs text-slate-500">PDF, DOCX or TXT. RFPs, briefing decks, kickoff memos.</p>
        </div>

        <button
          onClick={onAnalyze}
          disabled={!canAnalyze || analyzing}
          className="bg-impacta hover:bg-impacta/90 w-full rounded px-4 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {analyzing ? "Analyzing briefing…" : draft ? "Re-analyze" : "Analyze briefing"}
        </button>

        {analyzeError && (
          <div className="rounded border border-red-200 bg-red-50 p-3 text-xs text-red-800">{analyzeError}</div>
        )}
        {sources.length > 0 && (
          <div className="rounded border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
            <div className="font-medium">Context sources used</div>
            <ul className="mt-1 list-inside list-disc">
              {sources.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* RIGHT — draft */}
      <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Suggested staffing</h2>
          {draft && (
            <span className="text-[11px] text-slate-500">
              {draft.source === "claude" ? "drafted by assistant" : "heuristic draft"}
            </span>
          )}
        </div>

        {!draft ? (
          <p className="text-sm text-slate-500">
            Add a briefing and hit <strong>Analyze briefing</strong>. The assistant will propose project name,
            client, sector, duration and a team composition you can review and edit before creating.
          </p>
        ) : (
          <div className="space-y-4">
            <DraftField label="Project name" value={draft.name} onChange={(v) => setDraft({ ...draft, name: v })} />
            <div className="grid grid-cols-2 gap-3">
              <DraftField
                label="Client"
                value={draft.client ?? ""}
                onChange={(v) => setDraft({ ...draft, client: v || null })}
              />
              <div>
                <label className="block text-sm font-medium">Sector</label>
                <select
                  value={draft.sector ?? ""}
                  onChange={(e) => setDraft({ ...draft, sector: e.target.value || null })}
                  className="mt-1 block w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm"
                >
                  <option value="">—</option>
                  {sectors.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-medium">Start date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="mt-1 block w-full rounded border border-slate-300 px-3 py-2 text-sm shadow-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium">Duration</label>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    type="number"
                    min={2}
                    max={26}
                    value={draft.duration_weeks}
                    onChange={(e) =>
                      setDraft({ ...draft, duration_weeks: Math.max(2, Math.min(26, Number(e.target.value) || 2)) })
                    }
                    className="block w-20 rounded border border-slate-300 px-3 py-2 text-sm shadow-sm"
                  />
                  <span className="text-sm text-slate-600">weeks</span>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium">End date</label>
                <input
                  type="date"
                  value={endDate}
                  disabled
                  className="mt-1 block w-full rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium">Required skills</label>
              <input
                value={draft.required_skills.join(", ")}
                onChange={(e) => updateSkillsText(e.target.value)}
                placeholder="comma-separated"
                className="mt-1 block w-full rounded border border-slate-300 px-3 py-2 text-sm shadow-sm"
              />
              <div className="mt-1 flex flex-wrap gap-1">
                {draft.required_skills.map((s) => (
                  <span key={s} className="bg-impacta/5 text-impacta rounded px-2 py-0.5 text-xs">
                    {s}
                  </span>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Team composition</label>
                <button
                  onClick={addTeamRow}
                  className="text-impacta text-xs hover:underline"
                  type="button"
                >
                  + Add row
                </button>
              </div>
              <div className="mt-2 grid grid-cols-[1.5rem_1fr_1.5rem] items-center gap-2 px-2 text-[10px] uppercase tracking-wide text-slate-400">
                <span>#</span>
                <span>Role</span>
                <span></span>
              </div>
              <div className="mt-1 space-y-2">
                {draft.team.map((row, i) => (
                  <div
                    key={i}
                    className="rounded border border-slate-200 bg-slate-50/40 p-2"
                  >
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_72px_82px_auto] sm:items-center">
                      <select
                        value={row.seniority}
                        onChange={(e) => updateTeam(i, { seniority: e.target.value })}
                        className="rounded border border-slate-300 bg-white px-2 py-1 text-sm"
                      >
                        {seniorities.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                      <label className="flex items-center gap-1 text-xs text-slate-600">
                        <input
                          type="number"
                          min={1}
                          max={5}
                          value={row.headcount}
                          onChange={(e) =>
                            updateTeam(i, { headcount: Math.max(1, Math.min(5, Number(e.target.value) || 1)) })
                          }
                          className="w-12 rounded border border-slate-300 bg-white px-2 py-1 text-sm"
                        />
                        <span>ppl</span>
                      </label>
                      <label className="flex items-center gap-1 text-xs text-slate-600">
                        <input
                          type="number"
                          min={1}
                          max={100}
                          value={row.allocation_pct}
                          onChange={(e) =>
                            updateTeam(i, {
                              allocation_pct: Math.max(1, Math.min(100, Number(e.target.value) || 100)),
                            })
                          }
                          className="w-14 rounded border border-slate-300 bg-white px-2 py-1 text-sm"
                        />
                        <span>%</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => removeTeamRow(i)}
                        className="justify-self-end rounded px-2 py-1 text-xs text-slate-500 hover:bg-red-50 hover:text-red-600"
                      >
                        Remove
                      </button>
                    </div>
                    <input
                      value={row.rationale}
                      onChange={(e) => updateTeam(i, { rationale: e.target.value })}
                      placeholder="Rationale (optional) — why this role on this engagement"
                      className="mt-2 block w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
                    />
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Each row = N people at this seniority, working at X% allocation across the project window.
              </p>
            </div>

            <div className="flex justify-end gap-3">
              <a href="/projects" className="rounded border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100">
                Cancel
              </a>
              <button
                onClick={onCreate}
                disabled={creating}
                className="bg-impacta hover:bg-impacta/90 rounded px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {creating ? "Creating…" : "Create project"}
              </button>
            </div>
            {createError && (
              <div className="rounded border border-red-200 bg-red-50 p-3 text-xs text-red-800">{createError}</div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function DraftField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-sm font-medium">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="focus:border-impacta focus:ring-impacta mt-1 block w-full rounded border border-slate-300 px-3 py-2 text-sm shadow-sm focus:ring-1"
      />
    </div>
  );
}
