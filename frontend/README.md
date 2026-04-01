# Frontend

Next.js 14 app for Podster's local-first recording flow.

## Useful commands

```bash
pnpm dev
pnpm lint
pnpm typecheck
pnpm test:tooling
pnpm exec playwright test
```

## Type checking

This app includes `.next/types/**/*.ts` in [tsconfig.json](./tsconfig.json) so Next route types stay visible to TypeScript.

On a fresh checkout, `pnpm typecheck` first runs `scripts/ensure-next-types.mjs` to create minimal placeholder files for each App Router `layout` and `page` entry. Those placeholders exist only to keep `tsc` stable before Next has generated its own route types.

Use `pnpm test:tooling` after changing the stub generator.
