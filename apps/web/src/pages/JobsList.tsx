import { useQuery, useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchApi } from '../lib/api';

export default function JobsList() {
  const [filters, setFilters] = useState({ score: '', status: '', company: '', location: '', source: '', date: 'desc' });

  const { data: jobsResponse, isLoading, refetch } = useQuery({
    queryKey: ['jobs', filters],
    queryFn: async () => {
      const params = new URLSearchParams(filters);
      return fetchApi(`/jobs?${params.toString()}`);
    }
  });

  const discoverMutation = useMutation({
    mutationFn: async () => fetchApi('/jobs/discover', { method: 'POST' }),
    onSuccess: () => refetch()
  });

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Jobs Discovery</h1>
        <button onClick={() => discoverMutation.mutate()} disabled={discoverMutation.isPending} className="bg-blue-600 text-white px-4 py-2 rounded">
          {discoverMutation.isPending ? 'Discovering...' : 'Run Discovery & Analysis'}
        </button>
      </div>

      <div className="bg-white p-4 rounded shadow mb-6 grid grid-cols-1 md:grid-cols-6 gap-4">
        <input type="text" placeholder="Company" className="border p-2 rounded" value={filters.company} onChange={e => setFilters(f => ({ ...f, company: e.target.value }))} />
        <input type="text" placeholder="Location" className="border p-2 rounded" value={filters.location} onChange={e => setFilters(f => ({ ...f, location: e.target.value }))} />
        <select className="border p-2 rounded" value={filters.source} onChange={e => setFilters(f => ({ ...f, source: e.target.value }))}>
          <option value="">All Sources</option>
          <option value="MockSource">MockSource</option>
          <option value="Greenhouse">Greenhouse</option>
          <option value="Lever">Lever</option>
        </select>
        <select className="border p-2 rounded" value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}>
          <option value="">All Statuses</option>
          <option value="APPLY">APPLY</option>
          <option value="REJECT">REJECT</option>
          <option value="REVIEW">REVIEW</option>
          <option value="AI_ANALYSIS_FAILED">FAILED</option>
        </select>
        <input type="number" placeholder="Min Score" className="border p-2 rounded" value={filters.score} onChange={e => setFilters(f => ({ ...f, score: e.target.value }))} />
        <select className="border p-2 rounded" value={filters.date} onChange={e => setFilters(f => ({ ...f, date: e.target.value }))}>
          <option value="desc">Newest First</option>
          <option value="asc">Oldest First</option>
        </select>
      </div>

      {isLoading ? <p>Loading...</p> : (
        <table className="w-full text-left border-collapse bg-white shadow rounded overflow-hidden">
          <thead className="bg-gray-50 text-gray-700">
            <tr>
              <th className="p-4 font-medium">Title</th>
              <th className="p-4 font-medium">Company</th>
              <th className="p-4 font-medium">Location</th>
              <th className="p-4 font-medium">Source</th>
              <th className="p-4 font-medium">Score</th>
              <th className="p-4 font-medium">Status</th>
              <th className="p-4 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {jobsResponse?.jobs?.map((job: any) => ( // eslint-disable-line @typescript-eslint/no-explicit-any
              <tr key={job.id} className="hover:bg-gray-50">
                <td className="p-4">{job.title}</td>
                <td className="p-4">{job.company?.name || 'N/A'}</td>
                <td className="p-4">{job.location || 'N/A'}</td>
                <td className="p-4 text-gray-500 text-sm">{job.source?.name || 'Unknown'}</td>
                <td className="p-4 font-semibold">{job.analysis?.matchScore || 0}</td>
                <td className="p-4">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${job.analysis?.recommendation === 'APPLY' ? 'bg-green-100 text-green-800' : job.analysis?.recommendation === 'REJECT' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}`}>
                    {job.analysis?.recommendation || 'PENDING'}
                  </span>
                </td>
                <td className="p-4"><Link to={`/jobs/${job.id}`} className="text-indigo-600 hover:text-indigo-900 font-medium">View Details</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
