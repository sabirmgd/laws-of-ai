#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { loadBook } from "../lib/content.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PRODUCT_ROOT = join(ROOT, "product", "ai-agent-audit-kit");
const SKILL_ROOT = join(PRODUCT_ROOT, "ai-agent-audit");
const BUILD_ROOT = join(PRODUCT_ROOT, "build");
const RELEASE_ROOT = join(PRODUCT_ROOT, "releases");
const BUNDLE_NAME = "ai-agent-audit-kit-50-laws-edition";
const BUNDLE_ROOT = join(BUILD_ROOT, BUNDLE_NAME);
const ZIP = join(RELEASE_ROOT, `${BUNDLE_NAME}.zip`);

const book = loadBook();
const siteProduct = book.site.product || {};

function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

function copyDir(src, dest) {
  ensureDir(dest);
  for (const entry of readdirSync(src)) {
    const from = join(src, entry);
    const to = join(dest, entry);
    const st = statSync(from);
    if (st.isDirectory()) copyDir(from, to);
    else copyFileSync(from, to);
  }
}

function mdEscape(value = "") {
  return String(value).replace(/\r\n/g, "\n").trim();
}

function rubricMarkdown() {
  const sections = book.laws.map((law) => {
    const category = book.catById[law.category]?.name || law.category;
    const signals = law.signals.length
      ? law.signals.map((s) => `- ${mdEscape(s)}`).join("\n")
      : "- No additional warning signs captured yet.";
    const apply = law.apply.length
      ? law.apply.map((s) => `- ${mdEscape(s)}`).join("\n")
      : "- Use the principle and takeaway to define a concrete fix.";
    const sources = law.sources.length
      ? law.sources.map((s) => `- [${mdEscape(s.title)}](${s.url})${s.author ? ` - ${mdEscape(s.author)}` : ""}`).join("\n")
      : "- No source listed.";
    return `## ${String(law.number).padStart(2, "0")}. ${law.name}

Category: ${category}

Tagline: ${law.tagline}

Audit lens: Look for places where the agent design violates this law in prompts, context assembly, retrieval, memory, tools, evals, permissions, user handoffs, or observability.

Principle:

${mdEscape(law.principle)}

Warning signs:

${signals}

Fix patterns:

${apply}

Worked example:

${mdEscape(law.example || "No worked example captured yet.")}

Sources:

${sources}
`;
  });

  return `# 50 Laws Audit Rubric

Use this rubric with the \`ai-agent-audit\` skill. Do not mechanically list every law in an audit report. Use the full set to find concrete issues, then report only the highest-signal findings.

Audit priority order:

1. Security and data leakage.
2. Unauthorized side effects.
3. Silent wrong answers.
4. Retrieval and context failures.
5. Eval blind spots.
6. Observability and handoff gaps.
7. Cost, latency, and maintainability issues.

${sections.join("\n").trimEnd()}
`;
}

function startHereMarkdown() {
  return `# ${siteProduct.name || "AI Agent Audit Kit: 50 Laws Edition"}

Price: ${siteProduct.price || "$14.90"}

Promise: ${siteProduct.promise || "Find the hidden failure modes in your AI agent before users do."}

## What This Actually Is

This is an evidence-based audit workflow for real AI agents. It is not a black-box vulnerability scanner and it is not a generic prompt pack.

You use it inside the tool where you already work, or you export evidence from that tool:

- Code repos through Codex or Claude Code.
- n8n, Zapier, Make, Retool, Voiceflow, Botpress, or similar workflow exports.
- OpenAI Agents SDK, Assistants, LangGraph, LangChain, CrewAI, AutoGen, Semantic Kernel, or custom API projects.
- Black-box transcripts, screenshots, demos, and probe results when internals are unavailable.
- Client-ready reports for consulting or launch reviews.

The kit reads prompts, tools, retrieval, evals, traces, workflow nodes, permissions, side effects, and handoffs, then maps concrete risks to the 50 Laws.

## Why This Exists

I made this after building and reviewing many AI agent systems and seeing the same failures repeat. The model was rarely the only problem. The agent broke because context was stale, tools were vague, retrieval missed the right facts, evals were missing, permissions were too broad, or nobody designed the handoff when the agent got stuck.

Agents are becoming an interface to real work. They read, decide, call tools, write into systems, and affect customers. This kit turns the 50 laws into a practical audit workflow so you can find the weak points before users or clients do.

## What Is Included

- \`ai-agent-audit/\`: installable skill folder.
- \`ai-agent-audit/references/50-laws-audit-rubric.md\`: full audit rubric generated from the current law data.
- \`ai-agent-audit/assets/intake-checklist.md\`: gather the right audit inputs.
- \`ai-agent-audit/assets/platform-intake.md\`: evidence checklist for repos, workflow builders, SDK/API agents, black-box audits, and client reports.
- \`ai-agent-audit/assets/audit-report-template.md\`: reusable report format.
- \`ai-agent-audit/assets/copy-paste-audit-prompt.md\`: use the workflow without installing a skill.
- \`ai-agent-audit/assets/sample-audit.md\`: example audit output.
- \`ai-agent-audit/assets/install-codex-claude.md\`: install instructions for Codex and Claude.

No PDF is included. The illustrated digital edition is protected online at:

https://lawsofagents.ai/access

## How To Use

1. Follow \`ai-agent-audit/assets/install-codex-claude.md\` to copy the skill into Codex or Claude.
2. Choose a mode: repo, workflow, SDK/API, black-box, or client report.
3. Fill in \`assets/intake-checklist.md\` or \`assets/platform-intake.md\` with your prompts, tools, workflow export, retrieval, evals, traces, screenshots, or transcripts.
4. Ask the agent to run an audit with \`$ai-agent-audit\`.
5. Use \`assets/audit-report-template.md\` to turn findings into a fix plan.

If your tool does not support installable skills, use \`assets/copy-paste-audit-prompt.md\`.
`;
}

function main() {
  if (!existsSync(SKILL_ROOT)) throw new Error(`Missing skill folder: ${SKILL_ROOT}`);

  ensureDir(join(SKILL_ROOT, "references"));
  writeFileSync(join(SKILL_ROOT, "references", "50-laws-audit-rubric.md"), rubricMarkdown());

  rmSync(BUILD_ROOT, { recursive: true, force: true });
  ensureDir(BUNDLE_ROOT);
  ensureDir(RELEASE_ROOT);

  copyDir(SKILL_ROOT, join(BUNDLE_ROOT, "ai-agent-audit"));
  writeFileSync(join(BUNDLE_ROOT, "START-HERE.md"), startHereMarkdown());

  rmSync(ZIP, { force: true });
  execFileSync("zip", ["-qr", ZIP, BUNDLE_NAME], { cwd: BUILD_ROOT, stdio: "inherit" });

  console.log(`✓ generated rubric -> ${join(SKILL_ROOT, "references", "50-laws-audit-rubric.md")}`);
  console.log(`✓ built product bundle -> ${ZIP}`);
}

main();
