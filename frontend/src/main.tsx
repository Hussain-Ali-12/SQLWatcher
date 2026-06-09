import { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import './styles/tokens.css';
import { useNotificationStore } from './store/notificationStore';
import './styles/reset.css';

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onSuccess: () => {
      useNotificationStore.getState().setLastRefreshedAt();
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 5_000,
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
  },
});

function LoadingFallback() {
  return <div className="app-loading">Loading SQLWatcher...</div>;
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <Suspense fallback={<LoadingFallback />}>
        <RouterProvider router={router} fallbackElement={<LoadingFallback />} />
      </Suspense>
    </QueryClientProvider>
  </StrictMode>,
);
