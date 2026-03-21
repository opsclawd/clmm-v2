
## BMAD-METHOD Integration

BMAD commands are available as Codex Skills. Use `$command-name` to invoke them
(e.g., `$create-prd`, `$analyst`). See `_bmad/COMMANDS.md` for a full reference.

### Phases

| Phase | Focus | Key Agents |
|-------|-------|-----------|
| 1. Analysis | Understand the problem | Analyst agent |
| 2. Planning | Define the solution | Product Manager agent |
| 3. Solutioning | Design the architecture | Architect agent |
| 4. Implementation | Build it | Developer agent, then Ralph autonomous loop |

### Workflow

1. Work through Phases 1-3 using BMAD agents and workflows
2. For PRD creation, use `_bmad/lite/create-prd.md` for single-turn generation
3. Use the bmalph-implement transition to prepare Ralph format, then start Ralph
