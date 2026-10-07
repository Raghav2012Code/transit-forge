import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Three.js alone is about 570 kB minified and cannot be cut further without dropping features;
    // everything else stays well under this.
    chunkSizeWarningLimit: 600,
    rolldownOptions: {
      output: {
        // Three.js is the bulk of the bundle and changes far less often than the app,
        // so it gets its own file: cached across releases and fetched alongside the app code.
        codeSplitting: {
          groups: [
            { name: 'three', test: /node_modules[/]three[/]/ },
            { name: 'react', test: /node_modules[/]react(-dom)?[/]|node_modules[/]scheduler[/]/ },
          ],
        },
      },
    },
  },
  test: {
    // Several simulation tests step hundreds of deterministic ticks and/or
    // run a full headless evaluatePlan() comparison; under parallel
    // test-worker CPU contention these can exceed Vitest's 5s default and
    // flake even though they're not actually hung.
    testTimeout: 15000,
  },
})
