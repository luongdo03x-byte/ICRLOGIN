import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './App.js';
import { I18nDomBridge } from './i18n/I18nDomBridge.js';
import './styles.css';
import './phase4.css';
import './phase7.css';

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 1500, refetchOnWindowFocus: false, retry: 1 } } });
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><QueryClientProvider client={queryClient}><I18nDomBridge /><App /></QueryClientProvider></React.StrictMode>
);
