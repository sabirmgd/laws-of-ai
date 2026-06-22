# AI Agent Audit Intake Checklist

Paste what you have. Missing items are fine; the audit will mark confidence and unknowns.

## Pick The Surface

- Code repo: local files, GitHub repo, or uploaded source.
- Workflow builder: n8n, Zapier, Make, Retool, Voiceflow, Botpress, or similar.
- SDK/API: OpenAI Agents SDK, Assistants, LangGraph, LangChain, CrewAI, AutoGen, Semantic Kernel, or custom stack.
- Black-box: transcripts, screenshots, demos, or observed behavior only.
- Client report: audit output needs to become a formal deliverable.

If you are unsure, start with the general sections below and include whatever screenshots, exports, or traces you have.

## Agent Overview

- What does the agent do?
- Who uses it?
- What actions can it take?
- What would a bad failure look like?
- Where does it run?
- What is the highest-stakes thing it can do without a human?

## Prompts

- System prompt:
- Developer prompt:
- User prompt template:
- Tool-selection instructions:
- Refusal/escalation instructions:

## Tools

For each tool:

- Name:
- Description shown to the model:
- Inputs:
- Outputs:
- Permissions:
- Side effects:
- Can it read private data?
- Can it send data outside the system?
- Is there a human approval step?

## Retrieval / Memory

- What sources can the agent retrieve from?
- How are documents chunked?
- How are chunks ranked or reranked?
- How is freshness handled?
- Are citations required?
- Can user-supplied or web content enter the same context as privileged instructions?

## Evals

- What test cases exist?
- What metrics are tracked?
- Are failures sliced by task type, customer, language, or risk?
- Is there a regression suite?
- Are real production traces reviewed?

## Logs / Traces

Include 1-3 successful runs and 1-3 failed runs:

- User input:
- Retrieved context:
- Model output:
- Tool calls:
- Final result:
- What went wrong or right:

## Constraints

- Latency target:
- Cost target:
- Autonomy level:
- Human review requirements:
- Sensitive data involved:
- Compliance or legal constraints:

## n8n / Workflow Builder Exports

- Exported workflow JSON or blueprint:
- Screenshots of AI/prompt nodes:
- Screenshots of action/tool nodes:
- Credential scopes, described without secrets:
- Error branches and retry settings:
- Sample execution log:

## Code Repo / SDK Artifacts

- Agent entrypoint files:
- Tool/function schema files:
- Retrieval or memory files:
- Eval/test files:
- Trace/log examples:
- Deployment config:

## Black-Box Evidence

- Public docs or screenshots:
- 5-10 transcripts:
- Known complaints or incidents:
- Probe questions you are allowed to run:
- What you cannot inspect:
