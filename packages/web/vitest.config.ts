import { defineConfig } from 'vitest/config';
import { compile, compileModule } from 'svelte/compiler';

export default defineConfig({
  plugins: [
    {
      name: 'vite-plugin-svelte-test',
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
  },
});
