import { useEffect, useState } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { useHydration } from './useHydration';
import { TabShell } from '../ui/components/TabShell';
import { HydrationSkeleton } from '../ui/components/HydrationSkeleton';
import { StorageUnavailableBanner } from '../ui/components/StorageUnavailableBanner';
import { HydrationErrorBanner } from '../ui/components/HydrationErrorBanner';
import { useUIStore } from '../stores';

export default function App() {
  const [sessionOnlyMode, setSessionOnlyMode] = useState(false);
  const state = useHydration();
  const darkMode = useUIStore((s) => s.darkMode);

  // Reflect darkMode onto <html> for Tailwind 'class' strategy
  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) root.classList.add('dark');
    else root.classList.remove('dark');
  }, [darkMode]);

  if (state.status === 'pending' || state.status === 'hydrating') {
    return <HydrationSkeleton state={state} />;
  }
  if (state.status === 'storage_unavailable' && !sessionOnlyMode) {
    return <StorageUnavailableBanner onContinueAnyway={() => setSessionOnlyMode(true)} />;
  }
  if (state.status === 'error') {
    return (
      <HydrationErrorBanner error={state.error} onRetry={() => location.reload()} />
    );
  }

  return (
    <BrowserRouter>
      <TabShell />
    </BrowserRouter>
  );
}
