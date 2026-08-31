import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchApi } from '../lib/api';

export default function ResumeUpload() {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);

  const { data: resumes } = useQuery({
    queryKey: ['resumesData'],
    queryFn: () => fetchApi('/resumes'),
  });

  const uploadResume = useMutation({
    mutationFn: (formData: FormData) => fetchApi('/resumes', {
      method: 'POST',
      body: formData,
    }),
    onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['resumesData'] });
        setFile(null);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    uploadResume.mutate(formData);
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow mt-6">
      <h2 className="text-xl font-semibold mb-4">Master Resume</h2>

      <div className="mb-6">
        <h3 className="text-md font-medium text-gray-900 mb-2">Uploaded Resumes</h3>
        {resumes && (resumes as unknown[]).length > 0 ? (
          <ul className="divide-y divide-gray-200">
            {(resumes as {id: string, fileName: string, createdAt: string}[]).map((resume) => (
              <li key={resume.id} className="py-3 flex justify-between items-center">
                <span className="text-sm font-medium text-gray-900">{resume.fileName}</span>
                <span className="text-sm text-gray-500">{new Date(resume.createdAt).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-500">No resumes uploaded yet.</p>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {uploadResume.isSuccess && <div className="text-green-600">Resume uploaded successfully!</div>}
        {uploadResume.isError && <div className="text-red-600">Failed to upload resume.</div>}
        <div>
          <label className="block text-sm font-medium text-gray-700">Upload New Master Resume</label>
          <input
            type="file"
            accept=".pdf,.doc,.docx"
            onChange={(e) => {
              const selectedFile = e.target.files && e.target.files.length > 0 ? e.target.files[0] : null;
              setFile(selectedFile || null);
            }}
            className="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
          />
        </div>
        <button
          type="submit"
          disabled={!file || uploadResume.isPending}
          className="inline-flex justify-center rounded-md border border-transparent bg-indigo-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:bg-indigo-300"
        >
          {uploadResume.isPending ? 'Uploading...' : 'Upload Resume'}
        </button>
      </form>
    </div>
  );
}
