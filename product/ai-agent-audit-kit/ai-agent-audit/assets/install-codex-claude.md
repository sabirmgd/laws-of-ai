# Install The AI Agent Audit Skill

The kit can be used where the agent already lives:

- In a code repo through Codex or Claude Code.
- In n8n, Zapier, Make, Retool, Voiceflow, or Botpress by exporting workflow JSON and execution logs.
- In SDK/API stacks by providing agent code, tool schemas, traces, and evals.
- In black-box situations by providing transcripts, screenshots, demos, and allowed probe questions.

## Codex

Copy the `ai-agent-audit` folder into your Codex skills directory:

```bash
mkdir -p ~/.codex/skills
cp -R ai-agent-audit ~/.codex/skills/
```

Restart Codex, then ask:

```text
$ai-agent-audit audit this repo's support agent
$ai-agent-audit audit this n8n workflow export
$ai-agent-audit run a black-box audit from these transcripts
$ai-agent-audit produce a client-ready audit report
```

## Claude

Copy the `ai-agent-audit` folder into your Claude skills directory:

```bash
mkdir -p ~/.claude/skills
cp -R ai-agent-audit ~/.claude/skills/
```

Restart Claude Code, then ask:

```text
$ai-agent-audit audit my LangGraph agent
$ai-agent-audit audit this workflow export
$ai-agent-audit turn this into a client report
```

## No Skill Support

Use `assets/copy-paste-audit-prompt.md` instead. Paste the prompt into your agent tool with your agent's system prompt, tool list, retrieval setup, evals, and traces. For the strongest copy-paste audit, also paste `references/50-laws-audit-rubric.md`.
