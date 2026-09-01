import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useAuth } from '../hooks/useAuth';
import { Navigate } from 'react-router-dom';
import ProfileForm from '../components/ProfileForm';
import PolicyForm from '../components/PolicyForm';
import ResumeUpload from '../components/ResumeUpload';
import ActivityFeed from '../components/ActivityFeed';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchApi } from '../lib/api';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
export default function Dashboard() {
    const { user, isLoading: authLoading, logout } = useAuth();
    const queryClient = useQueryClient();
    const { data: dashboardData, isLoading: dashboardLoading } = useQuery({
        queryKey: ['dashboard'],
        queryFn: async () => {
            const data = await fetchApi('/dashboard');
            return data;
        },
        refetchInterval: 30000,
    });
    const { data: autoConfig, isLoading: autoLoading } = useQuery({
        queryKey: ['automation'],
        queryFn: async () => {
            const data = await fetchApi('/automation');
            return data;
        },
        refetchInterval: 30000,
    });
    const startMutation = useMutation({
        mutationFn: () => fetchApi('/automation/start', { method: 'POST' }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['automation'] })
    });
    const pauseMutation = useMutation({
        mutationFn: () => fetchApi('/automation/pause', { method: 'POST' }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['automation'] })
    });
    if (authLoading || dashboardLoading || autoLoading) {
        return _jsx("div", { className: "min-h-screen flex items-center justify-center", children: "Loading..." });
    }
    if (!user) {
        return _jsx(Navigate, { to: "/login", replace: true });
    }
    const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];
    return (_jsxs("div", { className: "min-h-screen bg-gray-100", children: [_jsx("nav", { className: "bg-white shadow-sm", children: _jsx("div", { className: "max-w-7xl mx-auto px-4 sm:px-6 lg:px-8", children: _jsxs("div", { className: "flex justify-between h-16", children: [_jsx("div", { className: "flex items-center", children: _jsx("h1", { className: "text-xl font-bold text-indigo-600", children: "AutoApply Dashboard" }) }), _jsxs("div", { className: "flex items-center space-x-4", children: [_jsx("a", { href: "/applications", className: "text-sm font-medium text-gray-700 hover:text-indigo-600", children: "Applications" }), _jsx("a", { href: "/jobs", className: "text-sm font-medium text-gray-700 hover:text-indigo-600", children: "Jobs" }), _jsx("a", { href: "/human-actions", className: "text-sm font-medium text-gray-700 hover:text-indigo-600", children: "Human Action Center" }), _jsx("a", { href: "/analytics", className: "text-sm font-medium text-gray-700 hover:text-indigo-600", children: "Analytics" }), _jsx("span", { className: "text-gray-400", children: "|" }), _jsx("span", { className: "text-gray-700 mr-4", children: "Logged in as Candidate" }), _jsx("button", { onClick: () => logout(), className: "text-sm font-medium text-gray-500 hover:text-gray-700", children: "Logout" })] })] }) }) }), _jsxs("main", { className: "max-w-7xl mx-auto py-6 sm:px-6 lg:px-8 space-y-6", children: [autoConfig && (_jsxs("div", { className: "bg-white p-6 rounded-lg shadow px-4 sm:px-6 flex flex-col sm:flex-row justify-between items-center border-l-4 border-indigo-500", children: [_jsxs("div", { children: [_jsxs("h2", { className: "text-xl font-bold text-gray-900 flex items-center", children: ["Automation Engine", _jsx("span", { className: `ml-3 px-2 py-1 rounded-full text-xs font-semibold uppercase tracking-wider ${autoConfig.status === 'RUNNING' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`, children: autoConfig.status })] }), _jsxs("p", { className: "text-sm text-gray-500 mt-1", children: ["Applications Today: ", _jsxs("span", { className: "font-semibold text-gray-700", children: [autoConfig.applicationsToday, " / ", autoConfig.limit] })] }), _jsxs("div", { className: "text-sm text-gray-500 mt-1 flex space-x-4", children: [_jsx("span", { children: "Queues:" }), Object.entries(autoConfig.queueDepths).map(([q, depth]) => (_jsxs("span", { className: "font-medium text-gray-700", children: [q, ": ", depth] }, q)))] })] }), _jsxs("div", { className: "mt-4 sm:mt-0 flex space-x-3", children: [_jsx("button", { onClick: () => startMutation.mutate(), disabled: startMutation.isPending || autoConfig.status === 'RUNNING', className: "px-4 py-2 bg-indigo-600 text-white font-medium rounded hover:bg-indigo-700 disabled:opacity-50", children: startMutation.isPending ? 'Starting...' : 'Start' }), _jsx("button", { onClick: () => pauseMutation.mutate(), disabled: pauseMutation.isPending || autoConfig.status === 'STOPPED', className: "px-4 py-2 bg-white border border-gray-300 text-gray-700 font-medium rounded hover:bg-gray-50 disabled:opacity-50", children: pauseMutation.isPending ? 'Pausing...' : 'Pause' })] })] })), dashboardData && (_jsxs("div", { className: "grid grid-cols-1 md:grid-cols-4 gap-6 px-4 sm:px-0", children: [_jsxs("div", { className: "bg-white p-6 rounded-lg shadow border-b-4 border-blue-500", children: [_jsx("h3", { className: "text-sm font-medium text-gray-500", children: "Jobs Discovered Today" }), _jsx("p", { className: "mt-2 text-3xl font-semibold text-gray-900", children: dashboardData.metrics.jobsDiscoveredToday })] }), _jsxs("div", { className: "bg-white p-6 rounded-lg shadow border-b-4 border-yellow-500", children: [_jsx("h3", { className: "text-sm font-medium text-gray-500", children: "Applications Pending" }), _jsx("p", { className: "mt-2 text-3xl font-semibold text-gray-900", children: dashboardData.metrics.applicationsPending })] }), _jsxs("div", { className: "bg-white p-6 rounded-lg shadow border-b-4 border-red-500", children: [_jsx("h3", { className: "text-sm font-medium text-gray-500", children: "Needs Human" }), _jsx("p", { className: "mt-2 text-3xl font-semibold text-red-600", children: dashboardData.metrics.humanActionsRequired })] }), _jsxs("div", { className: "bg-white p-6 rounded-lg shadow border-b-4 border-green-500", children: [_jsx("h3", { className: "text-sm font-medium text-gray-500", children: "Success Rate" }), _jsxs("p", { className: "mt-2 text-3xl font-semibold text-green-600", children: [dashboardData.metrics.successRate, "%"] })] })] })), _jsxs("div", { className: "px-4 sm:px-0 grid grid-cols-1 lg:grid-cols-2 gap-6", children: [_jsx(ActivityFeed, {}), dashboardData && dashboardData.charts.statusDistribution.length > 0 && (_jsxs("div", { className: "bg-white p-6 rounded-lg shadow", children: [_jsx("h3", { className: "text-lg font-medium text-gray-900 mb-4", children: "Application Status Distribution" }), _jsx("div", { className: "h-64", children: _jsx(ResponsiveContainer, { width: "100%", height: "100%", children: _jsxs(PieChart, { children: [_jsx(Pie, { data: dashboardData.charts.statusDistribution, cx: "50%", cy: "50%", labelLine: false, label: ({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`, outerRadius: 80, fill: "#8884d8", dataKey: "value", children: dashboardData.charts.statusDistribution.map((_entry, index) => {
                                                            const fill = COLORS[index % COLORS.length] || '#8884d8';
                                                            return _jsx(Cell, { fill: fill }, `cell-${index}`);
                                                        }) }), _jsx(Tooltip, {})] }) }) })] }))] }), _jsxs("div", { className: "px-4 sm:px-0 space-y-6", children: [_jsx(ProfileForm, {}), _jsx(PolicyForm, {}), _jsx(ResumeUpload, {})] })] })] }));
}
