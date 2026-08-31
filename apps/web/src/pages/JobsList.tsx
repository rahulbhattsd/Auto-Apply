import { useQuery, useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';

export default function JobsList() {
  const [filters, setFilters] = useState({ score: '', status: '', company: '' });

  const { data: jobsResponse, isLoading, refetch } = useQuery({
    queryKey: ['jobs', filters],
    queryFn: async () => {
      const params = new URLSearchParams(filters);
      const res = await fetch(`/api/jobs?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch jobs');
      return res.json();
    }
  });

  const discoverMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/jobs/discover', { method: 'POST' });
      if (!res.ok) throw new Error('Failed to run discovery');
      return res.json();
    },
    onSuccess: () => refetch()
  });

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Jobs Discovery</h1>
        <button
          onClick={() => discoverMutation.mutate()}
          disabled={discoverMutation.isPending}
          className="bg-blue-600 text-white px-4 py-2 rounded"
        >
          {discoverMutation.isPending ? 'Discovering...' : 'Run Discovery & Analysis'}
        </button>
      </div>

      <div className="flex gap-4 mb-6">
        <input
          type="text"
          placeholder="Filter by company"
          className="border p-2 rounded"
          value={filters.company}
          onChange={e => setFilters(f => ({ ...f, company: e.target.value }))}
        />
        <select
          className="border p-2 rounded"
          value={filters.status}
          onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
        >
          <option value="">All Statuses</option>
          <option value="APPLY">APPLY</option>
          <option value="REJECT">REJECT</option>
          <option value="REVIEW">REVIEW</option>
          <option value="AI_ANALYSIS_FAILED">FAILED</option>
        </select>
      </div>

      {isLoading ? <p>Loading...</p> : (
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b">
              <th className="p-2">Title</th>
              <th className="p-2">Company</th>
              <th className="p-2">Location</th>
              <th className="p-2">Score</th>
              <th className="p-2">Status</th>
              <th className="p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {jobsResponse?.jobs?.map((job: { id: string; title: string; company?: { name: string }; location?: string; analysis?: { matchScore: number; recommendation: string } }) => (
              <tr key={job.id} className="border-b">
                <td className="p-2">{job.title}</td>
                <td className="p-2">{job.company?.name}</td>
                <td className="p-2">{job.location || 'N/A'}</td>
                <td className="p-2">{job.analysis?.matchScore || 0}</td>
                <td className="p-2">
                  <span className={`px-2 py-1 rounded text-sm ${
                    job.analysis?.recommendation === 'APPLY' ? 'bg-green-100 text-green-800' :
                    job.analysis?.recommendation === 'REJECT' ? 'bg-red-100 text-red-800' :
                    'bg-yellow-100 text-yellow-800'
                  }`}>
                    {job.analysis?.recommendation || 'PENDING'}
                  </span>
                </td>
                <td className="p-2">
                  <Link to={`/jobs/${job.id}`} className="text-blue-600 hover:underline">View Details</Link>
                </td>
              </tr>
            ))}
            {jobsResponse?.jobs?.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center p-4">No jobs found</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
