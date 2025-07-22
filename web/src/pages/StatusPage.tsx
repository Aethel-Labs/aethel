import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { 
  Activity, 
  Clock, 
  GitBranch, 
  Home, 
  RefreshCw, 
  Server, 
  Wifi, 
  WifiOff,
  AlertCircle
} from 'lucide-react'

interface StatusData {
  status: string
  uptime: {
    days: number
    hours: number
    minutes: number
    seconds: number
  }
  botStatus: string
  ping: number
  lastReady: string | null
  commitHash: string
}

const StatusPage = () => {
  const [statusData, setStatusData] = useState<StatusData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date())

  const fetchStatus = async () => {
    try {
      setError(null)
      const response = await fetch('http://localhost:2020/status', {
        headers: {
          'X-API-Key': 'XIoypvTfaDxWLTFFcHu9ta0aJpvRPVIGADxSMNCNJ50QYtIpSIUsi1WKLglQ7TTRYX6mWgYq15i4NqPl92l0Lzepsrju2fXV1aZpNdDTtIu5mFMvcLhouhmxwb7R93'
        }
      })
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      
      const data = await response.json()
      setStatusData(data)
      setLastUpdated(new Date())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch status')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchStatus()
    
    const interval = setInterval(fetchStatus, 30000)
    return () => clearInterval(interval)
  }, [])

  const formatUptime = (uptime: StatusData['uptime']) => {
    const parts = []
    if (uptime.days > 0) parts.push(`${uptime.days}d`)
    if (uptime.hours > 0) parts.push(`${uptime.hours}h`)
    if (uptime.minutes > 0) parts.push(`${uptime.minutes}m`)
    if (uptime.seconds > 0 || parts.length === 0) parts.push(`${uptime.seconds}s`)
    return parts.join(' ')
  }

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'online':
      case 'connected':
        return 'text-green-400 bg-green-500/20'
      case 'offline':
      case 'disconnected':
        return 'text-red-400 bg-red-500/20'
      default:
        return 'text-yellow-400 bg-yellow-500/20'
    }
  }

  const getPingColor = (ping: number) => {
    if (ping < 100) return 'text-green-400'
    if (ping < 300) return 'text-yellow-400'
    return 'text-red-400'
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white">
      {/* Header */}
      <header className="border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center space-x-4">
              <Link to="/" className="flex items-center space-x-2 text-gray-400 hover:text-white transition-colors">
                <Home className="h-5 w-5" />
                <span>Back to Home</span>
              </Link>
            </div>
            <div className="flex items-center space-x-3">
              <span className="text-2xl font-bold text-white">Aethel Status</span>
            </div>
            <button
              onClick={fetchStatus}
              disabled={loading}
              className="flex items-center space-x-2 px-4 py-2 bg-white text-black rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="mb-8 bg-red-900/20 border border-red-800 rounded-lg p-4">
            <div className="flex items-center space-x-2">
              <AlertCircle className="h-5 w-5 text-red-400" />
              <span className="text-red-300 font-medium">Error loading status</span>
            </div>
            <p className="text-red-400 mt-2">{error}</p>
          </div>
        )}

        {loading && !statusData ? (
          <div className="flex items-center justify-center py-12">
            <div className="flex items-center space-x-3">
              <RefreshCw className="h-6 w-6 animate-spin text-white" />
              <span className="text-lg text-gray-400">Loading status...</span>
            </div>
          </div>
        ) : statusData ? (
          <div className="space-y-8">
            {/* Overall Status */}
            <div className="bg-gray-900/50 backdrop-blur-sm rounded-xl border border-gray-700/50 p-8">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-3xl font-bold text-white">System Status</h2>
                <div className="text-sm text-gray-400">
                  Last updated: {lastUpdated.toLocaleTimeString()}
                </div>
              </div>
              
              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700/30">
                  <div className="flex items-center space-x-4">
                    <div className={`p-3 rounded-lg ${getStatusColor(statusData.status)}`}>
                      <Server className="h-6 w-6" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-400 mb-1">Server Status</p>
                      <p className="font-semibold text-white text-lg capitalize">{statusData.status}</p>
                    </div>
                  </div>
                </div>
                
                <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700/30">
                  <div className="flex items-center space-x-4">
                    <div className={`p-3 rounded-lg ${getStatusColor(statusData.botStatus)}`}>
                      {statusData.botStatus === 'connected' ? (
                        <Wifi className="h-6 w-6" />
                      ) : (
                        <WifiOff className="h-6 w-6" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm text-gray-400 mb-1">Bot Status</p>
                      <p className="font-semibold text-white text-lg capitalize">{statusData.botStatus}</p>
                    </div>
                  </div>
                </div>
                
                <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700/30">
                  <div className="flex items-center space-x-4">
                    <div className="p-3 rounded-lg bg-blue-500/20 text-blue-400">
                      <Activity className="h-6 w-6" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-400 mb-1">Ping</p>
                      <p className={`font-semibold text-lg ${getPingColor(statusData.ping)}`}>
                        {statusData.ping}ms
                      </p>
                    </div>
                  </div>
                </div>
                
                <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700/30">
                  <div className="flex items-center space-x-4">
                    <div className="p-3 rounded-lg bg-purple-500/20 text-purple-400">
                      <Clock className="h-6 w-6" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-400 mb-1">Uptime</p>
                      <p className="font-semibold text-white text-lg">
                        {formatUptime(statusData.uptime)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Detailed Information */}
            <div className="grid md:grid-cols-2 gap-6">
              <div className="bg-gray-900/50 backdrop-blur-sm rounded-xl border border-gray-700/50 p-6">
                <h3 className="text-xl font-semibold text-white mb-6 flex items-center space-x-2">
                  <Clock className="h-6 w-6 text-purple-400" />
                  <span>Uptime Details</span>
                </h3>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Days:</span>
                    <span className="font-semibold text-white text-lg">{statusData.uptime.days}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Hours:</span>
                    <span className="font-semibold text-white text-lg">{statusData.uptime.hours}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Minutes:</span>
                    <span className="font-semibold text-white text-lg">{statusData.uptime.minutes}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Seconds:</span>
                    <span className="font-semibold text-white text-lg">{statusData.uptime.seconds}</span>
                  </div>
                </div>
              </div>
              
              <div className="bg-gray-900/50 backdrop-blur-sm rounded-xl border border-gray-700/50 p-6">
                <h3 className="text-xl font-semibold text-white mb-6 flex items-center space-x-2">
                  <GitBranch className="h-6 w-6 text-blue-400" />
                  <span>System Information</span>
                </h3>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Commit Hash:</span>
                    <span className="font-mono text-sm bg-gray-800 text-gray-300 px-3 py-1 rounded-lg">
                      {statusData.commitHash || 'Unknown'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Last Ready:</span>
                    <span className="font-medium text-white">
                      {statusData.lastReady 
                        ? new Date(statusData.lastReady).toLocaleString()
                        : 'Never'
                      }
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Response Time:</span>
                    <span className={`font-semibold text-lg ${getPingColor(statusData.ping)}`}>
                      {statusData.ping}ms
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Status Indicators */}
            <div className="bg-gray-900/50 backdrop-blur-sm rounded-xl border border-gray-700/50 p-6">
              <h3 className="text-xl font-semibold text-white mb-6">Service Health</h3>
              <div className="grid md:grid-cols-3 gap-4">
                <div className="flex items-center space-x-3 p-4 bg-gray-800/50 rounded-lg border border-gray-700/30">
                  <div className={`w-4 h-4 rounded-full ${
                    statusData.status === 'online' ? 'bg-green-500' : 'bg-red-500'
                  }`}></div>
                  <span className="text-gray-300 font-medium">API Server</span>
                  <span className={`ml-auto px-3 py-1 text-xs rounded-full font-medium ${
                    statusData.status === 'online' 
                      ? 'bg-green-500/20 text-green-400' 
                      : 'bg-red-500/20 text-red-400'
                  }`}>
                    {statusData.status}
                  </span>
                </div>
                
                <div className="flex items-center space-x-3 p-4 bg-gray-800/50 rounded-lg border border-gray-700/30">
                  <div className={`w-4 h-4 rounded-full ${
                    statusData.botStatus === 'connected' ? 'bg-green-500' : 'bg-red-500'
                  }`}></div>
                  <span className="text-gray-300 font-medium">Discord Bot</span>
                  <span className={`ml-auto px-3 py-1 text-xs rounded-full font-medium ${
                    statusData.botStatus === 'connected' 
                      ? 'bg-green-500/20 text-green-400' 
                      : 'bg-red-500/20 text-red-400'
                  }`}>
                    {statusData.botStatus}
                  </span>
                </div>
                
                <div className="flex items-center space-x-3 p-4 bg-gray-800/50 rounded-lg border border-gray-700/30">
                  <div className={`w-4 h-4 rounded-full ${
                    statusData.ping < 300 ? 'bg-green-500' : 'bg-yellow-500'
                  }`}></div>
                  <span className="text-gray-300 font-medium">Network</span>
                  <span className={`ml-auto px-3 py-1 text-xs rounded-full font-medium ${
                    statusData.ping < 100 
                      ? 'bg-green-500/20 text-green-400'
                      : statusData.ping < 300
                      ? 'bg-yellow-500/20 text-yellow-400'
                      : 'bg-red-500/20 text-red-400'
                  }`}>
                    {statusData.ping}ms
                  </span>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

export default StatusPage