import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchApi } from '../lib/api';
import { useNavigate } from 'react-router-dom';
export function useAuth() {
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const { data: user, isLoading } = useQuery({
        queryKey: ['profile'],
        queryFn: () => fetchApi('/profile'),
        retry: false,
        staleTime: Infinity,
    });
    const loginMutation = useMutation({
        mutationFn: (credentials) => fetchApi('/auth/login', {
            method: 'POST',
            body: JSON.stringify(credentials),
        }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['profile'] });
            navigate('/dashboard');
        },
    });
    const registerMutation = useMutation({
        mutationFn: (credentials) => fetchApi('/auth/register', {
            method: 'POST',
            body: JSON.stringify(credentials),
        }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['profile'] });
            navigate('/dashboard');
        },
    });
    const logoutMutation = useMutation({
        mutationFn: () => fetchApi('/auth/logout', { method: 'POST' }),
        onSuccess: () => {
            queryClient.clear();
            navigate('/login');
        },
    });
    return {
        user,
        isLoading,
        login: loginMutation.mutate,
        loginError: loginMutation.error,
        register: registerMutation.mutate,
        registerError: registerMutation.error,
        logout: logoutMutation.mutate,
    };
}
