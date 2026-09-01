import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useQuery } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import { fetchApi } from '../lib/api';
import StatusBadge from '../components/StatusBadge';
export default function ApplicationDetails() {
    const { id } = useParams();
    const { data: response, isLoading } = useQuery({
        queryKey: ['application', id],
        queryFn: async () => {
            return fetchApi(`/applications/${id}`);
        }
    });
    if (isLoading)
        return _jsx("div", { className: "p-8 max-w-4xl mx-auto", children: "Loading..." });
    if (!response?.application)
        return _jsx("div", { className: "p-8 max-w-4xl mx-auto", children: "Application not found" });
    const { application } = response;
    const { job, events, resumeVersions } = application;
    const latestVersion = resumeVersions?.[0];
    return (_jsxs("div", { className: "p-8 max-w-4xl mx-auto space-y-6", children: [_jsx(Link, { to: "/applications", className: "text-indigo-600 hover:text-indigo-900 font-medium inline-flex items-center", children: "\u2190 Back to Applications" }), _jsxs("div", { className: "bg-white shadow rounded-lg p-6", children: [_jsxs("div", { className: "flex justify-between items-start", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-3xl font-bold text-gray-900 mb-2", children: job.title }), _jsxs("div", { className: "text-lg text-gray-600 mb-4 flex items-center space-x-2", children: [_jsx("span", { className: "font-medium text-gray-900", children: job.company?.name || 'Unknown Company' }), _jsx("span", { children: "\u2022" }), _jsx("span", { children: job.location || 'Remote' })] })] }), _jsx("div", { children: _jsx(StatusBadge, { status: application.status }) })] }), _jsx(Link, { to: `/jobs/${job.id}`, className: "inline-flex items-center text-sm font-medium text-indigo-600 hover:text-indigo-500", children: "View Job Details" })] }), _jsxs("div", { className: "bg-white shadow rounded-lg p-6", children: [_jsx("h2", { className: "text-xl font-bold text-gray-900 mb-6 border-b pb-2", children: "Audit Trail" }), _jsxs("div", { className: "space-y-6", children: [events.map((event) => ( // eslint-disable-line @typescript-eslint/no-explicit-any
                            _jsxs("div", { className: "relative pl-6 border-l-2 border-indigo-200 last:border-0 pb-6 last:pb-0", children: [_jsx("div", { className: "absolute w-3 h-3 bg-indigo-500 rounded-full -left-[7px] top-1" }), _jsxs("div", { className: "flex justify-between items-start mb-1", children: [_jsx("h3", { className: "font-bold text-gray-900", children: event.eventType }), _jsx("span", { className: "text-sm text-gray-500", children: new Date(event.createdAt).toLocaleString() })] }), event.payload && Object.keys(event.payload).length > 0 && (_jsx("pre", { className: "mt-2 bg-gray-50 p-3 rounded text-xs text-gray-700 overflow-x-auto border", children: JSON.stringify(event.payload, null, 2) }))] }, event.id))), events.length === 0 && _jsx("p", { className: "text-gray-500 italic", children: "No events recorded yet." })] })] }), latestVersion && (_jsxs("div", { className: "bg-white shadow rounded-lg p-6", children: [_jsx("h2", { className: "text-xl font-bold text-gray-900 mb-4 border-b pb-2", children: "Used Resume Version" }), _jsxs("div", { className: "flex items-center justify-between mb-4", children: [_jsxs("span", { className: "text-sm font-medium bg-gray-100 text-gray-800 px-3 py-1 rounded-full", children: ["Version ", latestVersion.version] }), _jsxs("span", { className: "text-sm text-gray-500", children: ["Generated on ", new Date(latestVersion.createdAt).toLocaleDateString()] })] }), _jsxs("div", { children: [_jsx("h3", { className: "text-sm font-semibold text-gray-700 uppercase tracking-wider mb-2", children: "Cover Letter" }), _jsx("div", { className: "bg-gray-50 p-4 rounded-md whitespace-pre-wrap text-sm font-serif leading-relaxed text-gray-800 border max-h-48 overflow-y-auto", children: latestVersion.coverLetter || 'No cover letter generated.' })] })] }))] }));
}
