import React, { useState, useEffect } from 'react';
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
    gender: '',
    dateOfBirth: '',
    alternatePhone: '',
  });

  const { data: profile } = useQuery({
    queryKey: ['profileData'],
    queryFn: () => fetchApi('/profile'),
    retry: false,
  });

  useEffect(() => {
    if (profile) {
      const p = profile as {
        name?: string;
        phone?: string;
        location?: string;
        linkedin?: string;
        github?: string;
        portfolio?: string;
        gender?: string;
        dateOfBirth?: string;
        alternatePhone?: string;
      };
      setFormData({
        name: p.name || '',
        phone: p.phone || '',
        location: p.location || '',
        linkedin: p.linkedin || '',
        github: p.github || '',
        portfolio: p.portfolio || '',
        gender: p.gender || '',
        dateOfBirth: p.dateOfBirth || '',
        alternatePhone: p.alternatePhone || '',
      });
    }
  }, [profile]);

  const updateProfile = useMutation({
    mutationFn: (data: Record<string, unknown>) => fetchApi('/profile', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['profileData'] }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateProfile.mutate(formData);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow">
      <h2 className="text-xl font-semibold mb-4">Candidate Profile</h2>
      {updateProfile.isSuccess && <div className="mb-4 text-green-600">Profile updated successfully!</div>}
      {updateProfile.isError && <div className="mb-4 text-red-600">Failed to update profile.</div>}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
            <label className="block text-sm font-medium text-gray-700">Name</label>
            <input type="text" name="name" value={formData.name} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2" />
            </div>
            <div>
            <label className="block text-sm font-medium text-gray-700">Phone</label>
            <input type="text" name="phone" value={formData.phone} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2" />
            </div>
            <div>
            <label className="block text-sm font-medium text-gray-700">Location</label>
            <input type="text" name="location" value={formData.location} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2" />
            </div>
            <div>
            <label className="block text-sm font-medium text-gray-700">LinkedIn</label>
            <input type="text" name="linkedin" value={formData.linkedin} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2" />
            </div>
            <div>
            <label className="block text-sm font-medium text-gray-700">GitHub</label>
            <input type="text" name="github" value={formData.github} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2" />
            </div>
            <div>
            <label className="block text-sm font-medium text-gray-700">Portfolio</label>
            <input type="text" name="portfolio" value={formData.portfolio} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2" />
            </div>
            <div>
            <label className="block text-sm font-medium text-gray-700">Gender</label>
            <input type="text" name="gender" value={formData.gender} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2" />
            </div>
            <div>
            <label className="block text-sm font-medium text-gray-700">Date of Birth</label>
            <input type="text" name="dateOfBirth" value={formData.dateOfBirth} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2" />
            </div>
            <div>
            <label className="block text-sm font-medium text-gray-700">Alternate Phone</label>
            <input type="text" name="alternatePhone" value={formData.alternatePhone} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2" />
            </div>
        </div>
        <button type="submit" className="inline-flex justify-center rounded-md border border-transparent bg-indigo-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2">
          Save Profile
        </button>
      </form>
    </div>
  );
}
