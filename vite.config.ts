import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    // Several simulation tests step hundreds of deterministic ticks and/or
    // run a full headless evaluatePlan() comparison; under parallel
    // test-worker CPU contention these can exceed Vitest's 5s default and
    // flake even though they're not actually hung.
    testTimeout: 15000,
  },
})
