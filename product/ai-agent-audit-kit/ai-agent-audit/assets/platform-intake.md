# Platform Intake

Use this when the buyer asks how to audit an agent where they actually work. Pick the smallest packet that gives enough evidence. Do not ask for secrets.

## Repo Mode

Use when the agent lives in source code.

Ask for:

- Repo path or uploaded files.
- Agent entrypoint and orchestration files.
- System/developer prompts and prompt templates.
- Tool definitions, schemas, permissions, and side effects.
- Retrieval, memory, vector store, or document-loading code.
- Eval files, regression tests, and recent failures.
- One successful trace and one failed trace when available.

Inspect for:

- Hidden broad permissions.
- Missing deterministic validation around model output.
- Tool descriptions that do not match real tool behavior.
- Retrieval recall/ranking gaps.
- Missing regression tests for fixed bugs.
- Side-effecting actions without idempotency, approval, or rollback.

## Workflow Builder Mode

Use for n8n, Zapier, Make, Retool, Voiceflow, Botpress, or similar tools.

Ask for:

- Exported workflow JSON or blueprint when possible.
- Screenshots of AI/prompt nodes, action/tool nodes, branches, retries, and error handlers.
- Credential scopes for connected apps, described in words. Do not request secrets.
- Sample execution logs for one good run and one failed or risky run.
- Which inputs are user-controlled, web-controlled, or trusted internal data.
- Which nodes can send email, write to a database, charge money, update CRM records, or call external APIs.

Inspect for:

- User-controlled text reaching privileged action nodes.
- Private data plus untrusted content plus outbound tools.
- Missing approval before irreversible actions.
- No error branch, retry limit, dedupe key, or circuit breaker.
- Prompt nodes that have too many jobs.
- Retrieval or search nodes with no ranking or freshness control.

## SDK/API Mode

Use for OpenAI Agents SDK, Assistants, LangGraph, LangChain, CrewAI, AutoGen, Semantic Kernel, or custom API stacks.

Ask for:

- Agent construction code and model settings.
- Tool/function schemas and permission boundaries.
- Memory, retrieval, file-search, or vector-store setup.
- Planner/executor loops, routing, retries, and stop conditions.
- Tracing/logging setup.
- Eval harness, fixtures, and deployment config.

Inspect for:

- Model-dependent guarantees that should be enforced in code.
- Unbounded loops or unclear stop conditions.
- Missing traces for tool calls and context assembly.
- Tool overlap that makes selection flaky.
- No held-out evals or no per-slice metrics.
- Prompt injection reaching tools with authority.

## Black-Box Mode

Use when internals are unavailable.

Ask for:

- Product description and supported actions.
- Public docs or screenshots.
- 5-10 transcripts across normal, edge, and adversarial use.
- What the agent is allowed to do autonomously.
- Known incidents, user complaints, or suspicious outputs.

Allowed output:

- Confirmed behavioral findings.
- Risk hypotheses.
- Probe suggestions.
- Evidence needed to upgrade confidence.

Do not claim:

- Internal architecture facts.
- Specific retrieval or tool failures without evidence.
- Security guarantees.

## Client Report Mode

Use when the buyer wants a deliverable for a client, team, investor, or launch review.

Add:

- Plain-language executive summary.
- Owner for each fix.
- Severity and business impact.
- 7-day risk-reduction plan.
- 30-day hardening plan.
- Verification checklist the client can rerun.

Keep the report concrete. Avoid generic AI safety advice that is not tied to the provided agent.
