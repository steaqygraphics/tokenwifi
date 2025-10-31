import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Pastikan plugin @vitejs/plugin-react dimuat
export default defineConfig({
  plugins: [react()],
  // Tidak ada konfigurasi build atau root kustom.
  // Vite akan otomatis menggunakan index.html dan dist.
});
