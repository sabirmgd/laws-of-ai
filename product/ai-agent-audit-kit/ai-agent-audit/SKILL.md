---
name: ai-agent-audit
description: Audit AI agents, LLM workflows, RAG systems, multi-agent systems, tool-using assistants, or autonomous workflows against the 50 Laws of AI Agents. Use when asked to find agent failure modes, review an agent architecture, inspect prompts/tools/retrieval/evals/security, produce an audit report, diagnose why an agent is unreliable, or recommend concrete fixes before production launch.
---

# AI Agent Audit

Audit an AI agent against the 50 Laws of AI Agents and return prioritized, evidence-backed issues with concrete fixes.

## Inputs To Request

Ask for only the missing inputs needed to run a useful audit:

- Agent goal and user-facing workflow.
- System/developer prompts and important prompt templates.
- Tool list with descriptions, permissions, inputs, outputs, and side effects.
- Retrieval or memory design, including chunking, ranking, freshness, and citations.
- Eval setup, metrics, test cases, and known failures.
- Logs or traces from 1-3 successful runs and 1-3 failed runs.
- Deployment constraints: latency, cost, autonomy level, human review, and data sensitivity.

If the user has limited artifacts, run a lighter audit and label confidence clearly.

## Audit Workflow

1. Read `references/50-laws-audit-rubric.md`.
2. Build a short system map: user input, context assembly, model calls, tools, memory, side effects, evals, and human handoffs.
3. Identify concrete failure modes. Do not list laws abstractly.
4. Map each issue to the most relevant law or laws.
5. Rank issues by severity:
   - `Critical`: can leak data, perform unauthorized side effects, corrupt user/business state, or create severe compliance/security exposure.
   - `High`: likely to create wrong production outcomes, silent failures, or bad user decisions.
   - `Medium`: reduces reliability, debuggability, or maintainability but has bounded blast radius.
   - `Low`: polish, clarity, or future-risk issue.
6. For every issue, include evidence from the provided artifact, the violated law, why it matters, exact fix, and verification.
7. Separate confirmed issues from hypotheses. Never invent architecture details.
8. End with the shortest next-action list that would reduce the most risk fastest.

## Output Format

Use this structure:

```markdown
# AI Agent Audit

## Executive Summary
- Overall risk: Critical|High|Medium|Low
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

## Buyer Assets

- `references/50-laws-audit-rubric.md`: full law-by-law audit rubric.
- `assets/intake-checklist.md`: copy/paste checklist for gathering audit inputs.
- `assets/audit-report-template.md`: report template for client or internal audits.
- `assets/copy-paste-audit-prompt.md`: prompt for users who cannot install skills.
- `assets/sample-audit.md`: example output for a deliberately flawed support agent.
- `assets/install-codex-claude.md`: install instructions for Codex and Claude users.
