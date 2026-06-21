# Install The AI Agent Audit Skill

## Codex

Copy the `ai-agent-audit` folder into your Codex skills directory:

```bash
mkdir -p ~/.codex/skills
cp -R ai-agent-audit ~/.codex/skills/
```

Restart Codex, then ask:

```text
$ai-agent-audit audit my agent
```

## Claude

Copy the `ai-agent-audit` folder into your Claude skills directory:

```bash
mkdir -p ~/.claude/skills
cp -R ai-agent-audit ~/.claude/skills/
```

Restart Claude Code, then ask:

```text
$ai-agent-audit audit my agent
```

## No Skill Support

Use `assets/copy-paste-audit-prompt.md` instead. Paste the prompt into your agent tool with your agent's system prompt, tool list, retrieval setup, evals, and traces.
