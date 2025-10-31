import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Konfigurasi Vite default untuk aplikasi React
export default defineConfig({
  plugins: [react()],
  // Konfigurasi ini biasanya tidak diperlukan di Canvas/Vercel, 
  // tetapi disertakan untuk menghindari masalah path relatif.
  resolve: {
    alias: {
      // Menggunakan alias untuk path absolut jika diperlukan
      '@/': '/src/', 
    },
  },
  // Pastikan output directory adalah 'dist'
  build: {
    outDir: 'dist',
  }
});
