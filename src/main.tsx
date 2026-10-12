import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { installNetworkGuard } from './lib/offline';
import './index.css';

installNetworkGuard();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary scope="root" name="root">
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
);
