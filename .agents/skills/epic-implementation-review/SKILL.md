---
name: epic-implementation-review
description: Use when reviewing an implementation against an epic or milestone spec. Performs a spec-compliance audit with subagents, runs required verification commands, enforces evidence-first reporting, and outputs PASS/PARTIAL/FAIL by requirement rather than generic code review.
---

# Epic Implementation Review

Audit an implementation against an epic spec with exact evidence.

This is not a general code review skill.
This is not an implementation skill.
This is a spec-compliance audit skill.

## Use this when

Use this skill when:
- a repo implementation must be reviewed against an epic, milestone, plan, or acceptance-criteria document
- the user wants to know whether implementation matches the spec exactly
- the task requires checking file maps, architecture constraints, guardrails, smoke tests, CI commands, or done-when clauses
- passing CI alone is not enough

Do not use this skill for:
- vague “review my code” requests without a source-of-truth spec
- implementation work
- refactoring without a spec to audit against

## Required inputs

You need:
1. The epic/spec document path or attached file
2. The repository / workspace
3. Permission to run verification commands if execution is required

If the epic is missing, stop and say the audit cannot be grounded.

## Core contract

Your job is to answer one question:

> Does the current implementation comply with the epic as written?

You must output:
- overall verdict
- requirement-by-requirement PASS / PARTIAL / FAIL
- exact repo evidence
- fresh verification evidence
- drift from epic wording, not just behavioral defects

## Iron rules

- The epic is source of truth.
- Exact matches beat intention.
- Working substitutions are still drift if the epic asked for a different shape.
- Passing CI is not sufficient if the epic also requires specific files, boundaries, smoke tests, or absence constraints.
- No success claims without fresh verification evidence.
- Do not mutate code unless the user explicitly asked for repair, not review.

## Execution model

### Stage 1 — Extract the audit checklist

Spawn `epic_spec_extractor`.

Its job:
- turn the epic into a normalized checklist
- assign requirement IDs
- split requirements by category
- record exact commands and expected outcomes
- record explicit prohibitions

Required categories:
- file map
- file contents / structural requirements
- scripts / configuration / dependency wiring
- commands that must pass
- negative or adversarial tests that must fail
- done-when clauses
- prohibited concepts or imports
- sequencing constraints such as “no business logic yet”

### Stage 2 — Inspect the repo

Spawn `repo_auditor`.

Its job:
- inspect the repo without modifying it
- map checklist items to files, paths, symbols, scripts, and configs
- classify each requirement as PASS / PARTIAL / FAIL
- surface hidden substitutions
- surface missing tests and unverifiable areas

### Stage 3 — Run required verification

Spawn `runtime_verifier` after Stage 1 completes.

Its job:
- run the verification commands explicitly required by the epic
- run negative/adversarial checks explicitly required by the epic
- use superpowers:verification-before-completion as a hard gate before any success claim
- report exact command, exit code, and decisive output
- never infer success from earlier runs or nearby commands

### Stage 4 — Synthesize

Combine subagent outputs into one final report.

## Review procedure

1. Read the epic carefully.
2. Extract the normalized checklist.
3. Audit the repo against the checklist.
4. Run required commands fresh.
5. Run required negative tests fresh if the epic requires them.
6. Merge static and runtime evidence.
7. Produce the final compliance report.

## Scoring rules

### PASS
Use PASS only when:
- the requirement exists exactly or materially exactly as written
- the evidence is direct
- any required command was run fresh and confirmed

### PARTIAL
Use PARTIAL when:
- implementation exists but shape differs from the spec
- evidence is indirect or incomplete
- a substitute was used
- verification is incomplete
- command coverage is narrower than the epic requires

### FAIL
Use FAIL when:
- requirement is missing
- requirement is contradicted
- required command fails
- required negative test does not behave as required
- prohibited logic/import/concept exists
- the repo cannot prove the requirement

## Evidence standards

For every item include:
- requirement ID
- epic quote or paraphrase
- expected evidence
- actual evidence
- status
- why the status is justified

Prefer:
- exact file paths
- exact symbols
- exact script names
- exact command output
- exact failing/passing condition

Do not write:
- “looks good”
- “seems implemented”
- “probably fine”
- “mostly there”

## Report format

Produce exactly these sections.

### 1. Verdict
One paragraph:
- COMPLIANT
- PARTIALLY COMPLIANT
- NON-COMPLIANT

### 2. Executive failures
List the highest-severity FAIL items first.

### 3. Compliance matrix
Markdown table:

| ID | Category | Requirement | Expected | Actual evidence | Status |
|----|----------|-------------|----------|-----------------|--------|

### 4. Verification log
For each executed command:

| Command | Purpose | Exit code | Decisive output | Result |
|---------|---------|-----------|-----------------|--------|

### 5. Drift and substitutions
List places where implementation works but diverges from requested architecture, file shape, or enforcement method.

### 6. Unverifiable items
List anything the repo could not prove.

### 7. Final bottom line
State:
- what is truly done
- what is missing
- what blocks compliance

## Special handling for enforcement epics

If the epic contains:
- boundary rules
- banned-concept scanners
- smoke tests with temporary violation files
- “only this file may import X”
- “no business logic yet”
- final CI gates

Then these are first-class requirements.
Do not demote them behind normal code review observations.

## Explicit use of verification-before-completion

Before saying any of these:
- “passes”
- “complete”
- “done”
- “compliant”
- “verified”

You must ensure fresh proof exists from the current session.

Minimum gate:
1. identify proving command
2. run proving command
3. read full result
4. report evidence
5. only then make the claim

## Failure mode handling

If the epic is underspecified:
- list ambiguity
- mark dependent items UNVERIFIABLE or PARTIAL
- do not silently invent acceptance criteria

If verification is blocked:
- report the blocking command and error
- do not claim partial success beyond proven evidence

If the repo drifts in a way that still passes CI:
- mark it as drift
- downgrade from PASS when the epic required exact structure

## Final reminder

This skill exists to prevent false confidence.

Spec compliance is earned by evidence, not by intent.