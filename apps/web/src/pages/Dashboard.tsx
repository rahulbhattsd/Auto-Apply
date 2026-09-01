import { useAuth } from '../hooks/useAuth';
import { Navigate } from 'react-router-dom';
import ProfileForm from '../components/ProfileForm';
import PolicyForm from '../components/PolicyForm';
import ResumeUpload from '../components/ResumeUpload';
import ActivityFeed from '../components/ActivityFeed';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchApi } from '../lib/api';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';

export default function Dashboard() {
  const { user, isLoading: authLoading, logout } = useAuth();
  const queryClient = useQueryClient();

  const { data: dashboardData, isLoading: dashboardLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const data = await fetchApi('/dashboard');
      return data;
    },
    refetchInterval: 30000,
  });

  const { data: autoConfig, isLoading: autoLoading } = useQuery({
    queryKey: ['automation'],
    queryFn: async () => {
      const data = await fetchApi('/automation');
      return data;
    },
    refetchInterval: 30000,
  });

  const startMutation = useMutation({
    mutationFn: () => fetchApi('/automation/start', { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['automation'] })
  });

  const pauseMutation = useMutation({
    mutationFn: () => fetchApi('/automation/pause', { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['automation'] })
  });

  if (authLoading || dashboardLoading || autoLoading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

  return (
    <div className="min-h-screen bg-gray-100">
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-bold text-indigo-600">AutoApply Dashboard</h1>
            </div>
            <div className="flex items-center space-x-4">
              <a href="/applications" className="text-sm font-medium text-gray-700 hover:text-indigo-600">Applications</a>
              <a href="/jobs" className="text-sm font-medium text-gray-700 hover:text-indigo-600">Jobs</a>
              <a href="/human-actions" className="text-sm font-medium text-gray-700 hover:text-indigo-600">Human Action Center</a>
              <a href="/analytics" className="text-sm font-medium text-gray-700 hover:text-indigo-600">Analytics</a>
              <span className="text-gray-400">|</span>
              <span className="text-gray-700 mr-4">Logged in as Candidate</span>
              <button onClick={() => logout()} className="text-sm font-medium text-gray-500 hover:text-gray-700">Logout</button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8 space-y-6">

        {autoConfig && (
            <div className="bg-white p-6 rounded-lg shadow px-4 sm:px-6 flex flex-col sm:flex-row justify-between items-center border-l-4 border-indigo-500">
                <div>
                    <h2 className="text-xl font-bold text-gray-900 flex items-center">
                        Automation Engine
                        <span className={`ml-3 px-2 py-1 rounded-full text-xs font-semibold uppercase tracking-wider ${
                            autoConfig.status === 'RUNNING' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                            {autoConfig.status}
                        </span>
                    </h2>
                    <p className="text-sm text-gray-500 mt-1">
                        Applications Today: <span className="font-semibold text-gray-700">{autoConfig.applicationsToday} / {autoConfig.limit}</span>
                    </p>
                    <div className="text-sm text-gray-500 mt-1 flex space-x-4">
                        <span>Queues:</span>
                        {Object.entries(autoConfig.queueDepths).map(([q, depth]) => (
                            <span key={q} className="font-medium text-gray-700">{q}: {depth as number}</span>
                        ))}
                    </div>
                </div>
                <div className="mt-4 sm:mt-0 flex space-x-3">
                    <button
                        onClick={() => startMutation.mutate()}
                        disabled={startMutation.isPending || autoConfig.status === 'RUNNING'}
                        className="px-4 py-2 bg-indigo-600 text-white font-medium rounded hover:bg-indigo-700 disabled:opacity-50"
                    >
                        {startMutation.isPending ? 'Starting...' : 'Start'}
                    </button>
                    <button
                        onClick={() => pauseMutation.mutate()}
                        disabled={pauseMutation.isPending || autoConfig.status === 'STOPPED'}
                        className="px-4 py-2 bg-white border border-gray-300 text-gray-700 font-medium rounded hover:bg-gray-50 disabled:opacity-50"
                    >
                        {pauseMutation.isPending ? 'Pausing...' : 'Pause'}
                    </button>
                </div>
            </div>
        )}

        {dashboardData && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 px-4 sm:px-0">
            <div className="bg-white p-6 rounded-lg shadow border-b-4 border-blue-500">
              <h3 className="text-sm font-medium text-gray-500">Jobs Discovered Today</h3>
              <p className="mt-2 text-3xl font-semibold text-gray-900">{dashboardData.metrics.jobsDiscoveredToday}</p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow border-b-4 border-yellow-500">
              <h3 className="text-sm font-medium text-gray-500">Applications Pending</h3>
              <p className="mt-2 text-3xl font-semibold text-gray-900">{dashboardData.metrics.applicationsPending}</p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow border-b-4 border-red-500">
              <h3 className="text-sm font-medium text-gray-500">Needs Human</h3>
              <p className="mt-2 text-3xl font-semibold text-red-600">{dashboardData.metrics.humanActionsRequired}</p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow border-b-4 border-green-500">
              <h3 className="text-sm font-medium text-gray-500">Success Rate</h3>
              <p className="mt-2 text-3xl font-semibold text-green-600">{dashboardData.metrics.successRate}%</p>
            </div>
          </div>
        )}

        <div className="px-4 sm:px-0 grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ActivityFeed />

          {dashboardData && dashboardData.charts.statusDistribution.length > 0 && (
              <div className="bg-white p-6 rounded-lg shadow">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Application Status Distribution</h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={dashboardData.charts.statusDistribution}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }: any) => `${name} ${((percent || 0) * 100).toFixed(0)}%`} // eslint-disable-line @typescript-eslint/no-explicit-any
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {dashboardData.charts.statusDistribution.map((_entry: any, index: number) => { // eslint-disable-line @typescript-eslint/no-explicit-any
                          const fill = COLORS[index % COLORS.length] || '#8884d8';
                          return <Cell key={`cell-${index}`} fill={fill} />;
                        })}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
          )}
        </div>

        <div className="px-4 sm:px-0 space-y-6">
          <ProfileForm />
          <PolicyForm />
          <ResumeUpload />
        </div>
      </main>
    </div>
  );
}
