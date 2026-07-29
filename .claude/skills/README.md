# Imported skills

Third-party Claude Code skills imported for Flag-It, reviewed before inclusion (each
source repo was cloned and read in full — SKILL.md content, any hooks/scripts —
before copying anything in).

| Skill | Source | License |
|---|---|---|
| `supabase/` | [supabase/agent-skills](https://github.com/supabase/agent-skills) | MIT |
| `supabase-postgres-best-practices/` | [supabase/agent-skills](https://github.com/supabase/agent-skills) | MIT |
| `accesslint-audit/`, `accesslint-scan/`, `accesslint-diff/` | [accesslint/claude-marketplace](https://github.com/accesslint/claude-marketplace) | MIT |
| `../commands/run-audit.md`, `../commands/fix-issues.md` (Lighthouse) | [rohitg00/awesome-claude-code-toolkit](https://github.com/rohitg00/awesome-claude-code-toolkit) (`plugins/lighthouse-runner`) | Apache-2.0 |

The AccessLint skills depend on the `accesslint` MCP server (`npx @accesslint/mcp@latest`,
declared in the repo's root `.mcp.json`) — first use will fetch that package from npm.

## Not imported

- **Community-Access/accessibility-agents** — reviewed, but it's a full multi-agent
  framework that installs `PreToolUse` hooks blocking edits to any `.html`/`.css`/`.jsx`
  file until an `@accessibility-lead` review marker exists. That's a workflow-changing
  gate Flag-It didn't ask for, not a lightweight skill, so it was left out.
- **jwynia/agent-skills `pwa-development`** — targets React/Svelte/Vite projects with
  Workbox and TypeScript build scripts, which conflicts with Flag-It's explicit
  "no build system, no npm dependencies" constraint (see root `CLAUDE.md`).
