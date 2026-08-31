import { useAuth } from '../hooks/useAuth';
import { Navigate } from 'react-router-dom';
import ProfileForm from '../components/ProfileForm';
import PolicyForm from '../components/PolicyForm';
import ResumeUpload from '../components/ResumeUpload';

export default function Dashboard() {
  const { user, isLoading, logout } = useAuth();

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-bold text-indigo-600">AutoApply Dashboard</h1>
            </div>
            <div className="flex items-center">
              <span className="text-gray-700 mr-4">Logged in as Candidate</span>
              <button onClick={() => logout()} className="text-sm font-medium text-gray-500 hover:text-gray-700">Logout</button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <ProfileForm />
          <PolicyForm />
          <ResumeUpload />
        </div>
      </main>
    </div>
  );
}
