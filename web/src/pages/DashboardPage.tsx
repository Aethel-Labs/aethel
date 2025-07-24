import { useQuery } from '@tanstack/react-query'
import { CheckSquare, Key, Clock, TrendingUp, Bell, AlertCircle, User } from 'lucide-react'
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
    refetchInterval: 30000,
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
    },
    {
      name: 'Completed',
      value: completedTodos,
      icon: TrendingUp,
    },
    {
      name: 'Pending',
      value: pendingTodos,
      icon: Clock,
    },
    {
      name: 'Active Reminders',
      value: activeRemindersCount,
      icon: Bell,
    },
    {
      name: 'API Key',
      value: hasApiKey ? 'Configured' : 'Not Set',
      icon: Key,
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

  


  return (
    <div className="space-y-6">
      <div className="relative bg-white dark:bg-slate-800/50 backdrop-blur-sm p-6 rounded-xl border border-slate-200/50 dark:border-slate-700/50 transition-all duration-300">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center">
              <User className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">
                Welcome back, {user?.username}!
              </h1>
              <p className="text-slate-600 dark:text-slate-400 text-sm">
                Here's your productivity overview for today.
              </p>
            </div>
          </div>
          <div className="hidden lg:block">
            <div className="text-right">
              <p className="text-slate-500 dark:text-slate-400 text-xs">{new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
              <p className="text-slate-700 dark:text-slate-300 text-lg font-semibold">{new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {stats.map((stat, index) => {
          const Icon = stat.icon
          const colors = [
            'bg-blue-600',
            'bg-emerald-600', 
            'bg-orange-500',
            'bg-purple-600',
            'bg-indigo-600'
          ]
          
          return (
             <div 
               key={stat.name}
               className="relative bg-white/80 dark:bg-slate-800/50 backdrop-blur-sm p-4 rounded-xl border border-slate-200/50 dark:border-slate-700/50 transition-all duration-300"
             >
               <div className="flex items-center justify-between mb-3">
                <div className={`w-10 h-10 ${colors[index]} rounded-lg flex items-center justify-center`}>
                  <Icon className="h-5 w-5 text-white" />
                </div>
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900 dark:text-white mb-1">{stat.value}</p>
                <p className="text-xs font-medium text-slate-600 dark:text-slate-400">{stat.name}</p>
              </div>
            </div>
          )
        })}
      </div>

      {overdueReminders.length > 0 && (
        <div className="bg-red-900/20 border border-red-600 p-6 rounded-lg">
          <div className="flex items-center mb-4">
            <div className="w-12 h-12 bg-red-600 rounded-lg flex items-center justify-center mr-4">
              <AlertCircle className="h-6 w-6 text-white" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white mb-1">
                Overdue Reminders
              </h3>
              <p className="text-red-200 text-sm">
                You have {overdueReminders.length} reminder{overdueReminders.length > 1 ? 's' : ''} that need immediate attention
              </p>
            </div>
          </div>
          <div className="space-y-3">
            {overdueReminders.slice(0, 3).map((reminder: any) => (
              <div key={reminder.reminder_id} className="bg-slate-800 border border-red-600 rounded-lg p-4 hover:bg-slate-700 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex-1 mr-4">
                    <p className="text-white font-semibold mb-1">{reminder.message}</p>
                    <div className="flex items-center space-x-4 text-sm">
                      <p className="text-red-300">
                        Due: {new Date(reminder.expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                      <span className="px-2 py-1 bg-red-600 text-white rounded text-xs">
                        {Math.ceil((Date.now() - new Date(reminder.expires_at).getTime()) / (1000 * 60 * 60 * 24))} days overdue
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleCompleteReminder(reminder.reminder_id)}
                    className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition-colors font-medium"
                  >
                    ✓ Complete
                  </button>
                </div>
              </div>
            ))}
            {overdueReminders.length > 3 && (
              <div className="text-center pt-3">
                <p className="text-red-300 text-sm">And {overdueReminders.length - 3} more overdue reminders...</p>
                <a href="/reminders" className="mt-2 text-red-400 hover:text-red-300 text-sm underline">
                  View all overdue reminders →
                </a>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="relative bg-white/80 dark:bg-slate-800/50 backdrop-blur-sm p-6 rounded-xl border border-slate-200/50 dark:border-slate-700/50 transition-all duration-300">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
          Quick Actions
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <a
            href="/todos"
            className="group bg-slate-50/80 dark:bg-slate-700/30 border border-slate-200/50 dark:border-slate-600/50 rounded-lg p-4 hover:bg-slate-100/80 dark:hover:bg-slate-700/50 transition-all duration-200"
          >
            <div className="flex items-center">
              <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center mr-3">
                <CheckSquare className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="font-semibold text-slate-900 dark:text-white">Manage Todos</p>
                <p className="text-xs text-slate-600 dark:text-slate-400">View and organize tasks</p>
              </div>
            </div>
          </a>
          <a
            href="/reminders"
            className="group bg-slate-50/80 dark:bg-slate-700/30 border border-slate-200/50 dark:border-slate-600/50 rounded-lg p-4 hover:bg-slate-100/80 dark:hover:bg-slate-700/50 transition-all duration-200"
          >
            <div className="flex items-center">
              <div className="w-10 h-10 bg-emerald-600 rounded-lg flex items-center justify-center mr-3">
                <Bell className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="font-semibold text-slate-900 dark:text-white">Set Reminder</p>
                <p className="text-xs text-slate-600 dark:text-slate-400">Schedule notifications</p>
              </div>
            </div>
          </a>
          <a
            href="/api-keys"
            className="group bg-slate-50/80 dark:bg-slate-700/30 border border-slate-200/50 dark:border-slate-600/50 rounded-lg p-4 hover:bg-slate-100/80 dark:hover:bg-slate-700/50 transition-all duration-200"
          >
            <div className="flex items-center">
              <div className="w-10 h-10 bg-purple-600 rounded-lg flex items-center justify-center mr-3">
                <Key className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="font-semibold text-slate-900 dark:text-white">AI Config</p>
                <p className="text-xs text-slate-600 dark:text-slate-400">Configure AI settings</p>
              </div>
            </div>
          </a>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="relative bg-white/80 dark:bg-slate-800/50 backdrop-blur-sm rounded-xl p-6 border border-slate-200/50 dark:border-slate-700/50 transition-all duration-300">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center">
              <div className="w-6 h-6 bg-blue-600 rounded-md flex items-center justify-center mr-2">
                <CheckSquare className="h-3 w-3 text-white" />
              </div>
              Recent Todos
            </h3>
            <a
              href="/todos"
              className="text-blue-500 hover:text-blue-600 text-xs font-medium transition-colors"
            >
              View all →
            </a>
          </div>
          {recentTodos.length === 0 ? (
            <div className="text-center py-8">
              <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center mx-auto mb-3">
                <CheckSquare className="h-6 w-6 text-white" />
              </div>
              <p className="text-slate-600 dark:text-slate-400 text-sm mb-3">No todos yet</p>
              <a
                href="/todos"
                className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium transition-all duration-200"
              >
                Create your first todo
              </a>
            </div>
          ) : (
            <div className="space-y-3">
              {recentTodos.map((todo: any) => (
                <div key={todo.id} className="flex items-center justify-between p-3 bg-slate-50/80 dark:bg-slate-700/30 border border-slate-200/50 dark:border-slate-600/50 rounded-lg hover:bg-slate-100/80 dark:hover:bg-slate-700/50 transition-all duration-200">
                  <div className="flex items-center space-x-3">
                    <div className={`w-4 h-4 rounded-full border-2 transition-colors ${
                      todo.done ? 'bg-emerald-500 border-emerald-500' : 'bg-white dark:bg-slate-600 border-slate-300 dark:border-slate-400'
                    }`}></div>
                    <div>
                      <p className={`font-medium text-sm ${
                        todo.done ? 'text-slate-500 dark:text-slate-400 line-through' : 'text-slate-900 dark:text-white'
                      }`}>
                        {todo.item}
                      </p>
                    </div>
                  </div>
                  <span className={`px-2 py-1 rounded-md text-xs font-medium ${
                    todo.done 
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' 
                      : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                  }`}>
                    {todo.done ? 'Done' : 'Pending'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="relative bg-white/80 dark:bg-slate-800/50 backdrop-blur-sm rounded-xl p-6 border border-slate-200/50 dark:border-slate-700/50 transition-all duration-300">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center">
              <div className="w-6 h-6 bg-emerald-600 rounded-md flex items-center justify-center mr-2">
                <Bell className="h-3 w-3 text-white" />
              </div>
              Recent Reminders
            </h3>
            <a
              href="/reminders"
              className="text-emerald-500 hover:text-emerald-600 text-xs font-medium transition-colors"
            >
              View all →
            </a>
          </div>
          {recentReminders.length === 0 ? (
            <div className="text-center py-8">
              <div className="w-12 h-12 bg-emerald-600 rounded-xl flex items-center justify-center mx-auto mb-3">
                <Bell className="h-6 w-6 text-white" />
              </div>
              <p className="text-slate-600 dark:text-slate-400 text-sm mb-3">No reminders yet</p>
              <a
                href="/reminders"
                className="inline-flex items-center px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-medium transition-all duration-200"
              >
                Set your first reminder
              </a>
            </div>
          ) : (
            <div className="space-y-3">
              {recentReminders.map((reminder: any) => (
                <div key={reminder.reminder_id} className="p-3 bg-slate-50/80 dark:bg-slate-700/30 border border-slate-200/50 dark:border-slate-600/50 rounded-lg hover:bg-slate-100/80 dark:hover:bg-slate-700/50 transition-all duration-200">
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-medium text-slate-900 dark:text-white text-sm">{reminder.message}</p>
                    <span className={`px-2 py-1 rounded-md text-xs font-medium ${
                      new Date(reminder.expires_at) < new Date()
                        ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                        : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                    }`}>
                      {new Date(reminder.expires_at) < new Date() ? 'Overdue' : 'Active'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    Due: {new Date(reminder.expires_at).toLocaleDateString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="relative bg-white/80 dark:bg-slate-800/50 backdrop-blur-sm rounded-xl p-5 border border-slate-200/50 dark:border-slate-700/50 transition-all duration-300">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center">
            <div className="w-6 h-6 bg-purple-600 rounded-md flex items-center justify-center mr-2">
              <Key className="h-3 w-3 text-white" />
            </div>
            AI Configuration
          </h3>
          <a
            href="/api-keys"
            className="text-purple-500 hover:text-purple-600 text-xs font-medium transition-colors"
          >
            Manage →
          </a>
        </div>
        {!hasApiKey ? (
          <div className="text-center py-6">
            <div className="w-10 h-10 bg-purple-600 rounded-xl flex items-center justify-center mx-auto mb-3">
              <Key className="h-5 w-5 text-white" />
            </div>
            <p className="text-slate-600 dark:text-slate-400 text-sm mb-3">No API keys configured</p>
            <a
              href="/api-keys"
              className="inline-flex items-center px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-medium transition-all duration-200"
            >
              Add API Key
            </a>
          </div>
        ) : (
          <div className="p-3 bg-slate-50/80 dark:bg-slate-700/30 border border-slate-200/50 dark:border-slate-600/50 rounded-lg hover:bg-slate-100/80 dark:hover:bg-slate-700/50 transition-all duration-200">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center">
                <Key className="h-4 w-4 text-white" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-slate-900 dark:text-white text-sm">AI Configuration</p>
                <div className="text-xs text-slate-600 dark:text-slate-400">
                  {apiKeyInfo?.model && (
                    <span>Model: {apiKeyInfo.model}</span>
                  )}
                  {apiKeyInfo?.apiUrl && (
                    <span className="ml-3">Endpoint: {new URL(apiKeyInfo.apiUrl).hostname}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
                <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Active</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default DashboardPage