# SignalDesk

SignalDesk is an AI-operator style console for turning messy context (links, notes, docs, transcript fragments) into:
- structured intelligence briefs
- ranked decisions
- 24h / 7d / 30d action roadmaps
- execution-ready task packets by role

Built local-first with no backend requirement.

## Who it serves

- Solo founders and operators handling fragmented context
- Analysts turning raw inputs into decision memos
- AI-native teams that need execution packets, not generic summaries

## What we built

### 1) Intake Layer
- Bulk text intake (one source per line)
- Source classification (`url`, `note`, `transcript`, `document`)
- URL validity checks + invalid-source highlighting
- Local session save/reload (`localStorage`)

### 2) Intel Engine
- Per-source multi-claim extraction across:
  - opportunities
  - risks
  - assumptions
  - unknowns
- Confidence scoring per claim (`confidenceScore`) + bucket (`high`/`medium`/`low`)
- Extracted signal set designed for explainability/tuning

### 3) Decision Layer
- Weighted ranking using impact, urgency, effort, and confidence adjustments
- Decision rationale generated for each ranked item
- 24h / 7d / 30d roadmap with owner + success metric

### 4) Execution Packets
Role-specific packets for:
- Coder
- Researcher
- Writer
- Notion

Each packet includes:
- objective
- context
- tasks
- acceptance criteria
- dependencies
- risks
- handoff prompt
- expected output

Exports:
- full intelligence pack (`.md`, `.json`)
- per-role packet markdown export

## Architecture

Single-page React app with deterministic local inference.

- `src/App.tsx`
  - source parsing + classification
  - confidence scoring
  - claim extraction
  - decision scoring + roadmap generation
  - packet generation + export orchestration
- `src/App.css`
  - responsive operator-console UI

Processing pipeline:
1. Intake text -> parsed sources
2. Sources -> claims + confidence
3. Claims -> ranked decisions
4. Decisions -> roadmap + packets
5. Exports -> markdown/json artifacts

## Data model (core types)

- `SourceItem`: id, raw, type, valid
- `Claim`: type, text, confidence, confidenceScore, sourceId
- `Decision`: title, rationale, impact, effort, urgency, score, horizon
- `RoadmapItem`: horizon, action, owner, successMetric
- `Packet`: role, objective, context, tasks, acceptanceCriteria, dependencies, risks, handoffPrompt, output
- `SavedSession`: id, name, createdAt, intakeText

## UX and keyboard flow

- Responsive multi-panel workspace layout
- Live status strip for action feedback
- Keyboard shortcuts:
  - `Cmd/Ctrl + Enter`: export markdown pack
  - `Cmd/Ctrl + S`: save session
- Clear empty/error states:
  - disabled exports when no sources
  - notices for save/load/export failure states
  - invalid URL count surfaced in intake meta

## Run locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run lint
npm run build
npm run preview
```

## Scope boundaries (current)

- No backend, auth, or server persistence
- No external LLM calls in current version (deterministic local heuristics)
- Notion support is packet/schema-ready export format, not direct API sync yet

## Why this is helpful

SignalDesk bridges a gap between summary tools and execution systems: it converts noisy context into operator-grade outputs with explicit decisions, owners, timelines, and handoff artifacts.
