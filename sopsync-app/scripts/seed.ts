/**
 * Seed a sample client, department, process, and SOP into the encrypted DB.
 * Run on macOS after `npm install` (needs the native SQLCipher module):
 *   npx tsx scripts/seed.ts
 *
 * Produces the "sample client / SOP" deliverable inside a real database so the
 * dashboard shows populated data on first open. The sample audit session,
 * workflow, and report are demonstrated by scripts/generate-sample.ts.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { AppContext } from '../src/main/app/context';
import { parseSopText } from '../src/main/sop/ingest';
import { newId, nowIso } from '../src/shared/id';
import type { Department, Process, Sop, SopVersion, SopStep } from '../src/shared/types';

async function main() {
  const ctx = await AppContext.boot();
  const now = nowIso();

  // Reuse the first client if setup already ran; otherwise create org+client.
  const client = (ctx.db.prepare(`SELECT * FROM clients LIMIT 1`).get() as any);
  if (!client) {
    console.error('Run first-run setup in the app before seeding (creates the organization & client).');
    process.exit(1);
  }

  const dept: Department = { id: newId('dep'), clientId: client.id, name: 'Accounts Receivable', createdAt: now };
  const proc: Process = {
    id: newId('prc'), clientId: client.id, departmentId: dept.id, name: 'Customer Refund Process',
    assignedSopId: null, currentApprovedWorkflowVersionId: null, lastAuditDate: null, complianceScore: null,
    averageCompletionMs: null, observedExecutions: 0, unresolvedDeviations: 0, trainingStatus: 'not_started', createdAt: now,
  };

  const sopText = await fs.readFile(path.join(__dirname, '../sample-data/sample-sop.md'), 'utf8');
  const parsed = parseSopText(sopText);
  const sop: Sop = { id: newId('sop'), clientId: client.id, departmentId: dept.id, title: parsed.title ?? 'Sample SOP', owner: parsed.owner, purpose: parsed.purpose, currentVersionId: null, createdAt: now };
  const version: SopVersion = {
    id: newId('sopv'), sopId: sop.id, version: parsed.version ?? '1.0', effectiveDate: parsed.effectiveDate,
    sourceType: 'markdown', preconditions: parsed.preconditions, requiredSystems: parsed.requiredSystems,
    requiredForms: parsed.requiredForms, approved: true, approvedBy: 'operator', createdAt: now,
  };

  ctx.repos.tx(() => {
    ctx.repos.insertDepartment(dept);
    ctx.db.prepare(`INSERT INTO sops(id,client_id,department_id,title,owner,purpose,current_version_id,created_at) VALUES (?,?,?,?,?,?,?,?)`)
      .run(sop.id, sop.clientId, sop.departmentId, sop.title, sop.owner, sop.purpose, version.id, sop.createdAt);
    ctx.db.prepare(`INSERT INTO sop_versions(id,sop_id,version,effective_date,source_type,preconditions,required_systems,required_forms,approved,approved_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .run(version.id, version.sopId, version.version, version.effectiveDate, version.sourceType,
        JSON.stringify(version.preconditions), JSON.stringify(version.requiredSystems), JSON.stringify(version.requiredForms),
        1, version.approvedBy, version.createdAt);
    parsed.steps.forEach((s) => {
      const step: SopStep = { id: newId('sops'), sopVersionId: version.id, stepNumber: s.stepNumber, title: s.title, description: s.description, warnings: s.warnings, isDecisionPoint: s.isDecisionPoint, expectedOutput: s.expectedOutput, screenshotRefs: [] };
      ctx.db.prepare(`INSERT INTO sop_steps(id,sop_version_id,step_number,title,description,warnings,is_decision_point,expected_output,screenshot_refs) VALUES (?,?,?,?,?,?,?,?,?)`)
        .run(step.id, step.sopVersionId, step.stepNumber, step.title, step.description, JSON.stringify(step.warnings), step.isDecisionPoint ? 1 : 0, step.expectedOutput, '[]');
    });
    proc.assignedSopId = sop.id;
    ctx.repos.insertProcess(proc);
  });

  console.log(`Seeded department "${dept.name}", SOP "${sop.title}" (v${version.version}, ${parsed.steps.length} steps), and process "${proc.name}".`);
  await ctx.shutdown();
}

main().catch((e) => { console.error(e); process.exit(1); });
