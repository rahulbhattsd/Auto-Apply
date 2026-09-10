import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import Dashboard from './pages/Dashboard';
import JobsList from './pages/JobsList';
import JobDetails from './pages/JobDetails';
import ApplicationsList from './pages/ApplicationsList';
import ApplicationDetails from './pages/ApplicationDetails';
import HumanActionCenter from './pages/HumanActionCenter';
import HumanActionView from './pages/HumanActionView';
import Analytics from './pages/Analytics';

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/jobs" element={<JobsList />} />
          <Route path="/jobs/:id" element={<JobDetails />} />
          <Route path="/applications" element={<ApplicationsList />} />
          <Route path="/applications/:id" element={<ApplicationDetails />} />
          <Route path="/human-actions" element={<HumanActionCenter />} />
          <Route path="/human-actions/:id" element={<HumanActionView />} />
          <Route path="/analytics" element={<Analytics />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
