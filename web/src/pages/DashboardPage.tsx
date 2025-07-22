import { useQuery } from '@tanstack/react-query'
import { CheckSquare, Key, Clock, TrendingUp, Bell, AlertCircle } from 'lucide-react'
import { todosAPI, apiKeysAPI, remindersAPI } from '../lib/api'
import { useAuthStore } from '../stores/authStore'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

const DashboardPage = () => {
  const { user } = useAuthStore()
  const [notifications, setNotifications] = useState<any[]>([])

  const { data: todos } = useQuery({
    queryKey: ['todos'],
    queryFn: () => todosAPI.getTodos().then(res => res.data),
  })

  const { data: apiKeyInfo } = useQuery({
    queryKey: ['api-keys'],
    queryFn: () => apiKeysAPI.getApiKeys().then(res => res.data),
  })

  const { data: reminders } = useQuery({
    queryKey: ['reminders'],
    queryFn: () => remindersAPI.getReminders().then(res => res.data.reminders),
  })

  const { data: activeReminders } = useQuery({
    queryKey: ['active-reminders'],
    queryFn: () => remindersAPI.getActiveReminders().then(res => res.data.reminders),
    refetchInterval: 30000, // Check every 30 seconds
  })

  const completedTodos = todos?.filter((todo: any) => todo.done).length || 0
  const pendingTodos = todos?.filter((todo: any) => !todo.done).length || 0
  const totalTodos = todos?.length || 0
  const hasApiKey = !!apiKeyInfo?.hasApiKey
  
  const activeRemindersCount = activeReminders?.length || 0
  const overdueReminders = activeReminders?.filter((reminder: any) => 
    new Date(reminder.expires_at) < new Date()
  ) || []

  const stats = [
    {
      name: 'Total Todos',
      value: totalTodos,
      icon: CheckSquare,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100',
    },
    {
      name: 'Completed',
      value: completedTodos,
      icon: TrendingUp,
      color: 'text-green-600',
      bgColor: 'bg-green-100',
    },
    {
      name: 'Pending',
      value: pendingTodos,
      icon: Clock,
      color: 'text-yellow-600',
      bgColor: 'bg-yellow-100',
    },
    {
      name: 'Active Reminders',
      value: activeRemindersCount,
      icon: Bell,
      color: overdueReminders.length > 0 ? 'text-red-600' : 'text-blue-600',
      bgColor: overdueReminders.length > 0 ? 'bg-red-100' : 'bg-blue-100',
    },
    {
      name: 'API Key',
      value: hasApiKey ? 'Configured' : 'Not Set',
      icon: Key,
      color: hasApiKey ? 'text-green-600' : 'text-red-600',
      bgColor: hasApiKey ? 'bg-green-100' : 'bg-red-100',
    },
  ]

  const recentTodos = todos?.slice(0, 5) || []
  const recentReminders = reminders?.slice(0, 5) || []

  useEffect(() => {
    if (overdueReminders.length > 0) {
      overdueReminders.forEach((reminder: any) => {
        const notificationId = `reminder-${reminder.reminder_id}`
        if (!notifications.includes(notificationId)) {
          toast.error(`Reminder: ${reminder.message}`, {
            duration: 10000,
            action: {
              label: 'Mark Complete',
              onClick: () => handleCompleteReminder(reminder.reminder_id)
            }
          })
          setNotifications(prev => [...prev, notificationId])
        }
      })
    }
  }, [overdueReminders])

  const handleCompleteReminder = async (id: string) => {
    try {
      await remindersAPI.completeReminder(id)
      toast.success('Reminder completed!')
      setNotifications(prev => prev.filter(notif => notif !== `reminder-${id}`))
    } catch (error) {
      toast.error('Failed to complete reminder')
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleString()
  }

  const isExpired = (dateString: string) => {
    return new Date(dateString) < new Date()
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">
          Welcome back, {user?.username}!
        </h1>
        <p className="text-gray-400">
          Here's an overview of your todos and settings.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon
          return (
            <div key={stat.name} className="bg-gray-900/50 border border-gray-700 rounded-lg p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className={`p-3 rounded-lg ${stat.bgColor}`}>
                    <Icon className={`h-6 w-6 ${stat.color}`} />
                  </div>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-400 truncate">
                      {stat.name}
                    </dt>
                    <dd className="text-lg font-medium text-white">
                      {stat.value}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Overdue Reminders Alert */}
      {overdueReminders.length > 0 && (
        <div className="bg-red-900/20 border border-red-700 rounded-lg p-4">
          <div className="flex items-center">
            <AlertCircle className="h-5 w-5 text-red-600 mr-2" />
            <h3 className="text-sm font-medium text-red-300">
              You have {overdueReminders.length} overdue reminder{overdueReminders.length > 1 ? 's' : ''}
            </h3>
          </div>
          <div className="mt-2 space-y-1">
            {overdueReminders.slice(0, 3).map((reminder: any) => (
              <div key={reminder.reminder_id} className="flex items-center justify-between">
                <p className="text-sm text-red-200 truncate">{reminder.message}</p>
                <button
                  onClick={() => handleCompleteReminder(reminder.reminder_id)}
                  className="text-xs bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded transition-colors"
                >
                  Complete
                </button>
              </div>
            ))}
            {overdueReminders.length > 3 && (
              <p className="text-xs text-red-400">And {overdueReminders.length - 3} more...</p>
            )}
          </div>
        </div>
      )}

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Todos */}
        <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-medium text-white">Recent Todos</h2>
            <a
              href="/todos"
              className="text-sm text-white hover:text-gray-300"
            >
              View all
            </a>
          </div>
          {recentTodos.length > 0 ? (
            <div className="space-y-3">
              {recentTodos.map((todo: any) => (
                <div key={todo.id} className="flex items-center space-x-3">
                  <div className={`flex-shrink-0 w-2 h-2 rounded-full ${
                    todo.done ? 'bg-green-400' : 'bg-yellow-400'
                  }`} />
                  <span className={`text-sm ${
                    todo.done ? 'text-gray-500 line-through' : 'text-white'
                  }`}>
                    {todo.item}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-400 text-sm">No todos yet. Create your first one!</p>
          )}
        </div>

        {/* Recent Reminders */}
        <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-medium text-white">Recent Reminders</h2>
            <a
              href="/reminders"
              className="text-sm text-white hover:text-gray-300"
            >
              View all
            </a>
          </div>
          {recentReminders.length > 0 ? (
            <div className="space-y-3">
              {recentReminders.map((reminder: any) => (
                <div key={reminder.reminder_id} className="flex items-start space-x-3">
                  <div className={`flex-shrink-0 w-2 h-2 rounded-full mt-2 ${
                    reminder.is_completed 
                      ? 'bg-green-400' 
                      : isExpired(reminder.expires_at)
                      ? 'bg-red-400'
                      : 'bg-blue-400'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${
                      reminder.is_completed ? 'text-gray-500 line-through' : 'text-white'
                    }`}>
                      {reminder.message}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      {formatDate(reminder.expires_at)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-400 text-sm">No reminders yet. Create your first one!</p>
          )}
        </div>

        {/* API Key Status */}
        <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-medium text-white">AI Configuration</h2>
            <a
              href="/api-keys"
              className="text-sm text-white hover:text-gray-300"
            >
              Manage
            </a>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">API Key</span>
              <span className={`text-sm font-medium ${
                hasApiKey ? 'text-green-600' : 'text-red-600'
              }`}>
                {hasApiKey ? 'Configured' : 'Not Set'}
              </span>
            </div>
            {apiKeyInfo?.model && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">Model</span>
                <span className="text-sm font-medium text-white">
                  {apiKeyInfo.model}
                </span>
              </div>
            )}
            {apiKeyInfo?.apiUrl && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">Endpoint</span>
                <span className="text-sm font-medium text-white truncate max-w-32">
                  {new URL(apiKeyInfo.apiUrl).hostname}
                </span>
              </div>
            )}
            {!hasApiKey && (
              <p className="text-sm text-gray-400">
                Configure your AI API key to use custom models and endpoints.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-6">
        <h2 className="text-lg font-medium text-white mb-4">Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          <a
            href="/todos"
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center transition-colors"
          >
            <CheckSquare className="h-4 w-4 mr-2" />
            Manage Todos
          </a>
          <a
            href="/reminders"
            className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg flex items-center transition-colors"
          >
            <Bell className="h-4 w-4 mr-2" />
            Manage Reminders
          </a>
          <a
            href="/api-keys"
            className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg flex items-center transition-colors"
          >
            <Key className="h-4 w-4 mr-2" />
            Configure AI
          </a>
        </div>
      </div>
    </div>
  )
}

export default DashboardPage