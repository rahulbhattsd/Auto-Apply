import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
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
            if (!res.ok)
                throw new Error('Failed to fetch jobs');
            return res.json();
        }
    });
    const discoverMutation = useMutation({
        mutationFn: async () => {
            const res = await fetch('/api/jobs/discover', { method: 'POST' });
            if (!res.ok)
                throw new Error('Failed to run discovery');
            return res.json();
        },
        onSuccess: () => refetch()
    });
    return (_jsxs("div", { className: "p-8", children: [_jsxs("div", { className: "flex justify-between items-center mb-6", children: [_jsx("h1", { className: "text-2xl font-bold", children: "Jobs Discovery" }), _jsx("button", { onClick: () => discoverMutation.mutate(), disabled: discoverMutation.isPending, className: "bg-blue-600 text-white px-4 py-2 rounded", children: discoverMutation.isPending ? 'Discovering...' : 'Run Discovery & Analysis' })] }), _jsxs("div", { className: "flex gap-4 mb-6", children: [_jsx("input", { type: "text", placeholder: "Filter by company", className: "border p-2 rounded", value: filters.company, onChange: e => setFilters(f => ({ ...f, company: e.target.value })) }), _jsxs("select", { className: "border p-2 rounded", value: filters.status, onChange: e => setFilters(f => ({ ...f, status: e.target.value })), children: [_jsx("option", { value: "", children: "All Statuses" }), _jsx("option", { value: "APPLY", children: "APPLY" }), _jsx("option", { value: "REJECT", children: "REJECT" }), _jsx("option", { value: "REVIEW", children: "REVIEW" }), _jsx("option", { value: "AI_ANALYSIS_FAILED", children: "FAILED" })] })] }), isLoading ? _jsx("p", { children: "Loading..." }) : (_jsxs("table", { className: "w-full text-left border-collapse", children: [_jsx("thead", { children: _jsxs("tr", { className: "border-b", children: [_jsx("th", { className: "p-2", children: "Title" }), _jsx("th", { className: "p-2", children: "Company" }), _jsx("th", { className: "p-2", children: "Location" }), _jsx("th", { className: "p-2", children: "Score" }), _jsx("th", { className: "p-2", children: "Status" }), _jsx("th", { className: "p-2", children: "Actions" })] }) }), _jsxs("tbody", { children: [jobsResponse?.jobs?.map((job) => (_jsxs("tr", { className: "border-b", children: [_jsx("td", { className: "p-2", children: job.title }), _jsx("td", { className: "p-2", children: job.company?.name }), _jsx("td", { className: "p-2", children: job.location || 'N/A' }), _jsx("td", { className: "p-2", children: job.analysis?.matchScore || 0 }), _jsx("td", { className: "p-2", children: _jsx("span", { className: `px-2 py-1 rounded text-sm ${job.analysis?.recommendation === 'APPLY' ? 'bg-green-100 text-green-800' :
                                                job.analysis?.recommendation === 'REJECT' ? 'bg-red-100 text-red-800' :
                                                    'bg-yellow-100 text-yellow-800'}`, children: job.analysis?.recommendation || 'PENDING' }) }), _jsx("td", { className: "p-2", children: _jsx(Link, { to: `/jobs/${job.id}`, className: "text-blue-600 hover:underline", children: "View Details" }) })] }, job.id))), jobsResponse?.jobs?.length === 0 && (_jsx("tr", { children: _jsx("td", { colSpan: 6, className: "text-center p-4", children: "No jobs found" }) }))] })] }))] }));
}
