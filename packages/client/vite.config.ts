import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Reads VITE_SERVER_URL from the shell/`.env` and injects it as the plain global `__SERVER_URL__`,
 * rather than relying on Vite's usual `import.meta.env.VITE_*` convention: `import.meta` syntax is
 * only legal under an ESM `module` target, but `packages/client/tsconfig.json` targets CommonJS so
 * that ts-jest can transform the same sources for Jest — switching the whole workspace to an ESM
 * target would require reworking Jest for ESM too (out of scope here, see ClientMain.tsx). A plain
 * `define`d identifier needs no such restriction and typechecks under either module target.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    define: {
      __SERVER_URL__: JSON.stringify(env.VITE_SERVER_URL || 'http://localhost:3001'),
    },
    // @arena/shared is an npm workspace package built as CommonJS (tsconfig.base.json's `module:
    // CommonJS`, chosen so ts-jest can transform the same sources across every package — see
    // ClientMain.tsx's DEFAULT_SERVER_URL comment). Vite resolves workspace symlinks to their real path
    // outside node_modules, so it never pre-bundles @arena/shared into ESM the way it does for ordinary
    // node_modules dependencies; the browser then receives raw `require`/`exports` syntax as a native
    // ES module and fails with "does not provide an export named ...". Forcing it into optimizeDeps
    // makes esbuild convert it to ESM like any other CJS dependency, for both dev and `vite build`.
    optimizeDeps: {
      include: ['@arena/shared'],
    },
    build: {
      commonjsOptions: {
        include: [/shared/, /node_modules/],
      },
    },
  };
});
