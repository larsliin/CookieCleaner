import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    outDir: 'dist-extension',
    emptyOutDir: false,
    lib: {
      entry: 'src/background.ts',
      formats: ['es'],
      fileName: () => 'background.js',
    },
  },
})
