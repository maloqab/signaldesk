# SignalDesk QA Checklist

## Manual Validation Steps (Gate 1 + Gate 2)

1. Start app locally:
   - `npm install`
   - `npm run dev`
2. Paste mixed intake (URL, note, transcript) and verify source badges map correctly.
3. Enter an invalid URL line (e.g. `http:/broken`) and confirm invalid count + red item styling.
4. Leave intake empty and verify:
   - Export buttons are disabled.
   - Validation message appears after interaction.
5. Enter a session name + valid intake and click *Save Session*:
   - Success notice appears.
   - Saved session is visible in dropdown.
6. Pick saved session and click *Load*:
   - Intake text restores.
7. Trigger keyboard shortcuts:
   - `Ctrl/Cmd + S` saves session.
   - `Ctrl/Cmd + Enter` exports markdown.
8. Confirm explainability in UI:
   - Claims show component breakdown (SQ/SR/R/P)
   - Decisions show “Why this score” and governance reasons
9. Governance rules check:
   - Use conflicting input (contains both opportunity and risk signal from same source)
   - Verify at least one decision becomes `needs-review`
10. Export gating check:
   - While any decision is `needs-review`, final export buttons remain disabled and blocker message is visible
11. Reviewer workflow:
   - Set decision status to `accepted` and add reviewer notes
   - Refresh page and confirm reviewer actions persist (session storage)
12. Final export after review resolution:
   - Resolve all `needs-review` statuses
   - Export JSON and verify `reviewerTrail` exists
   - Export Markdown and verify `## Reviewer Trail` section includes notes/dispositions
13. Packet export:
   - Verify per-role packet buttons still generate markdown files
14. Optional error-boundary smoke test:
   - Temporarily throw inside `App` render.
   - Confirm fallback message from `ErrorBoundary` is displayed.
