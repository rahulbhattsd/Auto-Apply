import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchApi } from '../lib/api';
export default function PolicyForm() {
    const queryClient = useQueryClient();
    const [formData, setFormData] = useState({
        targetRoles: '',
        targetTechnologies: '',
        minimumMatchScore: '',
        maxApplicationsPerDay: '',
    });
    const { data: policy } = useQuery({
        queryKey: ['policyData'],
        queryFn: () => fetchApi('/policy'),
        retry: false,
    });
    useEffect(() => {
        if (policy) {
            const p = policy;
            setFormData({
                targetRoles: p.targetRoles?.join(', ') || '',
                targetTechnologies: p.targetTechnologies?.join(', ') || '',
                minimumMatchScore: p.minimumMatchScore?.toString() || '',
                maxApplicationsPerDay: p.maxApplicationsPerDay?.toString() || '',
            });
        }
    }, [policy]);
    const updatePolicy = useMutation({
        mutationFn: (data) => fetchApi('/policy', {
            method: 'PUT',
            body: JSON.stringify(data),
        }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['policyData'] }),
    });
    const handleSubmit = (e) => {
        e.preventDefault();
        updatePolicy.mutate({
            targetRoles: formData.targetRoles.split(',').map(s => s.trim()).filter(Boolean),
            targetTechnologies: formData.targetTechnologies.split(',').map(s => s.trim()).filter(Boolean),
            minimumMatchScore: formData.minimumMatchScore ? parseInt(formData.minimumMatchScore) : null,
            maxApplicationsPerDay: formData.maxApplicationsPerDay ? parseInt(formData.maxApplicationsPerDay) : null,
        });
    };
    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };
    return (_jsxs("div", { className: "bg-white p-6 rounded-lg shadow mt-6", children: [_jsx("h2", { className: "text-xl font-semibold mb-4", children: "Application Policy" }), updatePolicy.isSuccess && _jsx("div", { className: "mb-4 text-green-600", children: "Policy updated successfully!" }), updatePolicy.isError && _jsx("div", { className: "mb-4 text-red-600", children: "Failed to update policy." }), _jsxs("form", { onSubmit: handleSubmit, className: "space-y-4", children: [_jsxs("div", { className: "grid grid-cols-1 gap-4 sm:grid-cols-2", children: [_jsxs("div", { className: "sm:col-span-2", children: [_jsx("label", { className: "block text-sm font-medium text-gray-700", children: "Target Roles (comma separated)" }), _jsx("input", { type: "text", name: "targetRoles", value: formData.targetRoles, onChange: handleChange, className: "mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2" })] }), _jsxs("div", { className: "sm:col-span-2", children: [_jsx("label", { className: "block text-sm font-medium text-gray-700", children: "Target Technologies (comma separated)" }), _jsx("input", { type: "text", name: "targetTechnologies", value: formData.targetTechnologies, onChange: handleChange, className: "mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium text-gray-700", children: "Minimum Match Score (%)" }), _jsx("input", { type: "number", name: "minimumMatchScore", value: formData.minimumMatchScore, onChange: handleChange, className: "mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium text-gray-700", children: "Max Applications / Day" }), _jsx("input", { type: "number", name: "maxApplicationsPerDay", value: formData.maxApplicationsPerDay, onChange: handleChange, className: "mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2" })] })] }), _jsx("button", { type: "submit", className: "inline-flex justify-center rounded-md border border-transparent bg-indigo-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2", children: "Save Policy" })] })] }));
}
