import { useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchApi } from '../lib/api';
import { useEffect, useRef } from 'react';
// @ts-expect-error novnc doesn't export standard types for core/rfb correctly
import RFB from '@novnc/novnc/core/rfb';

export default function HumanActionView() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['human-action', id, token],
    queryFn: async () => {
      return fetchApi(`/human-action/${id}?token=${token}`);
    },
    enabled: !!id && !!token,
    retry: false,
  });

  if (!id || !token) {
    return <div className="p-8 text-center text-red-600">Missing application ID or token.</div>;
  }

  if (isLoading) {
    return <div className="p-8 text-center text-gray-600">Loading secure live view...</div>;
  }

  if (isError) {
    return (
      <div className="p-8 text-center text-red-600">
        Error loading live view: {(error as Error).message}. The session may have expired.
      </div>
    );
  }

  const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/api/human-action/ws?token=${data.token}`;

  return <VncClient url={wsUrl} />;
}

function VncClient({ url }: { url: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rfbRef = useRef<RFB | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    rfbRef.current = new RFB(containerRef.current, url, { credentials: { password: '' } });
    rfbRef.current.scaleViewport = true;
    rfbRef.current.resizeSession = true;

    return () => {
      rfbRef.current?.disconnect();
    };
  }, [url]);

  return (
    <div className="min-h-screen flex flex-col bg-gray-100">
      <div className="bg-white shadow p-4 border-b flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Live Browser Session</h1>
          <p className="text-sm text-gray-500">
            Please solve the CAPTCHA or complete the required steps in the browser below.
          </p>
        </div>
      </div>
      <div ref={containerRef} className="flex-1 w-full bg-black flex justify-center items-center overflow-hidden" />
    </div>
  );
}
