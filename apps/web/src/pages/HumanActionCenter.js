import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { fetchApi } from '../lib/api';
export default function HumanActionCenter() {
    const queryClient = useQueryClient();
    const { data: response, isLoading } = useQuery({
        queryKey: ['applications-needs-human'],
        queryFn: async () => {
            const res = await fetchApi('/applications');
            return { applications: res.applications.filter((a) => a.status === 'NEEDS_HUMAN') }; // eslint-disable-line @typescript-eslint/no-explicit-any
        }
    });
    const resumeMutation = useMutation({
        mutationFn: async (id) => fetchApi(`/applications/${id}/resume`, { method: 'POST' }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['applications-needs-human'] })
    });
    const cancelMutation = useMutation({
        mutationFn: async (id) => fetchApi(`/applications/${id}/cancel`, { method: 'POST' }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['applications-needs-human'] })
    });
    const completeMutation = useMutation({
        mutationFn: async (id) => fetchApi(`/applications/${id}/mark-completed`, { method: 'POST' }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['applications-needs-human'] })
    });
    return (_jsxs("div", { className: "p-8 max-w-7xl mx-auto", children: [_jsxs("div", { className: "mb-8", children: [_jsx("h1", { className: "text-3xl font-bold text-gray-900", children: "Human Action Center" }), _jsx("p", { className: "mt-2 text-gray-600", children: "Applications that require your manual intervention." })] }), isLoading ? _jsx("p", { children: "Loading..." }) : (_jsxs("div", { className: "space-y-6", children: [response?.applications?.map((app) => {
                        const needsHumanEvent = app.events?.slice().reverse().find((e) => e.eventType === 'NEEDS_HUMAN'); // eslint-disable-line @typescript-eslint/no-explicit-any
                        const payload = needsHumanEvent?.payload || {};
                        return (_jsxs("div", { className: "bg-white shadow rounded-lg border border-red-200 overflow-hidden", children: [_jsxs("div", { className: "bg-red-50 p-4 border-b border-red-200 flex justify-between items-center", children: [_jsxs("div", { children: [_jsxs("h2", { className: "text-lg font-bold text-red-900", children: ["Action Required: ", app.job.company?.name || 'Unknown'] }), _jsx("p", { className: "text-sm text-red-700", children: app.job.title })] }), _jsx("span", { className: "bg-red-100 text-red-800 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider", children: "Needs Human" })] }), _jsxs("div", { className: "p-6 grid grid-cols-1 md:grid-cols-2 gap-6", children: [_jsxs("div", { children: [_jsx("h3", { className: "font-semibold text-gray-900 mb-2", children: "Reason" }), _jsx("p", { className: "text-gray-700 bg-gray-50 p-3 rounded border text-sm", children: payload.reason || 'Unknown requirement.' }), payload.url && (_jsxs("div", { className: "mt-4", children: [_jsx("h3", { className: "font-semibold text-gray-900 mb-2", children: "Application URL" }), _jsx("a", { href: payload.url, target: "_blank", rel: "noreferrer", className: "text-indigo-600 hover:text-indigo-900 text-sm break-all bg-indigo-50 p-2 rounded block", children: payload.url })] }))] }), _jsxs("div", { children: [_jsx("h3", { className: "font-semibold text-gray-900 mb-2", children: "Screenshot" }), payload.screenshot ? (_jsx("img", { src: payload.screenshot, alt: "Application state screenshot", className: "w-full h-auto border rounded shadow-sm" })) : (_jsx("div", { className: "w-full h-32 bg-gray-100 flex items-center justify-center border border-dashed rounded text-gray-400 text-sm", children: "No screenshot captured" }))] })] }), _jsxs("div", { className: "bg-gray-50 px-6 py-4 border-t flex items-center justify-end space-x-4", children: [_jsx(Link, { to: `/applications/${app.id}`, className: "text-indigo-600 hover:text-indigo-900 text-sm font-medium mr-auto", children: "View Timeline" }), _jsx("button", { onClick: () => cancelMutation.mutate(app.id), disabled: cancelMutation.isPending, className: "text-gray-600 hover:text-red-600 text-sm font-medium", children: "Cancel Application" }), _jsx("button", { onClick: () => completeMutation.mutate(app.id), disabled: completeMutation.isPending, className: "text-gray-600 hover:text-green-600 text-sm font-medium", children: "Mark as Completed" }), _jsx("button", { onClick: () => resumeMutation.mutate(app.id), disabled: resumeMutation.isPending, className: "bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md text-sm font-medium shadow-sm", children: resumeMutation.isPending ? 'Resuming...' : 'Resume Automation' })] })] }, app.id));
                    }), response?.applications?.length === 0 && (_jsxs("div", { className: "bg-white shadow rounded-lg p-12 text-center", children: [_jsx("h2", { className: "text-xl font-bold text-gray-900 mb-2", children: "All Clear!" }), _jsx("p", { className: "text-gray-500", children: "There are no applications currently requiring human intervention." })] }))] }))] }));
}
