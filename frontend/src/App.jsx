// SPDX-License-Identifier: MIT
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { FeedbacksProvider } from './components/Feedbacks';
import SeoMeta from './components/SeoMeta';
import { Rutas } from './routes';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      // Evita repeticiones al remontar layouts/páginas (perfil, categorías,
      // pendientes). Las mutaciones siguen invalidando sus claves al instante.
      staleTime: 30_000,
    },
  },
});

export default function App() {
  return (
    <ThemeProvider>
      <FeedbacksProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <BrowserRouter>
              <SeoMeta />
              <Rutas />
            </BrowserRouter>
          </AuthProvider>
        </QueryClientProvider>
      </FeedbacksProvider>
    </ThemeProvider>
  );
}
