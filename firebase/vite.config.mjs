import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {fileURLToPath} from 'node:url';
export default defineConfig({
  root: fileURLToPath(new URL('./web', import.meta.url)), plugins: [react()],
  resolve: {alias: {'@': fileURLToPath(new URL('..', import.meta.url))}}, publicDir: false,
  define: {__FAMBIT_EMULATOR__: process.env.FAMBIT_BUILD_EMULATOR === 'true' ? 'true' : 'false'},
  build: {outDir: '../dist', emptyOutDir: true, rollupOptions: {input: fileURLToPath(new URL('./web/admin.html', import.meta.url))}},
});
