import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Konfigurasi Vite default untuk aplikasi React
export default defineConfig({
  plugins: [react()],
  // Tidak ada konfigurasi 'build' kustom
  // Ini akan menggunakan 'index.html' sebagai entry point
});
