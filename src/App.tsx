import { useEffect, useState } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Nav, type Page } from './components/Nav';
import { getAppInfo } from './lib/api';
import { StoreProvider } from './lib/store';
import { DashboardPage } from './pages/DashboardPage';
import { Devices } from './pages/Devices';
import { HealthPage } from './pages/HealthPage';
import { HistoryPage } from './pages/HistoryPage';
import { NetworkPage } from './pages/NetworkPage';
import { Performance } from './pages/Performance';
import { Protect } from './pages/Protect';
import { SettingsPage } from './pages/SettingsPage';

function App() {
  const [page, setPage] = useState<Page>('dashboard');
  const [version, setVersion] = useState('');

  useEffect(() => {
    getAppInfo().then((i) => setVersion(i.version)).catch(() => {});
  }, []);

  return (
    <ErrorBoundary>
      <StoreProvider>
        <div className="shell">
          <Nav page={page} onNavigate={setPage} version={version} />
          <main className="main">
            {page === 'dashboard' && <DashboardPage onNavigate={setPage} />}
            {page === 'protect' && <Protect />}
            {page === 'performance' && <Performance />}
            {page === 'network' && <NetworkPage />}
            {page === 'health' && <HealthPage />}
            {page === 'devices' && <Devices />}
            {page === 'history' && <HistoryPage />}
            {page === 'settings' && <SettingsPage />}
          </main>
        </div>
      </StoreProvider>
    </ErrorBoundary>
  );
}

export default App;
