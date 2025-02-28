import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import AutoSenderApp from './components/AutoSenderApp.tsx';

// Check if we're on the auto sender page
const isAutoSender = window.location.pathname.includes('sender-auto.html');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isAutoSender ? <AutoSenderApp /> : <App />}
  </StrictMode>
);