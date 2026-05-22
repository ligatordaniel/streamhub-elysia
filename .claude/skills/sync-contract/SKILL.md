---
name: sync-contract
description: "Use when editing shared instructions, docs, or mirrored skills that must stay identical between Copilot and Claude Code."
user-invocable: true
risk: safe
---

# Sync Contract Skill

This skill keeps the shared instruction contract aligned across Copilot and Claude Code.

## Use when
- Updating docs/ai/project-context.md.
- Updating .github/copilot-instructions.md, AGENTS.md, or CLAUDE.md.
- Adding, renaming, or changing a shared skill in .github/skills or .claude/skills.
- Fixing a mismatch between mirrored instruction files.

## Core rules
- Treat docs/ai/project-context.md as the source of truth.
- Update the shared context first.
- Apply the same semantic change to every mirrored entry file in the same change.
- If a skill exists in one skills folder, create or update the mirrored copy in the other folder at the same time.
- Do not leave a known mismatch behind.

## Workflow
1. Read docs/ai/project-context.md.
2. Edit the source-of-truth text.
3. Update .github/copilot-instructions.md, AGENTS.md, and CLAUDE.md so they match the new rule set.
4. Update both skill mirrors when a skill changes.
5. Validate that the mirrored files say the same thing.
6. If a change cannot be mirrored cleanly, stop and fix the mismatch before shipping.

## Checklist
- Source of truth changed first.
- Copilot and Claude entry files are aligned.
- Skill mirrors are identical.
- No shared rule exists in only one place.