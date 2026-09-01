import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
export default function ActivityFeed() {
    const [events, setEvents] = useState([]);
    const [connected, setConnected] = useState(false);
    useEffect(() => {
        const url = import.meta.env?.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/events` : 'http://localhost:3000/api/events';
        const eventSource = new EventSource(url, { withCredentials: true });
        eventSource.onopen = () => setConnected(true);
        eventSource.onerror = () => setConnected(false);
        eventSource.onmessage = (e) => {
            try {
                const data = JSON.parse(e.data);
                if (data.type === 'KEEPALIVE' || data.type === 'CONNECTED')
                    return;
                setEvents((prev) => {
                    const newEvents = [data, ...prev];
                    return newEvents.slice(0, 50);
                });
            }
            catch (err) {
                console.error('Failed to parse SSE message', err);
            }
        };
        return () => {
            eventSource.close();
        };
    }, []);
    return (_jsxs("div", { className: "bg-white shadow rounded-lg p-6 max-h-96 flex flex-col", children: [_jsxs("div", { className: "flex items-center justify-between mb-4 border-b pb-2", children: [_jsx("h2", { className: "text-xl font-bold text-gray-900", children: "Live System Activity" }), _jsxs("div", { className: "flex items-center space-x-2", children: [_jsx("span", { className: "text-xs text-gray-500", children: connected ? 'Connected' : 'Disconnected' }), _jsx("span", { className: `w-3 h-3 rounded-full ${connected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}` })] })] }), _jsx("div", { className: "flex-1 overflow-y-auto space-y-4 pr-2", children: events.length === 0 ? (_jsx("p", { className: "text-gray-500 italic text-sm text-center mt-8", children: "Waiting for activity..." })) : (events.map((ev, i) => (_jsx("div", { className: "flex items-start space-x-3 text-sm border-l-2 border-indigo-200 pl-3 py-1", children: _jsxs("div", { className: "flex-1", children: [_jsxs("span", { className: "font-semibold text-gray-800", children: ["App #", ev.applicationId] }), " transitioned to ", _jsx("span", { className: "font-mono text-indigo-600 font-semibold", children: ev.toState })] }) }, i)))) })] }));
}
