import { useEffect, useState } from 'react';

interface EventData {
  applicationId?: number;
  toState?: string;
  type?: string;
  event?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export default function ActivityFeed() {
  const [events, setEvents] = useState<EventData[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const url = (import.meta as unknown as { env: { VITE_API_URL: string } }).env?.VITE_API_URL ? `${(import.meta as unknown as { env: { VITE_API_URL: string } }).env.VITE_API_URL}/events` : 'http://localhost:3000/api/events';
    const eventSource = new EventSource(url, { withCredentials: true });

    eventSource.onopen = () => setConnected(true);
    eventSource.onerror = () => setConnected(false);

    eventSource.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'KEEPALIVE' || data.type === 'CONNECTED') return;

        setEvents((prev) => {
          const newEvents = [data, ...prev];
          return newEvents.slice(0, 50);
        });
      } catch (err) {
        console.error('Failed to parse SSE message', err);
      }
    };

    return () => {
      eventSource.close();
    };
  }, []);

  return (
    <div className="bg-white shadow rounded-lg p-6 max-h-96 flex flex-col">
      <div className="flex items-center justify-between mb-4 border-b pb-2">
        <h2 className="text-xl font-bold text-gray-900">Live System Activity</h2>
        <div className="flex items-center space-x-2">
          <span className="text-xs text-gray-500">{connected ? 'Connected' : 'Disconnected'}</span>
          <span className={`w-3 h-3 rounded-full ${connected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-4 pr-2">
        {events.length === 0 ? (
          <p className="text-gray-500 italic text-sm text-center mt-8">Waiting for activity...</p>
        ) : (
          events.map((ev, i) => (
            <div key={i} className="flex items-start space-x-3 text-sm border-l-2 border-indigo-200 pl-3 py-1">
              <div className="flex-1">
                <span className="font-semibold text-gray-800">App #{ev.applicationId}</span> transitioned to <span className="font-mono text-indigo-600 font-semibold">{ev.toState}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
