import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useAuth } from '../hooks/useAuth';
import { Navigate } from 'react-router-dom';
import ProfileForm from '../components/ProfileForm';
import PolicyForm from '../components/PolicyForm';
import ResumeUpload from '../components/ResumeUpload';
export default function Dashboard() {
    const { user, isLoading, logout } = useAuth();
    if (isLoading) {
        return _jsx("div", { className: "min-h-screen flex items-center justify-center", children: "Loading..." });
    }
    if (!user) {
        return _jsx(Navigate, { to: "/login", replace: true });
    }
    return (_jsxs("div", { className: "min-h-screen bg-gray-100", children: [_jsx("nav", { className: "bg-white shadow-sm", children: _jsx("div", { className: "max-w-7xl mx-auto px-4 sm:px-6 lg:px-8", children: _jsxs("div", { className: "flex justify-between h-16", children: [_jsx("div", { className: "flex items-center", children: _jsx("h1", { className: "text-xl font-bold text-indigo-600", children: "AutoApply Dashboard" }) }), _jsxs("div", { className: "flex items-center", children: [_jsx("span", { className: "text-gray-700 mr-4", children: "Logged in as Candidate" }), _jsx("button", { onClick: () => logout(), className: "text-sm font-medium text-gray-500 hover:text-gray-700", children: "Logout" })] })] }) }) }), _jsx("main", { className: "max-w-7xl mx-auto py-6 sm:px-6 lg:px-8", children: _jsxs("div", { className: "px-4 py-6 sm:px-0", children: [_jsx(ProfileForm, {}), _jsx(PolicyForm, {}), _jsx(ResumeUpload, {})] }) })] }));
}
