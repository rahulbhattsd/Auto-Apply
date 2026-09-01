import { useQuery } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import { fetchApi } from '../lib/api';
import StatusBadge from '../components/StatusBadge';

export default function ApplicationDetails() {
  const { id } = useParams<{ id: string }>();

  const { data: response, isLoading } = useQuery({
    queryKey: ['application', id],
    queryFn: async () => {
      return fetchApi(`/applications/${id}`);
    }
  });

  if (isLoading) return <div className="p-8 max-w-4xl mx-auto">Loading...</div>;
  if (!response?.application) return <div className="p-8 max-w-4xl mx-auto">Application not found</div>;

  const { application } = response;
  const { job, events, resumeVersions } = application;
  const latestVersion = resumeVersions?.[0];

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      <Link to="/applications" className="text-indigo-600 hover:text-indigo-900 font-medium inline-flex items-center">
        &larr; Back to Applications
      </Link>

      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex justify-between items-start">
            <div>
                <h1 className="text-3xl font-bold text-gray-900 mb-2">{job.title}</h1>
                <div className="text-lg text-gray-600 mb-4 flex items-center space-x-2">
                <span className="font-medium text-gray-900">{job.company?.name || 'Unknown Company'}</span>
                <span>&bull;</span>
                <span>{job.location || 'Remote'}</span>
                </div>
            </div>
            <div>
                <StatusBadge status={application.status} />
            </div>
        </div>

        <Link to={`/jobs/${job.id}`} className="inline-flex items-center text-sm font-medium text-indigo-600 hover:text-indigo-500">
          View Job Details
        </Link>
      </div>

      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-6 border-b pb-2">Audit Trail</h2>
        <div className="space-y-6">
            {events.map((event: any) => ( // eslint-disable-line @typescript-eslint/no-explicit-any
                <div key={event.id} className="relative pl-6 border-l-2 border-indigo-200 last:border-0 pb-6 last:pb-0">
                    <div className="absolute w-3 h-3 bg-indigo-500 rounded-full -left-[7px] top-1"></div>
                    <div className="flex justify-between items-start mb-1">
                        <h3 className="font-bold text-gray-900">{event.eventType}</h3>
                        <span className="text-sm text-gray-500">{new Date(event.createdAt).toLocaleString()}</span>
                    </div>
                    {event.payload && Object.keys(event.payload).length > 0 && (
                        <pre className="mt-2 bg-gray-50 p-3 rounded text-xs text-gray-700 overflow-x-auto border">
                            {JSON.stringify(event.payload, null, 2)}
                        </pre>
                    )}
                </div>
            ))}
            {events.length === 0 && <p className="text-gray-500 italic">No events recorded yet.</p>}
        </div>
      </div>

      {latestVersion && (
         <div className="bg-white shadow rounded-lg p-6">
           <h2 className="text-xl font-bold text-gray-900 mb-4 border-b pb-2">Used Resume Version</h2>
           <div className="flex items-center justify-between mb-4">
               <span className="text-sm font-medium bg-gray-100 text-gray-800 px-3 py-1 rounded-full">Version {latestVersion.version}</span>
               <span className="text-sm text-gray-500">Generated on {new Date(latestVersion.createdAt).toLocaleDateString()}</span>
           </div>

           <div>
               <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-2">Cover Letter</h3>
               <div className="bg-gray-50 p-4 rounded-md whitespace-pre-wrap text-sm font-serif leading-relaxed text-gray-800 border max-h-48 overflow-y-auto">
                 {latestVersion.coverLetter || 'No cover letter generated.'}
               </div>
           </div>
         </div>
      )}
    </div>
  );
}
