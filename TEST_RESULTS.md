# SignalDesk Test Results

## Command

```bash
npx vitest run --coverage
```

## Output (2026-02-25)

```text
✓ src/__tests__/signaldesk.integration.test.ts (1 test)
✓ src/__tests__/signaldesk.unit.test.ts (4 tests)

Test Files  2 passed (2)
Tests       5 passed (5)
Duration    570ms

Coverage report from v8
---------------|---------|----------|---------|---------|--------------------
File           | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
---------------|---------|----------|---------|---------|--------------------
All files      |   86.01 |    77.46 |   87.75 |   87.03 |
signaldesk.ts  |   86.01 |    77.46 |   87.75 |   87.03 | 74,151-152,384-424
---------------|---------|----------|---------|---------|--------------------
```

## Build Verification

```bash
npm run build
```

```text
vite v7.3.1 building client environment for production...
✓ 32 modules transformed.
✓ built in 310ms
```
