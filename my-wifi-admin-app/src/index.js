import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './main.jsx'; // Import komponen utama
import './index.css'; // File styling (Tailwind CSS, akan dijelaskan di bawah)

// Pastikan komponen App yang diimpor dari main.jsx adalah default export

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);