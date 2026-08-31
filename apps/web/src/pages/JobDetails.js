import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useQuery } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
export default function JobDetails() {
    const { id } = useParams();
    const { data: response, isLoading } = useQuery({
        queryKey: ['job', id],
        queryFn: async () => {
            const res = await fetch(`/api/jobs/${id}`);
            if (!res.ok)
                throw new Error('Failed to fetch job');
            return res.json();
        }
    });
    if (isLoading)
        return _jsx("div", { className: "p-8", children: "Loading..." });
    if (!response?.job)
        return _jsx("div", { className: "p-8", children: "Job not found" });
    const { job } = response;
    const analysis = job.analysis;
    return (_jsxs("div", { className: "p-8 max-w-4xl mx-auto", children: [_jsx(Link, { to: "/jobs", className: "text-blue-600 hover:underline mb-4 block", children: "\u2190 Back to Jobs" }), _jsxs("div", { className: "bg-white shadow rounded p-6 mb-6", children: [_jsx("h1", { className: "text-3xl font-bold mb-2", children: job.title }), _jsxs("p", { className: "text-xl text-gray-600 mb-4", children: [job.company?.name, " \u2022 ", job.location] }), _jsx("a", { href: job.url, target: "_blank", rel: "noreferrer", className: "text-blue-600 hover:underline", children: "View Original Posting" })] }), _jsxs("div", { className: "grid grid-cols-2 gap-6", children: [_jsxs("div", { className: "bg-white shadow rounded p-6", children: [_jsx("h2", { className: "text-xl font-bold mb-4", children: "Analysis Results" }), _jsxs("div", { className: "mb-4", children: [_jsx("strong", { children: "Match Score:" }), " ", _jsxs("span", { className: "text-2xl ml-2", children: [analysis?.matchScore || 0, "/100"] })] }), _jsxs("div", { className: "mb-4", children: [_jsx("strong", { children: "Recommendation:" }), _jsx("span", { className: `px-2 py-1 ml-2 rounded text-sm ${analysis?.recommendation === 'APPLY' ? 'bg-green-100 text-green-800' :
                                            analysis?.recommendation === 'REJECT' ? 'bg-red-100 text-red-800' :
                                                'bg-yellow-100 text-yellow-800'}`, children: analysis?.recommendation || 'N/A' })] }), _jsxs("div", { className: "mb-4", children: [_jsx("strong", { children: "Reasoning:" }), _jsx("p", { className: "mt-2 text-gray-700 bg-gray-50 p-4 rounded", children: analysis?.reasoning || 'No reasoning provided.' })] })] }), _jsxs("div", { className: "bg-white shadow rounded p-6", children: [_jsx("h2", { className: "text-xl font-bold mb-4", children: "Skills Match" }), _jsxs("div", { className: "mb-4", children: [_jsx("h3", { className: "font-semibold text-green-700 mb-2", children: "Matched Skills" }), _jsx("div", { className: "flex flex-wrap gap-2", children: analysis?.skillsMatched?.length ? analysis.skillsMatched.map((s) => (_jsx("span", { className: "bg-green-100 text-green-800 px-2 py-1 rounded text-sm", children: s }, s))) : _jsx("span", { className: "text-gray-500", children: "None identified" }) })] }), _jsxs("div", { children: [_jsx("h3", { className: "font-semibold text-red-700 mb-2", children: "Missing Skills" }), _jsx("div", { className: "flex flex-wrap gap-2", children: analysis?.skillsMissing?.length ? analysis.skillsMissing.map((s) => (_jsx("span", { className: "bg-red-100 text-red-800 px-2 py-1 rounded text-sm", children: s }, s))) : _jsx("span", { className: "text-gray-500", children: "None identified" }) })] })] })] })] }));
}
