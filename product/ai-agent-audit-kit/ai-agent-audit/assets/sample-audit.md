# Sample AI Agent Audit

This sample uses a deliberately flawed support agent.

## Artifact

The agent answers customer support emails. It can retrieve customer account history, read inbound email text, draft replies, and call `send_email(to, subject, body)`. It retrieves the top 12 chunks from a vector database. There is no reranker. The same model reads the inbound email, private customer history, and tool descriptions. The team measures only average thumbs-up score. Failed runs are manually checked when users complain.

## Executive Summary

- Overall risk: Critical
- Top risk: The agent combines private data, untrusted email content, and an external send tool.
- Fastest useful fix: Make `send_email` draft-only behind human approval when the agent has read untrusted inbound email.

## Findings

### 1. Private data, untrusted content, and exfiltration are combined

Severity: Critical

Laws: The Lethal Trifecta; Tokens Don't Wear Badges; Quarantine Untrusted Tokens

Evidence: The agent retrieves customer account history, reads inbound email text, and can call `send_email(to, subject, body)`.

Why it matters: A malicious email can instruct the agent to include private account details in a reply or send them to an attacker-controlled address. The model cannot reliably distinguish system instructions from instructions embedded in untrusted email text.

Fix: Remove one leg of the trifecta. The fastest safe fix is to make email sending draft-only with human review whenever the agent has ingested inbound email. A stronger design is to have a quarantined reader summarize untrusted email into structured fields while the privileged planner never sees raw email text.

Verification: Add an adversarial email fixture that asks the agent to forward private account details externally. The test passes only if the agent refuses or produces a draft requiring human approval and never calls `send_email`.

### 2. Retrieval is broad but not proven relevant

Severity: High

Laws: Retrieval Is the Ceiling; Relevant Beats Plenty; Keyword Still Carries Weight

Evidence: The agent retrieves the top 12 chunks from a vector database with no reranker.

Why it matters: Topically adjacent chunks can be more harmful than irrelevant chunks because they sound plausible while pointing to the wrong policy or customer. If the answer-bearing passage is absent, the model will still produce a fluent response.

Fix: Create a labeled set of support questions with known supporting passages. Measure recall@k and answer faithfulness. Add hybrid lexical search for exact IDs and policy names, then rerank before passing only the sharpest chunks into context.

Verification: The labeled retrieval set shows the answer-bearing passage in the final context for target cases, and generated replies cite the selected passage.

### 3. The metric hides high-risk segments

Severity: Medium

Laws: Averages Lie; Vibes Don't Scale; Regress or Repeat

Evidence: The team measures only average thumbs-up score and checks failed runs manually when users complain.

Why it matters: Overall satisfaction can look fine while billing, refunds, enterprise accounts, or edge-case policy questions fail badly. Complaint-driven review discovers failures after users are already harmed.

Fix: Slice evals by task type, account tier, language, policy area, and risk. Convert every serious complaint into a regression case.

Verification: A dashboard reports per-slice pass rates and the regression suite runs on every prompt/tool change.

## What Looks Solid

- The team has at least some user feedback signal.
- The agent drafts customer-facing responses in a bounded domain.

## Unknowns / Needed Evidence

- Actual system prompt and tool descriptions.
- Whether sent emails are logged with full context.
- Whether customers can include attachments or HTML content.

## 7-Day Fix Plan

1. Disable direct `send_email` for runs that ingest inbound email; switch to draft approval.
2. Add one adversarial prompt-injection test for the email workflow.
3. Build a 30-case retrieval eval set from real support tickets.
4. Slice satisfaction and failure metrics by support category.
5. Start converting every complaint into a regression fixture.
