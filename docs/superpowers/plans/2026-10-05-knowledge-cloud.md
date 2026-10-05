# Knowledge Cloud Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan inline, following the user's autonomous execution instruction.

**Goal:** Published garden and remote read-only AI access use the actual private knowledge library.

**Architecture:** Local Markdown → immutable batched Supabase replica → authenticated Vercel API → browser and stateless MCP.

**Tech Stack:** TypeScript, React, PostgreSQL, existing MCP SDK.

**Spec:** `docs/superpowers/specs/2026-10-05-knowledge-cloud-design.md`

## Global Constraints

- No private note data or credentials in Git/static build.
- Three independent ≥32-character tokens for owner reading, AI reading, uploading.
- Cloud is read-only to readers; local Markdown remains the source of truth.
- Requests below 3 MB; generation publication uses expected revision.

## Review Focus

- Incomplete batch: previous generation stays live.
- AI token presented to upload: 401.
- Wrong token: no database fetch and no note titles.
- Missing cloud config: explicit 503, never fake connected state.
- More than 1,000 notes: complete pagination, no truncation.

### Task 1: Private API and transactional publication

- [x] Write/run failing API tests for authentication and cloud reading.
- [x] Create `api/knowledge.ts`, `server/knowledge/cloud.ts`, migration `202610050001_knowledge.sql`: batch insert + commit RPC, private tables.
- [x] Add cloud MCP using the existing SDK; verify read-only tools and stateless requests.
- [x] Run API tests and native function checker.

### Task 2: Website authenticated reading

- [x] Write/run failing remote API and read-only workspace tests.
- [x] Modify knowledge API, workspace and connection instructions; add cloud session access-code gate.
- [x] Run knowledge UI tests and typecheck.

### Task 3: Synchronize and publish

- [x] Create local-only manifest and sync script; verify current vault counts and batch sizes without transmitting data.
- [x] Prepare concrete cloud configuration, obtain any necessary credential handoff, run migration and authorized import.
- [x] Run full tests/build, commit/push, check deployments, verify authenticated real graph and MCP calls.

## Verification and remaining cloud activation

- 361 frontend/API tests and 21 local knowledge integration tests passed.
- Native function loading and TypeScript checks passed; MCP response escaping tested with the real SDK client.
- Private local manifest: 1,227 notes, 1,409 edges, 13 batches; all notes uploaded and published as revision 1.
- User confirmed full-library synchronization and independent authenticated AI read-only access; user entered the production credentials.
- Supabase migration executed successfully; RLS enabled and anonymous table SELECT denied.
- Production redeployed with credentials, 13 batches uploaded, revision 1 published. All 1,227 note versions and the full graph match the local snapshot.
- Real production SDK HTTP MCP: five read-only tools, full list, longest note body and related links verified; anonymous reads and AI uploads rejected.
- Published browser page verified: connected cloud library, 1,227 notes, 1,409 real references, one unresolved reference. Attachments remain local.
