# Agent guide

Conventions for any agent (Cursor, Claude Code, Codex, etc.) working in this repo.

## Plans live in `./plans/`

This repo uses a lightweight planning workflow. Plans capture *why* and *how* before any non-trivial change ships, and they accumulate context over time as work moves between sessions and tools.

### Layout

- `./plans/<name>.plan.md` - active plans being executed.
- `./plans/archived/<name>.plan.md` - completed plans, kept for posterity (architecture decisions, deviations, follow-ups).

### Plan file shape

YAML frontmatter plus a markdown body:

```yaml
---
name: short kebab-cased name
overview: one-paragraph what + why
status: pending | in-progress | completed
todos:
  - id: stable-id
    content: imperative description of the task
    status: pending | in-progress | completed | cancelled
---
```

The body should cover (roughly): architecture, repo layout, conventions, per-task details, deferred questions. A mermaid diagram is encouraged when there's a non-trivial data flow. End the body with a `## Run summary` stub for later filling.

### Executing a plan

1. Read the plan top-to-bottom before touching code. Flag any ambiguity to the user before starting; don't guess.
2. Work the todos roughly in order. Update each todo's `status` in the frontmatter as you go (`pending` -> `in-progress` -> `completed`). Only one `in-progress` at a time.
3. If you discover the plan is wrong mid-execution, **edit the plan** rather than silently diverging. Add a `## Plan changes` section capturing what changed and why, so future readers see the history.
4. Don't expand scope beyond the todos without confirming with the user.

### Completing a plan

When all todos are `completed` (or `cancelled` with rationale):

1. Fill in the `## Run summary` section. Cover:
   - **What was built** - one-liner per todo, linking to key files.
   - **Deviations from the plan** - what changed during execution and why.
   - **Surprises / gotchas** - footguns, weird APIs, things future-you will want to know.
   - **Follow-ups** - work that should land in a future plan, not this one.
2. Flip the frontmatter `status` to `completed`.
3. Move the file: `./plans/<name>.plan.md` -> `./plans/archived/<name>.plan.md`.

Archived plans are read-only history. Don't edit them after archival - if you need to revisit the topic, start a new plan that references the archived one.

## Active plans

_(none — see `./plans/archived/` for history.)_

## Repo-specific conventions

(Beyond planning - filled in as the repo matures. For now, see the active plan above for architecture, tag conventions, kind module shape, and pipeline-template contracts.)
