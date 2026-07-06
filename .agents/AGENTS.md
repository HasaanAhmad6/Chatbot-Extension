# Workspace Rules

## Changelog Documentation Requirement
- **Rule**: For every code change, feature addition, refactoring step, or bug fix made during this session or future sessions, the agent must update `CHANGELOG.md`.
- **Format**: All logs must follow the Keep a Changelog format:
  - Categorized under headers: `### Added`, `### Changed`, `### Fixed`, `### Security`.
  - Nested under the correct version header (e.g., `## [0.2.4] - 2026-06-30`).
- **Timing**: The `CHANGELOG.md` must be updated *before* git commits, builds, and pushes are executed for that step.

## Graphify Update & Query Rule
- **Rule**: Every time code or files are changed, update the graphify knowledge graph. When answering any codebase or architecture questions, always use the graphify query flow (as described in the `graphify` skill) first.

