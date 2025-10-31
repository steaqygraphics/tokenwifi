import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Konfigurasi Vite
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        // Mendefinisikan main.jsx sebagai entry point
        main: 'main.jsx', 
      },
    },
  },
});
