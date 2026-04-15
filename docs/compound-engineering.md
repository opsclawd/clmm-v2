# Compound Engineering Workflow

This repo uses Compound Engineering as a standard way to preserve learnings after completed work.

Reference:

- https://github.com/EveryInc/compound-engineering-plugin

## Default Expectation

Before starting a new story, bugfix, or investigation, check `docs/solutions/` for prior learnings that may apply to the work.

This repo treats `docs/solutions/` as cumulative operational memory for future agent sessions and contributors.

After completing a story or bugfix, consider whether the work produced a durable learning that should help future sessions. If it did, capture it with `/ce:compound`.

This is expected for work that uncovered:

- Non-obvious debugging findings
- New repo-specific implementation patterns
- Repeated failure modes
- Agent workflow improvements
- Important library or integration gotchas
- Architectural constraints that are easy to violate

## When To Use `/ce:compound`

Use it when the learning will likely save time, prevent regressions, or improve future agent behavior.

Good examples:

- A solution note that future sessions should read before touching a subsystem
- A fresh-worktree failure mode and the right bootstrap fix
- A recurring mistake around directional policy or lifecycle transitions
- A subtle adapter boundary rule that was easy to miss
- A test fixture pattern future contributors should reuse

## Starting New Work

Before implementation:

1. Check `docs/solutions/` for relevant prior work, learnings, or failure modes.
2. Reuse those learnings when they still match the current codebase.
3. If a learning appears stale or contradicted by the current code, treat that as a signal to refresh or replace it after finishing the work.

## When Not To Use It

Do not create a learning just to satisfy process.

Skip `/ce:compound` when:

- The work was trivial and produced no reusable insight
- The result is already obvious from code and docs
- The note would be too specific to a one-off local situation

If you decide not to create a learning, say that no durable learning was produced.

## Quality Bar

Useful learning captures should be brief and specific:

- What changed or was discovered
- Why it matters
- What future agents or contributors should do differently

Prefer concrete patterns and failure-prevention guidance over narrative retrospectives.
