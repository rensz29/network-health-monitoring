import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { ToastProvider } from './components/Toasts.jsx';
import { TooltipProvider } from './components/Tooltip.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <TooltipProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </TooltipProvider>
  </StrictMode>,
);
