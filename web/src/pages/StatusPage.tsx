import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

async function getGitCommitHash() {
  try {
    const response = await fetch('/api/status', {
      headers: {
        'X-API-Key': import.meta.env.VITE_STATUS_API_KEY || '',
      },
    });

    if (!response.ok) {
      if (import.meta.env.NODE_ENV !== 'production') {
        console.error('Failed to fetch status from bot API:', response.status);
      }
      return null;
    }

    const data = await response.json();
    return data.commitHash || data.version || data.commit || null;
  } catch (error) {
    if (import.meta.env.NODE_ENV !== 'production') {
      console.error('Error fetching from bot API:', error);
    }
    return null;
  }
}

async function getBotStatus() {
  try {
    const url = '/api/status';

    const controller = new AbortController();
    const timeout = 8000;
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const res = await fetch(url, {
        cache: 'no-store',
        signal: controller.signal,
        headers: {
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
          'X-API-Key': import.meta.env.VITE_STATUS_API_KEY || '',
        },
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        console.error(`Bot API responded with status: ${res.status}`);
        return {
          status: 'offline',
          botStatus: 'disconnected',
          error: `API Error: ${res.status} ${res.statusText}`,
          lastChecked: new Date().toISOString(),
        };
      }

      const data = await res.json();
      return { ...data, lastChecked: new Date().toISOString() };
    } catch (fetchError: unknown) {
      clearTimeout(timeoutId);
      throw fetchError;
    }
  } catch (error: unknown) {
    console.error('Error fetching bot status:', error);
    const errorMessage =
      error instanceof Error && error.name === 'AbortError'
        ? 'Connection timed out (8s)'
        : 'Could not connect to bot service';
    return {
      status: 'offline',
      botStatus: 'disconnected',
      error: errorMessage,
      lastChecked: new Date().toISOString(),
    };
  }
}

interface StatusData {
  status: string;
  ping?: number;
  uptime?: number | { days: number; hours: number; minutes: number; seconds: number } | string;
  lastReady?: string;
  error?: string;
}

export default function Status() {
  const [status, setStatus] = useState<StatusData | null>(null);
  const [commitHash, setCommitHash] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [statusData, hashData] = await Promise.all([getBotStatus(), getGitCommitHash()]);
        setStatus(statusData);
        setCommitHash(hashData);
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const isOnline = status?.status === 'online';

  const getUptime = (): { days: number; hours: number; minutes: number; seconds: number } => {
    try {
      if (!status || !status.uptime) {
        return { days: 0, hours: 0, minutes: 0, seconds: 0 };
      }
      if (status.uptime && typeof status.uptime === 'number') {
        const totalSeconds = status.uptime;
        return {
          days: Math.floor(totalSeconds / 86400),
          hours: Math.floor((totalSeconds % 86400) / 3600),
          minutes: Math.floor((totalSeconds % 3600) / 60),
          seconds: Math.floor(totalSeconds % 60),
        };
      } else if (status.uptime && typeof status.uptime === 'object') {
        return {
          days: status.uptime.days || 0,
          hours: status.uptime.hours || 0,
          minutes: status.uptime.minutes || 0,
          seconds: status.uptime.seconds || 0,
        };
      } else if (
        status.uptime &&
        typeof status.uptime === 'string' &&
        !isNaN(parseInt(status.uptime))
      ) {
        const uptime = parseInt(status.uptime);
        return {
          days: Math.floor(uptime / 86400),
          hours: Math.floor((uptime % 86400) / 3600),
          minutes: Math.floor((uptime % 3600) / 60),
          seconds: Math.floor(uptime % 60),
        };
      }
      return { days: 0, hours: 0, minutes: 0, seconds: 0 };
    } catch (error) {
      console.error('Error parsing uptime:', error);
      return { days: 0, hours: 0, minutes: 0, seconds: 0 };
    }
  };

  const uptime = getUptime();

  if (loading) {
    return (
      <div className="min-h-screen p-8 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading status...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8">
      <main className="max-w-4xl mx-auto">
        <div className="text-center mb-16 pt-8">
          <img
            src="/bot_icon.png"
            alt="Aethel Bot Logo"
            width={160}
            height={160}
            className="mx-auto mb-8 pixel-art rounded-2xl w-40 h-40 object-cover"
          />
          <h1 className="text-4xl md:text-6xl font-bold mb-4 text-gray-800 dark:text-gray-100">
            Bot Status
          </h1>

          <div
            className={`inline-flex items-center px-4 py-2 rounded-full text-sm font-medium mb-8 ${
              isOnline ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full mr-2 ${isOnline ? 'bg-green-500' : 'bg-red-500'}`}
            ></span>
            {isOnline ? 'All Systems Operational' : 'Service Disruption'}
          </div>

          {status?.error ? (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-6 max-w-md mx-auto mb-8">
              <p className="text-red-600 dark:text-red-400">{status.error}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl mx-auto mb-8">
              <div className="bg-white/90 dark:bg-gray-800/90 rounded-xl p-6 shadow-lg hover:shadow-xl transition-shadow">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
                    API Status
                  </h3>
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-medium ${
                      status?.ping ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {status?.ping ? 'Live' : '--'}
                  </span>
                </div>
                <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                  {status?.ping ? `${status.ping}ms` : '--'}
                </p>
              </div>

              <div className="bg-white/90 dark:bg-gray-800/90 rounded-xl p-6 shadow-lg hover:shadow-xl transition-shadow">
                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">
                  Uptime
                </h3>
                <div className="flex items-center justify-between">
                  <div className="text-center">
                    <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                      {String(uptime.hours).padStart(2, '0')}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Hours</p>
                  </div>
                  <span className="text-2xl text-gray-300 dark:text-gray-500">:</span>
                  <div className="text-center">
                    <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                      {String(uptime.minutes).padStart(2, '0')}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Minutes</p>
                  </div>
                  <span className="text-2xl text-gray-300">:</span>
                  <div className="text-center">
                    <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                      {String(uptime.seconds).padStart(2, '0')}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Seconds</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="bg-white/90 dark:bg-gray-800/90 rounded-xl p-6 shadow-lg max-w-2xl mx-auto mb-8">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-3">
              Version Information
            </h3>
            <div className="flex items-center space-x-4">
              <div className="inline-flex items-center bg-gray-50/50 dark:bg-gray-700/30 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 group transition-colors hover:bg-pink-50/50 dark:hover:bg-pink-900/30">
                <svg
                  className="w-4 h-4 text-gray-500 group-hover:text-pink-500 transition-colors mr-2"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    fillRule="evenodd"
                    d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                    clipRule="evenodd"
                  />
                </svg>
                <span className="font-mono text-sm font-medium text-gray-700 dark:text-gray-300 group-hover:text-pink-600 transition-colors">
                  {commitHash ? commitHash.substring(0, 7) : 'unknown'}
                </span>
              </div>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                Updated{' '}
                {status?.lastReady
                  ? new Date(status.lastReady).toLocaleString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: false,
                    })
                  : 'Unknown'}
              </span>
            </div>
          </div>

          <div className="mt-8">
            <Link
              to="/"
              className="inline-flex items-center px-6 py-3 bg-white/90 hover:bg-white dark:bg-gray-800/90 dark:hover:bg-gray-800 text-gray-800 dark:text-gray-100 font-medium rounded-full shadow-md hover:shadow-lg transition-all"
            >
              <svg
                className="w-4 h-4 mr-2"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 19l-7-7m0 0l7-7m-7 7h18"
                />
              </svg>
              Back to Home
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
