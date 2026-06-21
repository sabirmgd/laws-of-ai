# AI Agent Audit Intake Checklist

Paste what you have. Missing items are fine; the audit will mark confidence and unknowns.

## Agent Overview

- What does the agent do?
- Who uses it?
- What actions can it take?
- What would a bad failure look like?

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
