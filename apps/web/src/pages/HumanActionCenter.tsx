import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { fetchApi } from '../lib/api';

export default function HumanActionCenter() {
  const queryClient = useQueryClient();

  const { data: response, isLoading } = useQuery({
    queryKey: ['applications-needs-human'],
    queryFn: async () => {
      const res = await fetchApi('/applications');
      return { applications: res.applications.filter((a: any) => a.status === 'NEEDS_HUMAN') }; // eslint-disable-line @typescript-eslint/no-explicit-any
    }
  });

  const resumeMutation = useMutation({
    mutationFn: async (id: number) => fetchApi(`/applications/${id}/resume`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['applications-needs-human'] })
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: number) => fetchApi(`/applications/${id}/cancel`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['applications-needs-human'] })
  });

  const completeMutation = useMutation({
    mutationFn: async (id: number) => fetchApi(`/applications/${id}/mark-completed`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['applications-needs-human'] })
  });

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Human Action Center</h1>
        <p className="mt-2 text-gray-600">Applications that require your manual intervention.</p>
      </div>

      {isLoading ? <p>Loading...</p> : (
        <div className="space-y-6">
          {response?.applications?.map((app: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
            const needsHumanEvent = app.events?.slice().reverse().find((e: any) => e.eventType === 'NEEDS_HUMAN'); // eslint-disable-line @typescript-eslint/no-explicit-any
            const payload = needsHumanEvent?.payload || {};

            return (
              <div key={app.id} className="bg-white shadow rounded-lg border border-red-200 overflow-hidden">
                <div className="bg-red-50 p-4 border-b border-red-200 flex justify-between items-center">
                  <div>
                    <h2 className="text-lg font-bold text-red-900">Action Required: {app.job.company?.name || 'Unknown'}</h2>
                    <p className="text-sm text-red-700">{app.job.title}</p>
                  </div>
                  <span className="bg-red-100 text-red-800 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">Needs Human</span>
                </div>

                <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-2">Reason</h3>
                    <p className="text-gray-700 bg-gray-50 p-3 rounded border text-sm">{payload.reason || 'Unknown requirement.'}</p>

                    {payload.url && (
                        <div className="mt-4">
                            <h3 className="font-semibold text-gray-900 mb-2">Application URL</h3>
                            <a href={payload.url} target="_blank" rel="noreferrer" className="text-indigo-600 hover:text-indigo-900 text-sm break-all bg-indigo-50 p-2 rounded block">{payload.url}</a>
                        </div>
                    )}
                  </div>

                  <div>
                     <h3 className="font-semibold text-gray-900 mb-2">Screenshot</h3>
                     {payload.screenshot ? (
                         <img src={payload.screenshot} alt="Application state screenshot" className="w-full h-auto border rounded shadow-sm" />
                     ) : (
                         <div className="w-full h-32 bg-gray-100 flex items-center justify-center border border-dashed rounded text-gray-400 text-sm">No screenshot captured</div>
                     )}
                  </div>
                </div>

                <div className="bg-gray-50 px-6 py-4 border-t flex items-center justify-end space-x-4">
                  <Link to={`/applications/${app.id}`} className="text-indigo-600 hover:text-indigo-900 text-sm font-medium mr-auto">View Timeline</Link>
                  <button onClick={() => cancelMutation.mutate(app.id)} disabled={cancelMutation.isPending} className="text-gray-600 hover:text-red-600 text-sm font-medium">Cancel Application</button>
                  <button onClick={() => completeMutation.mutate(app.id)} disabled={completeMutation.isPending} className="text-gray-600 hover:text-green-600 text-sm font-medium">Mark as Completed</button>
                  <button onClick={() => resumeMutation.mutate(app.id)} disabled={resumeMutation.isPending} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md text-sm font-medium shadow-sm">{resumeMutation.isPending ? 'Resuming...' : 'Resume Automation'}</button>
                </div>
              </div>
            );
          })}
          {response?.applications?.length === 0 && (
            <div className="bg-white shadow rounded-lg p-12 text-center">
              <h2 className="text-xl font-bold text-gray-900 mb-2">All Clear!</h2>
              <p className="text-gray-500">There are no applications currently requiring human intervention.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
