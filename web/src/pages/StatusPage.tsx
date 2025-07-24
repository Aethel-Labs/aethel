import { useState, useEffect } from 'react';
import { Link } from "react-router-dom";
import { CheckCircleIcon, XCircleIcon, ServerIcon, CpuChipIcon, SignalIcon, ClockIcon } from '@heroicons/react/24/outline';
import Footer from '../components/Footer';

async function getGitCommitHash() {
  try {
    const response = await fetch(`${import.meta.env.VITE_BOT_API_URL || 'https://bot-api.pur.cat'}/api/status`, {
      headers: {
        'X-API-Key': import.meta.env.VITE_STATUS_API_KEY || ''
      }
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
    const baseUrl = import.meta.env.VITE_BOT_API_URL || "http://localhost:3000";
    const url = `${baseUrl}/api/status`;
    
    const controller = new AbortController();
    const timeout = 8000;
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
      const res = await fetch(url, { 
        cache: "no-store",
        signal: controller.signal,
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
          'X-API-Key': import.meta.env.VITE_STATUS_API_KEY || ''
        }
      });
      
      clearTimeout(timeoutId);
      
      if (!res.ok) {
        console.error(`Bot API responded with status: ${res.status}`);
        return { 
          status: "offline", 
          botStatus: "disconnected",
          error: `API Error: ${res.status} ${res.statusText}`,
          lastChecked: new Date().toISOString()
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
    const errorMessage = error instanceof Error && error.name === 'AbortError' 
      ? 'Connection timed out (8s)' 
      : 'Could not connect to bot service';
    return { 
      status: "offline", 
      botStatus: "disconnected",
      error: errorMessage,
      lastChecked: new Date().toISOString()
    };
  }
}

export default function Status() {
  const [status, setStatus] = useState<any>(null);
  const [commitHash, setCommitHash] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [statusData, hashData] = await Promise.all([
          getBotStatus(),
          getGitCommitHash()
        ]);
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
  
  const isOnline = status?.status === "online";
  
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
          seconds: Math.floor(totalSeconds % 60)
        };
      }
      else if (status.uptime && typeof status.uptime === 'object') {
        return {
          days: status.uptime.days || 0,
          hours: status.uptime.hours || 0,
          minutes: status.uptime.minutes || 0,
          seconds: status.uptime.seconds || 0
        };
      }
      else if (status.uptime && typeof status.uptime === 'string' && !isNaN(parseInt(status.uptime))) {
        const uptime = parseInt(status.uptime);
        return {
          days: Math.floor(uptime / 86400),
          hours: Math.floor((uptime % 86400) / 3600),
          minutes: Math.floor((uptime % 3600) / 60),
          seconds: Math.floor(uptime % 60)
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
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-300">Loading status...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-6xl mx-auto px-6 py-12">
        
        <div className="flex justify-between items-center mb-16">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 flex items-center justify-center rounded-lg overflow-hidden">
              <img 
                src="/bot_icon.png" 
                alt="Bot Icon" 
                className="w-full h-full object-cover"
                width={48}
                height={48}
              />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Aethel</h1>
          </div>
          <a
            href="https://github.com/aethel-labs/aethel"
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
              <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
            </svg>
          </a>
        </div>

        <div className="text-center mb-20">
          <h2 className="text-5xl font-bold text-gray-900 dark:text-white mb-6">
            Bot Status
          </h2>
          <p className="text-xl text-gray-600 dark:text-gray-300 mb-8 max-w-2xl mx-auto">
            Monitor the current status and performance of all bot services in real-time.
          </p>
          <div className="inline-flex items-center px-6 py-3 rounded-lg font-semibold mb-8 bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800">
            {isOnline ? (
              <>
                <CheckCircleIcon className="w-5 h-5 text-green-500 mr-2" />
                <span className="text-gray-900 dark:text-white">All Systems Operational</span>
              </>
            ) : (
              <>
                <XCircleIcon className="w-5 h-5 text-red-500 mr-2" />
                <span className="text-gray-900 dark:text-white">Service Disruption</span>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
          {[
            {
              icon: <ServerIcon className="w-6 h-6" />,
              title: "Bot Status",
              value: isOnline ? 'Online' : 'Offline',
              status: isOnline,
              description: isOnline ? 'Bot is operational and responding to commands' : (status.error || 'Bot is currently unavailable')
            },
            {
              icon: <CpuChipIcon className="w-6 h-6" />,
              title: "Bot API",
              value: status.botStatus === 'connected' ? 'Connected' : 'Disconnected',
              status: status.botStatus === 'connected',
              description: `API connection is ${status.botStatus === 'connected' ? 'active and stable' : 'currently unavailable'}`
            },
            {
              icon: <SignalIcon className="w-6 h-6" />,
              title: "Response Time",
              value: status.ping ? `${status.ping}ms` : 'N/A',
              status: status.ping ? status.ping < 200 : false,
              description: status.ping ? 
                (status.ping < 100 ? 'Excellent performance' : status.ping < 200 ? 'Good performance' : 'Slow response') : 
                'Response time unavailable'
            }
          ].map((card, index) => (
            <div key={index} className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700 hover:shadow-lg transition-shadow">
              <div className="flex items-center mb-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center mr-3 ${
                  card.status ? 'bg-sky-100 dark:bg-sky-900 text-sky-600 dark:text-sky-400' 
                            : 'bg-red-100 dark:bg-red-900 text-red-600 dark:text-red-400'
                }`}>
                  {card.icon}
                </div>
                <h3 className="font-semibold text-gray-900 dark:text-white">{card.title}</h3>
              </div>
              <div className="mb-2">
                <span className="text-2xl font-bold text-gray-900 dark:text-white">{card.value}</span>
              </div>
              <p className="text-gray-600 dark:text-gray-300 text-sm">{card.description}</p>
            </div>
          ))}
        </div>

        {isOnline && (uptime.days > 0 || uptime.hours > 0 || uptime.minutes > 0 || uptime.seconds > 0) && (
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700 hover:shadow-lg transition-shadow mb-16">
            <div className="flex items-center mb-4">
              <div className="w-10 h-10 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center text-gray-600 dark:text-gray-300 mr-3">
                <ClockIcon className="w-6 h-6" />
              </div>
              <h3 className="font-semibold text-gray-900 dark:text-white">System Uptime</h3>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {uptime.days > 0 && `${uptime.days}d `}
                {String(uptime.hours).padStart(2, '0')}h {String(uptime.minutes).padStart(2, '0')}m {String(uptime.seconds).padStart(2, '0')}s
              </div>
            </div>
          </div>
        )}

        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700 hover:shadow-lg transition-shadow mb-16">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Version Information</h3>
          <div className="flex flex-col sm:flex-row items-start sm:items-center space-y-4 sm:space-y-0 sm:space-x-6">
            <div className="flex items-center bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg px-4 py-2">
              <svg className="w-5 h-5 text-gray-500 dark:text-gray-400 mr-3" fill="currentColor" viewBox="0 0 24 24">
                <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
              </svg>
              {commitHash ? (
                <a
                  href={`https://github.com/scanash00/bot/commit/${commitHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-sm font-medium text-gray-700 dark:text-gray-200 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                  title={commitHash}
                >
                  {commitHash.substring(0, 7)}
                </a>
              ) : (
                <span className="font-mono text-sm font-medium text-gray-700 dark:text-gray-200">unknown</span>
              )}
            </div>
            <span className="text-sm text-gray-600 dark:text-gray-300">
              Last Updated: {status.lastReady ? new Date(status.lastReady).toLocaleString(undefined, {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
              }) : 'Unknown'}
            </span>
          </div>
        </div>

        <div className="text-center">
          <Link 
            to="/"
            className="bg-sky-600 hover:bg-sky-700 text-white font-semibold py-3 px-8 rounded-lg transition-colors inline-flex items-center"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Home
          </Link>
        </div>
      </div>
      
      <Footer />
    </div>
  );
}