import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { StoreProvider } from './state/store';
import { TutorProvider } from './state/tutor';
import { TranslatorProvider } from './state/translator';
import { ToastProvider } from './lib/hooks';
import './styles/main.scss';

const root = document.getElementById('root');
if (!root) throw new Error('Root element #root is missing from index.html');

createRoot(root).render(
  <StrictMode>
    <StoreProvider>
      <TutorProvider>
        <ToastProvider>
          <TranslatorProvider>
            <App />
          </TranslatorProvider>
        </ToastProvider>
      </TutorProvider>
    </StoreProvider>
  </StrictMode>,
);
