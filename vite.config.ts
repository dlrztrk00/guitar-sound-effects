import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // served from https://dlrztrk00.github.io/guitar-sound-effects/
  base: '/guitar-sound-effects/',
})
