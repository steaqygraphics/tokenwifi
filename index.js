import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './app.jsx';

const container = document.getElementById('root');
const root = createRoot(container);

// Render komponen utama App yang Anda buat
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
