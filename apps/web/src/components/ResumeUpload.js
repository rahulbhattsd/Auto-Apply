import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchApi } from '../lib/api';
export default function ResumeUpload() {
    const queryClient = useQueryClient();
    const [file, setFile] = useState(null);
    const { data: resumes } = useQuery({
        queryKey: ['resumesData'],
        queryFn: () => fetchApi('/resumes'),
    });
    const uploadResume = useMutation({
        mutationFn: (formData) => fetchApi('/resumes', {
            method: 'POST',
            body: formData,
        }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['resumesData'] });
            setFile(null);
        },
    });
    const handleSubmit = (e) => {
        e.preventDefault();
        if (!file)
            return;
        const formData = new FormData();
        formData.append('file', file);
        uploadResume.mutate(formData);
    };
    return (_jsxs("div", { className: "bg-white p-6 rounded-lg shadow mt-6", children: [_jsx("h2", { className: "text-xl font-semibold mb-4", children: "Master Resume" }), _jsxs("div", { className: "mb-6", children: [_jsx("h3", { className: "text-md font-medium text-gray-900 mb-2", children: "Uploaded Resumes" }), resumes && resumes.length > 0 ? (_jsx("ul", { className: "divide-y divide-gray-200", children: resumes.map((resume) => (_jsxs("li", { className: "py-3 flex justify-between items-center", children: [_jsx("span", { className: "text-sm font-medium text-gray-900", children: resume.fileName }), _jsx("span", { className: "text-sm text-gray-500", children: new Date(resume.createdAt).toLocaleDateString() })] }, resume.id))) })) : (_jsx("p", { className: "text-sm text-gray-500", children: "No resumes uploaded yet." }))] }), _jsxs("form", { onSubmit: handleSubmit, className: "space-y-4", children: [uploadResume.isSuccess && _jsx("div", { className: "text-green-600", children: "Resume uploaded successfully!" }), uploadResume.isError && _jsx("div", { className: "text-red-600", children: "Failed to upload resume." }), _jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium text-gray-700", children: "Upload New Master Resume" }), _jsx("input", { type: "file", accept: ".pdf,.doc,.docx", onChange: (e) => {
                                    const selectedFile = e.target.files && e.target.files.length > 0 ? e.target.files[0] : null;
                                    setFile(selectedFile || null);
                                }, className: "mt-1 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100" })] }), _jsx("button", { type: "submit", disabled: !file || uploadResume.isPending, className: "inline-flex justify-center rounded-md border border-transparent bg-indigo-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:bg-indigo-300", children: uploadResume.isPending ? 'Uploading...' : 'Upload Resume' })] })] }));
}
