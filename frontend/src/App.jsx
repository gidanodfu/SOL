// SPDX-License-Identifier: MIT
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { FeedbacksProvider } from './components/Feedbacks';
import SeoMeta from './components/SeoMeta';
import { Rutas } from './routes';
import { STALE } from './queryConfig';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      // Ventana base para datos operativos. Las consultas estáticas o de
      // perfil definen ventanas mayores en queryConfig.
      staleTime: STALE.operativo,
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
