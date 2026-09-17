# Two edits required in packages/providers/core

## 1. Add glassdoor to ProviderId — `src/types.ts`

```diff
-export type ProviderId = 'naukri' | 'linkedin' | 'ats-generic';
+export type ProviderId = 'naukri' | 'glassdoor' | 'linkedin' | 'ats-generic';
```

Without this, `GlassdoorProvider` needs the `as ProviderId` cast it currently carries,
and `ProviderRegistry.get('glassdoor')` will not typecheck.

## 2. Export the test helpers — `package.json`

```diff
   "main": "dist/index.js",
   "types": "dist/index.d.ts",
+  "exports": {
+    ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
+    "./testing/*": { "types": "./src/testing/*.ts", "default": "./src/testing/*.ts" }
+  },
```

`fakePage.ts` and `conformance.ts` are consumed by other packages' tests as source
(tsx resolves them directly), so they are intentionally not built into `dist`.

## 3. Re-export the new modules — `src/index.ts`

```diff
 export * from './types.js';
 export * from './registry.js';
+export * from './questions.js';
+export * from './rateBudget.js';
+export * from './session.js';
```
