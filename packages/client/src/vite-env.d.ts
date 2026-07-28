/**
 * `__SERVER_URL__` is injected by `vite.config.ts`'s `define` at build/dev/preview time from
 * `VITE_SERVER_URL`; it is simply absent (not `undefined`-typed-but-present) when this file is
 * compiled outside Vite, e.g. by ts-jest — see ClientMain.tsx's `typeof __SERVER_URL__` guard.
 */
declare const __SERVER_URL__: string | undefined;
