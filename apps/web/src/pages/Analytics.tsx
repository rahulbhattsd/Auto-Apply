import { useQuery } from '@tanstack/react-query';
import { fetchApi } from '../lib/api';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function Analytics() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['analytics'],
    queryFn: async () => fetchApi('/analytics'),
  });

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div className="flex justify-between items-center mb-6 border-b pb-4">
        <h1 className="text-3xl font-bold text-gray-900">System Analytics</h1>
      </div>

      {isLoading ? (
          <div className="text-center text-gray-500 animate-pulse mt-12">Loading system analytics...</div>
      ) : stats ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
              <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100 flex flex-col items-center justify-center">
                <span className="text-sm font-medium text-gray-500 mb-1">Total Applications</span>
                <span className="text-4xl font-bold text-indigo-600">{stats.totalApplications}</span>
              </div>
              <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100 flex flex-col items-center justify-center">
                <span className="text-sm font-medium text-gray-500 mb-1">Avg Match Score</span>
                <span className="text-4xl font-bold text-blue-600">{stats.averageMatchScore}</span>
              </div>
              <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100 flex flex-col items-center justify-center">
                <span className="text-sm font-medium text-gray-500 mb-1">Success Rate</span>
                <span className="text-4xl font-bold text-green-600">{stats.successRate}%</span>
              </div>
              <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100 flex flex-col items-center justify-center">
                <span className="text-sm font-medium text-gray-500 mb-1">Failure Rate</span>
                <span className="text-4xl font-bold text-red-600">{stats.failureRate}%</span>
              </div>
              <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100 flex flex-col items-center justify-center">
                <span className="text-sm font-medium text-gray-500 mb-1">Human Intervention</span>
                <span className="text-4xl font-bold text-yellow-600">{stats.humanInterventionRate}%</span>
              </div>
            </div>

            {stats.applicationsBySource && stats.applicationsBySource.length > 0 && (
                <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
                    <h2 className="text-lg font-bold text-gray-800 mb-6">Applications by Job Source</h2>
                    <div className="h-80">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={stats.applicationsBySource}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="name" />
                                <YAxis />
                                <Tooltip cursor={{fill: '#f3f4f6'}} />
                                <Bar dataKey="count" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}
          </>
      ) : (
         <div className="text-center text-gray-500 italic mt-12">Failed to load analytics data.</div>
      )}
    </div>
  );
}
