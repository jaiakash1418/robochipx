import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import { SimulationProvider } from './context/SimulationContext';
import './styles/variables.css';
import './index.css';
import './App.css';
import './i18n';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SimulationProvider>
      <RouterProvider router={router} />
    </SimulationProvider>
  </React.StrictMode>,
);