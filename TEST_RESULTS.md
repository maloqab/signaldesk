# SignalDesk Test Results

## Command

```bash
npx vitest run --coverage
```

## Output (2026-02-25)

```text
✓ src/__tests__/signaldesk.integration.test.ts (1 test)
✓ src/__tests__/signaldesk.unit.test.ts (5 tests)

Test Files  2 passed (2)
Tests       6 passed (6)
Duration    528ms

Coverage report from v8
---------------|---------|----------|---------|---------|-----------------------
File           | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
---------------|---------|----------|---------|---------|-----------------------
All files      |   85.27 |    74.73 |   85.93 |   86.87 |
signaldesk.ts  |   85.27 |    74.73 |   85.93 |   86.87 | ...52,518-558,569-574
---------------|---------|----------|---------|---------|-----------------------
```

## Build Verification

```bash
npm run build
```

```text
vite v7.3.1 building client environment for production...
✓ 32 modules transformed.
✓ built in 314ms
```
