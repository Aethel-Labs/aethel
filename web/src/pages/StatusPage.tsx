import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Github } from 'lucide-react';

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
      <div className="flex min-h-screen items-center justify-center bg-bg p-8">
        <div className="spinner h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg">
      <main className="mx-auto max-w-2xl px-6 py-12">
        <Link
          to="/"
          className="mb-8 inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to home
        </Link>

        <div className="flex items-center gap-4">
          <img
            src="/bot_icon.png"
            alt="Aethel Bot Logo"
            width={56}
            height={56}
            className="pixel-art h-14 w-14 rounded-lg object-cover"
          />
          <div>
            <h1 className="text-xl font-semibold text-ink">Bot Status</h1>
            <div className="mt-1 flex items-center gap-2">
              <span
                className={`h-2 w-2 rounded-full ${isOnline ? 'bg-success status-pulse' : 'bg-danger'}`}
              />
              <span className="text-sm font-medium text-muted">
                {isOnline ? 'All systems operational' : 'Service disruption'}
              </span>
            </div>
          </div>
        </div>

        {status?.error ? (
          <div className="mt-6 rounded-lg border border-danger bg-danger-tint p-4">
            <p className="text-sm text-danger">{status.error}</p>
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-line bg-surface p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-faint">API Latency</p>
              <p className="mt-2 text-2xl font-semibold text-ink">
                {status?.ping ? `${status.ping}ms` : '—'}
              </p>
            </div>
            <div className="rounded-lg border border-line bg-surface p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-faint">Uptime</p>
              <p className="mt-2 text-2xl font-semibold text-ink">
                {uptime.days > 0 ? `${uptime.days}d ` : ''}
                {String(uptime.hours).padStart(2, '0')}h {String(uptime.minutes).padStart(2, '0')}m
              </p>
            </div>
          </div>
        )}

        <div className="mt-3 rounded-lg border border-line bg-surface p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-faint">Version</p>
            {commitHash && (
              <a
                href={`https://github.com/Aethel-Labs/aethel/commit/${commitHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border border-line px-2 py-1 font-mono text-xs text-muted hover:bg-surface-hover hover:text-ink"
              >
                <Github className="h-3 w-3" />
                {commitHash.substring(0, 7)}
              </a>
            )}
          </div>
          <p className="mt-2 text-sm text-muted">
            {status?.lastReady
              ? new Date(status.lastReady).toLocaleString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: false,
                })
              : 'Unknown'}
          </p>
        </div>
      </main>
    </div>
  );
}
