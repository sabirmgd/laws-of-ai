---
name: ai-agent-audit
description: Evidence-based audits for AI agents, LLM workflows, RAG systems, n8n/Zapier/Make automations, LangGraph/LangChain/CrewAI/OpenAI Agents SDK projects, tool-using assistants, and autonomous workflows against the 50 Laws of AI Agents. Use when asked to find agent failure modes, review prompts/tools/retrieval/evals/security, audit an exported workflow or code repo, diagnose why an agent is unreliable, produce a client-ready audit report, or recommend concrete fixes before production launch.
---

# AI Agent Audit

Audit an AI agent against the 50 Laws of AI Agents and return prioritized, evidence-backed issues with concrete fixes.

This is a gray-box audit workflow, not a magic scanner. Prefer direct evidence from the place where the agent lives: source files, workflow exports, prompts, tool schemas, traces, evals, logs, screenshots, or transcripts. If only behavior is available, run a black-box audit and label confidence lower.

## Pick The Audit Mode

Choose one mode before asking for inputs:

- `repo`: source code is available in the current workspace. Inspect prompts, agent orchestration, tool definitions, retrieval, evals, tests, and runtime configuration directly.
- `workflow`: the agent lives in n8n, Zapier, Make, Retool, Voiceflow, Botpress, or a similar builder. Ask for exported workflow JSON when possible, plus node screenshots and 1-3 execution logs.
- `sdk`: the agent is built with OpenAI Agents SDK, Assistants, LangGraph, LangChain, CrewAI, AutoGen, Semantic Kernel, or a custom API stack. Ask for the relevant agent files, tool schemas, retrieval setup, and traces.
- `black-box`: only prompts, screenshots, transcripts, or observed behavior are available. Audit what can be proven, run probe questions if allowed, and keep unknowns explicit.
- `client-report`: produce a consultant-style report. Use `assets/audit-report-template.md` and include owners, severity, fixes, verification, and a 7-day/30-day plan.

If the user has not named a mode, infer the lightest useful mode from the artifacts they provide. Do not block on perfect inputs.

## Inputs To Request

Ask for only the missing inputs needed to run the chosen mode. Start with the minimum viable audit before requesting a full packet.

Minimum viable audit:

- What the agent is supposed to do.
- Where it runs: code repo, n8n/workflow builder, SaaS platform, API/SDK, or unknown.
- The system prompt or core instruction.
- The tool/action list, including side effects and permissions.
- One successful run and one failed or risky run, if available.

Full evidence packet:

- Agent goal and user-facing workflow.
- System/developer prompts and important prompt templates.
- Tool list with descriptions, permissions, inputs, outputs, and side effects.
- Retrieval or memory design, including chunking, ranking, freshness, and citations.
- Eval setup, metrics, test cases, and known failures.
- Logs or traces from 1-3 successful runs and 1-3 failed runs.
- Deployment constraints: latency, cost, autonomy level, human review, and data sensitivity.

If the user has limited artifacts, run a lighter audit and label confidence clearly.

For platform-specific intake, use:

- `assets/intake-checklist.md`: general checklist.
- `assets/platform-intake.md`: code repo, n8n/workflow, SDK/API, black-box, and client-report evidence checklist.

## Audit Workflow

1. Read `references/50-laws-audit-rubric.md`.
2. Read `assets/platform-intake.md` when the audit involves n8n/workflow builders, SDK/API projects, black-box testing, or client delivery.
3. Build a short system map: user input, context assembly, model calls, tools, memory, side effects, evals, and human handoffs.
4. Identify concrete failure modes. Do not list laws abstractly.
5. Map each issue to the most relevant law or laws.
6. Rank issues by severity:
   - `Critical`: can leak data, perform unauthorized side effects, corrupt user/business state, or create severe compliance/security exposure.
   - `High`: likely to create wrong production outcomes, silent failures, or bad user decisions.
   - `Medium`: reduces reliability, debuggability, or maintainability but has bounded blast radius.
   - `Low`: polish, clarity, or future-risk issue.
7. For every issue, include evidence from the provided artifact, the violated law, why it matters, exact fix, and verification.
8. Separate confirmed issues from hypotheses. Never invent architecture details.
9. End with the shortest next-action list that would reduce the most risk fastest.

## Output Format

Use this structure:

```markdown
# AI Agent Audit

## Executive Summary
- Overall risk: Critical|High|Medium|Low
- Audit mode:
- Confidence: High|Medium|Low
- Top risk:
- Fastest useful fix:

## System Map
Short paragraph or bullets describing how the agent works.

## Findings

### 1. <Issue Title>
Severity:
Laws:
Evidence:
Why it matters:
Fix:
Verification:
Owner:

## What Looks Solid
- ...

## Unknowns / Needed Evidence
- ...

## 7-Day Fix Plan
1. ...
```

Use `assets/audit-report-template.md` if the user asks for a reusable report.

## Quality Bar

- Prefer 5-10 high-signal findings over a long checklist.
- Tie every finding to a concrete artifact, trace, prompt, tool, or missing control.
- Do not recommend "use a better model" unless the evidence proves the architecture is already sound.
- Prefer boundary fixes, evals, observability, tool-scope changes, and context-quality improvements over vague prompt advice.
- For security issues, assume prompt injection eventually succeeds and constrain the blast radius outside the model.
- For black-box audits, do not claim access to internals. Phrase findings as observed risk or hypothesis and state what evidence would confirm it.
- For n8n/workflow audits, inspect node order, credential scope, tool side effects, retry behavior, error branches, and whether user-controlled content can reach privileged actions.
- For repo audits, inspect actual files and tests before making claims. If you cannot run tests or inspect traces, say so.

## Buyer Assets

- `references/50-laws-audit-rubric.md`: full law-by-law audit rubric.
- `assets/intake-checklist.md`: copy/paste checklist for gathering audit inputs.
- `assets/platform-intake.md`: evidence checklist by work surface: repo, workflow builder, SDK/API, black-box, and client report.
- `assets/audit-report-template.md`: report template for client or internal audits.
- `assets/copy-paste-audit-prompt.md`: prompt for users who cannot install skills.
- `assets/sample-audit.md`: example output for a deliberately flawed support agent.
- `assets/install-codex-claude.md`: install instructions for Codex and Claude users.
