import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient,QueryClientProvider } from '@tanstack/react-query';
import '@fontsource-variable/manrope';
import './style.css';
import { VisualProvider } from './visual';
import { App } from './App';
const client=new QueryClient({defaultOptions:{queries:{retry:1,staleTime:10000}}});
createRoot(document.getElementById('root')!).render(<React.StrictMode><QueryClientProvider client={client}><VisualProvider><App/></VisualProvider></QueryClientProvider></React.StrictMode>);
