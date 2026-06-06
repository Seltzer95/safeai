# safeai

## Stack
- **Framework**: TanStack Start (React + Vite, TypeScript strict)
- **Styling**: Tailwind v4, shadcn/ui
- **AI Inference**: transformers.js v4 (`@huggingface/transformers`) — in-browser, Web Worker only
- **Persistence**: IndexedDB
- **Package manager**: pnpm
- **Tests**: Vitest

## Commands
```
pnpm dev       # start dev server
pnpm build     # production build
pnpm test      # run vitest
pnpm lint      # eslint
```

## Conventions

### Inference & vector math
All `@huggingface/transformers` calls and vector operations run exclusively in a Web Worker — never on the main thread. Communicate via `postMessage`/`onmessage`. Do not import pipeline or model utilities in any file that runs on the main thread.

### Modules
Prefer small, single-responsibility modules. One concept per file. Avoid large barrel files.

### Tests
Colocate tests with source: `foo.ts` → `foo.test.ts` in the same directory. Unit-test pure logic; use Vitest workers for worker code.

### TypeScript
Strict mode is on. No `any`. Prefer explicit return types on exported functions.

### Components
Use shadcn/ui primitives. Keep components presentational where possible; push state and side effects up or into dedicated hooks.
