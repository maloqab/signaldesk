# SignalDesk QA Checklist

## Manual Validation Steps

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
8. Click *Export JSON* and verify downloaded JSON includes `sources`, `claims`, `decisions`, `roadmap`, `packets`.
9. Validate packet export buttons generate per-role markdown files.
10. Optional error-boundary smoke test:
    - Temporarily throw inside `App` render.
    - Confirm fallback message from `ErrorBoundary` is displayed.
