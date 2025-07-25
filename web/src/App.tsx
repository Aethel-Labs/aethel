import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import StatusPage from './pages/StatusPage';
import PrivacyPage from './pages/PrivacyPage';
import TermsPage from './pages/TermsPage';
import DashboardPage from './pages/DashboardPage';
import TodosPage from './pages/TodosPage';
import ApiKeysPage from './pages/ApiKeysPage';
import RemindersPage from './pages/RemindersPage';
import Layout from './components/Layout';
import { useEffect } from 'react';

function App() {
  const { isAuthenticated, checkAuth } = useAuthStore();

  useEffect(() => {
    checkAuth();
  }, []);

  return (
    <Routes>
      {/* Public routes */}
      <Route path="/" element={<LandingPage />} />
      <Route
        path="/login"
        element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <LoginPage />}
      />
      <Route path="/status" element={<StatusPage />} />
      <Route path="/legal/privacy" element={<PrivacyPage />} />
      <Route path="/legal/terms" element={<TermsPage />} />

      {/* Protected routes */}
      {isAuthenticated ? (
        <Route
          path="/*"
          element={
            <Layout>
              <Routes>
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/todos" element={<TodosPage />} />
                <Route path="/reminders" element={<RemindersPage />} />
                <Route path="/api-keys" element={<ApiKeysPage />} />
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
              </Routes>
            </Layout>
          }
        />
      ) : (
        <Route path="*" element={<Navigate to="/" replace />} />
      )}
    </Routes>
  );
}

export default App;
