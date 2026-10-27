import { defineConfig } from 'vitest/config';
import { compile, compileModule } from 'svelte/compiler';
import fs from 'node:fs';
import path from 'node:path';

export default defineConfig({
  resolve: {
    conditions: ['browser'],
  },
  plugins: [
    {
      name: 'vite-plugin-svelte-test',
      async resolveId(source, importer) {
        if (source.endsWith('.js') && importer) {
          const dir = path.dirname(importer);
          const fullPath = path.resolve(dir, source);
          const tsPath = fullPath.replace(/\.js$/, '.ts');
          if (fs.existsSync(tsPath)) {
            return tsPath;
          }
          const svelteTsPath = fullPath.replace(/\.js$/, '.svelte.ts');
          if (fs.existsSync(svelteTsPath)) {
            return svelteTsPath;
          }
        }
      },
      transform(code, id) {
        if (id.includes('.svelte.ts') || id.includes('.svelte.js')) {
          const compiled = compileModule(code, { filename: id });
          return { code: compiled.js.code, map: compiled.js.map };
        }
        if (id.endsWith('.svelte')) {
          const compiled = compile(code, { filename: id, generate: 'client' });
          return { code: compiled.js.code, map: compiled.js.map };
        }
      },
    },
  ],
  test: {
    globals: true,
    fileParallelism: false,
    maxWorkers: 1,
  },
});
