import React from 'react';
import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import { SimulationProvider } from './context/SimulationContext';
import { ToastProvider } from './toast/ToastContext';
import './styles/variables.css';
import './index.css';
import './App.css';
import './i18n';

export default function App() {
  return (
    <React.StrictMode>
      <SimulationProvider>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </SimulationProvider>
    </React.StrictMode>
  );
}