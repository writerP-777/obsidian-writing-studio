Start a new session. Do the following before we begin any work:

1. Read CONTEXT.md
2. Read all memory files linked in MEMORY.md
3. Run: git fetch origin && git status && git log --oneline -10
4. Run: npm run lint
5. Check open GitHub issues: gh issue list --state open --limit 20
6. Check open PRs: gh pr list --state open
7. Read the latest end-session note (exclude Cowork updates):
   Get-ChildItem "C:\Users\donpu\Vaults\Pucik Notes\Obsidian Writing Studio\*Session Update.md" | Where-Object { $_.Name -notmatch 'Cowork' } | Sort-Object LastWriteTime -Descending | Select-Object -First 1 | Get-Content
8. If today is Monday, check: gh issue view 1185 --repo johansan/notebook-navigator

Then give me a structured session brief:
- Last session summary: what was worked on and what was completed
- Current state: version (from manifest.json), branch status, any uncommitted work, lint result, open issues and PRs flagged ready-for-agent
- Known next steps: based on session notes, open issues, and memory
- Flags: anything that needs attention before we start (failing lint, stale memory, pending releases, etc.)
