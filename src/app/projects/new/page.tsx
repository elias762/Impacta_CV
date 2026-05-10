import NewProjectWizard from "./NewProjectWizard";
import { SECTORS, SENIORITIES } from "@/lib/consultants";

export const dynamic = "force-dynamic";

export default function NewProjectPage() {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div>
      <div className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Staff a new engagement</h1>
        <p className="text-sm text-slate-600">
          Drop in a briefing — describe it, dictate it, attach the RFP, or paste the client&apos;s URL.
          The assistant drafts sector, duration and team composition. You review, then create the project.
        </p>
      </div>
      <NewProjectWizard
        sectors={[...SECTORS]}
        seniorities={[...SENIORITIES]}
        today={today}
        hasApiKey={!!process.env.ANTHROPIC_API_KEY}
      />
    </div>
  );
}
