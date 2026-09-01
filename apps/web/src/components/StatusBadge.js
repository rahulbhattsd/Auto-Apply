import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export default function StatusBadge({ status }) {
    const getBadgeStyle = (status) => {
        switch (status) {
            case 'VERIFIED':
                return {
                    bg: 'bg-green-100',
                    text: 'text-green-800',
                    border: 'border-green-200',
                    icon: (_jsx("svg", { className: "w-3 h-3 mr-1", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M5 13l4 4L19 7" }) })),
                };
            case 'NEEDS_HUMAN':
                return {
                    bg: 'bg-red-100',
                    text: 'text-red-800',
                    border: 'border-red-200',
                    icon: (_jsx("svg", { className: "w-3 h-3 mr-1", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" }) })),
                };
            case 'FAILED':
            case 'REJECTED':
            case 'CANCELLED':
                return {
                    bg: 'bg-gray-100',
                    text: 'text-gray-800',
                    border: 'border-gray-200',
                    icon: (_jsx("svg", { className: "w-3 h-3 mr-1", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M6 18L18 6M6 6l12 12" }) })),
                };
            case 'SUBMITTED':
            case 'VERIFYING':
                return {
                    bg: 'bg-blue-100',
                    text: 'text-blue-800',
                    border: 'border-blue-200',
                    icon: (_jsx("svg", { className: "w-3 h-3 mr-1 animate-spin", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" }) })),
                };
            default:
                return {
                    bg: 'bg-yellow-100',
                    text: 'text-yellow-800',
                    border: 'border-yellow-200',
                    icon: (_jsx("svg", { className: "w-3 h-3 mr-1", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" }) })),
                };
        }
    };
    const style = getBadgeStyle(status);
    return (_jsxs("span", { className: `inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${style.bg} ${style.text} ${style.border}`, children: [style.icon, status] }));
}
