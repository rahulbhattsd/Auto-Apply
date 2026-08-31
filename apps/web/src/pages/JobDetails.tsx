import { useQuery } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';

export default function JobDetails() {
  const { id } = useParams<{ id: string }>();

  const { data: response, isLoading } = useQuery({
    queryKey: ['job', id],
    queryFn: async () => {
      const res = await fetch(`/api/jobs/${id}`);
      if (!res.ok) throw new Error('Failed to fetch job');
      return res.json();
    }
  });

  if (isLoading) return <div className="p-8">Loading...</div>;
  if (!response?.job) return <div className="p-8">Job not found</div>;

  const { job } = response;
  const analysis = job.analysis;

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <Link to="/jobs" className="text-blue-600 hover:underline mb-4 block">&larr; Back to Jobs</Link>

      <div className="bg-white shadow rounded p-6 mb-6">
        <h1 className="text-3xl font-bold mb-2">{job.title}</h1>
        <p className="text-xl text-gray-600 mb-4">{job.company?.name} &bull; {job.location}</p>
        <a href={job.url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">View Original Posting</a>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="bg-white shadow rounded p-6">
          <h2 className="text-xl font-bold mb-4">Analysis Results</h2>
          <div className="mb-4">
            <strong>Match Score:</strong> <span className="text-2xl ml-2">{analysis?.matchScore || 0}/100</span>
          </div>
          <div className="mb-4">
            <strong>Recommendation:</strong>
            <span className={`px-2 py-1 ml-2 rounded text-sm ${
              analysis?.recommendation === 'APPLY' ? 'bg-green-100 text-green-800' :
              analysis?.recommendation === 'REJECT' ? 'bg-red-100 text-red-800' :
              'bg-yellow-100 text-yellow-800'
            }`}>
              {analysis?.recommendation || 'N/A'}
            </span>
          </div>
          <div className="mb-4">
            <strong>Reasoning:</strong>
            <p className="mt-2 text-gray-700 bg-gray-50 p-4 rounded">{analysis?.reasoning || 'No reasoning provided.'}</p>
          </div>
        </div>

        <div className="bg-white shadow rounded p-6">
          <h2 className="text-xl font-bold mb-4">Skills Match</h2>
          <div className="mb-4">
            <h3 className="font-semibold text-green-700 mb-2">Matched Skills</h3>
            <div className="flex flex-wrap gap-2">
              {analysis?.skillsMatched?.length ? analysis.skillsMatched.map((s: string) => (
                <span key={s} className="bg-green-100 text-green-800 px-2 py-1 rounded text-sm">{s}</span>
              )) : <span className="text-gray-500">None identified</span>}
            </div>
          </div>
          <div>
            <h3 className="font-semibold text-red-700 mb-2">Missing Skills</h3>
            <div className="flex flex-wrap gap-2">
              {analysis?.skillsMissing?.length ? analysis.skillsMissing.map((s: string) => (
                <span key={s} className="bg-red-100 text-red-800 px-2 py-1 rounded text-sm">{s}</span>
              )) : <span className="text-gray-500">None identified</span>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
