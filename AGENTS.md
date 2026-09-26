Explain major changes before implementing them.
Keep changes scoped.
Do not refactor unrelated code.
Preserve existing working flows.
For large changes, propose a plan first.
This project is called FileForge and has a Node/Express backend.

## Efficiency / context rules

- Do not inspect or traverse `node_modules/`, `.next/`, `test-output/`, logs, caches, generated temp folders, or ignored manual-QA fixtures unless the task explicitly requires them.
- Prefer targeted file inspection over repo-wide searches.
- Prefer concise command output and targeted tests.
- Do not rerun the full test suite unless explicitly requested or clearly necessary.
- Keep final summaries brief.