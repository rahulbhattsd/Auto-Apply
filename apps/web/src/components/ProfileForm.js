import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchApi } from '../lib/api';
export default function ProfileForm() {
    const queryClient = useQueryClient();
    const [formData, setFormData] = useState({
        name: '',
        phone: '',
        location: '',
        linkedin: '',
        github: '',
        portfolio: '',
    });
    const { data: profile } = useQuery({
        queryKey: ['profileData'],
        queryFn: () => fetchApi('/profile'),
        retry: false,
    });
    useEffect(() => {
        if (profile) {
            const p = profile;
            setFormData({
                name: p.name || '',
                phone: p.phone || '',
                location: p.location || '',
                linkedin: p.linkedin || '',
                github: p.github || '',
                portfolio: p.portfolio || '',
            });
        }
    }, [profile]);
    const updateProfile = useMutation({
        mutationFn: (data) => fetchApi('/profile', {
            method: 'PUT',
            body: JSON.stringify(data),
        }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['profileData'] }),
    });
    const handleSubmit = (e) => {
        e.preventDefault();
        updateProfile.mutate(formData);
    };
    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };
    return (_jsxs("div", { className: "bg-white p-6 rounded-lg shadow", children: [_jsx("h2", { className: "text-xl font-semibold mb-4", children: "Candidate Profile" }), updateProfile.isSuccess && _jsx("div", { className: "mb-4 text-green-600", children: "Profile updated successfully!" }), updateProfile.isError && _jsx("div", { className: "mb-4 text-red-600", children: "Failed to update profile." }), _jsxs("form", { onSubmit: handleSubmit, className: "space-y-4", children: [_jsxs("div", { className: "grid grid-cols-1 gap-4 sm:grid-cols-2", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium text-gray-700", children: "Name" }), _jsx("input", { type: "text", name: "name", value: formData.name, onChange: handleChange, className: "mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium text-gray-700", children: "Phone" }), _jsx("input", { type: "text", name: "phone", value: formData.phone, onChange: handleChange, className: "mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium text-gray-700", children: "Location" }), _jsx("input", { type: "text", name: "location", value: formData.location, onChange: handleChange, className: "mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium text-gray-700", children: "LinkedIn" }), _jsx("input", { type: "text", name: "linkedin", value: formData.linkedin, onChange: handleChange, className: "mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium text-gray-700", children: "GitHub" }), _jsx("input", { type: "text", name: "github", value: formData.github, onChange: handleChange, className: "mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium text-gray-700", children: "Portfolio" }), _jsx("input", { type: "text", name: "portfolio", value: formData.portfolio, onChange: handleChange, className: "mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2" })] })] }), _jsx("button", { type: "submit", className: "inline-flex justify-center rounded-md border border-transparent bg-indigo-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2", children: "Save Profile" })] })] }));
}
