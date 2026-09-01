import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { fetchApi } from '../lib/api';
import StatusBadge from '../components/StatusBadge';

export default function ApplicationsList() {
  const { data: response, isLoading } = useQuery({
    queryKey: ['applications'],
    queryFn: async () => fetchApi('/applications')
  });

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">My Applications</h1>
      </div>

      {isLoading ? <p>Loading...</p> : (
        <div className="bg-white shadow rounded overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-50 text-gray-700 border-b">
              <tr>
                <th className="p-4 font-medium">Company</th>
                <th className="p-4 font-medium">Role</th>
                <th className="p-4 font-medium">Match</th>
                <th className="p-4 font-medium">Status</th>
                <th className="p-4 font-medium">Applied At</th>
                <th className="p-4 font-medium">Source</th>
                <th className="p-4 font-medium">Resume V.</th>
                <th className="p-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {response?.applications?.map((app: any) => ( // eslint-disable-line @typescript-eslint/no-explicit-any
                <tr key={app.id} className="hover:bg-gray-50">
                  <td className="p-4 font-medium text-gray-900">{app.job.company?.name || 'N/A'}</td>
                  <td className="p-4 text-gray-800">{app.job.title}</td>
                  <td className="p-4 font-semibold text-indigo-600">{app.job.analysis?.matchScore || 0}</td>
                  <td className="p-4"><StatusBadge status={app.status} /></td>
                  <td className="p-4 text-gray-500 text-sm">{new Date(app.createdAt).toLocaleDateString()}</td>
                  <td className="p-4 text-gray-500 text-sm">{app.job.source?.name || 'Unknown'}</td>
                  <td className="p-4 text-gray-500 text-sm">{app.resumeVersions?.[0] ? `v${app.resumeVersions[0].version}` : '-'}</td>
                  <td className="p-4"><Link to={`/applications/${app.id}`} className="text-indigo-600 hover:text-indigo-900 font-medium">View Timeline</Link></td>
                </tr>
              ))}
              {response?.applications?.length === 0 && (
                <tr><td colSpan={8} className="text-center p-8 text-gray-500">No applications found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
