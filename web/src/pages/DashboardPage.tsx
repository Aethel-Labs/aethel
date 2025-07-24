import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckSquare, Bell, Plus, ArrowRight, Bot } from 'lucide-react'
import { todosAPI, apiKeysAPI, remindersAPI } from '../lib/api'
import { useAuthStore } from '../stores/authStore'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

const DashboardPage = () => {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
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

  const overviewData = {
    todos: { total: totalTodos, completed: completedTodos, pending: pendingTodos },
    reminders: { active: activeRemindersCount, overdue: overdueReminders.length },
    aiConfigured: hasApiKey
  }

  const activeTodosForDisplay = todos?.filter((todo: any) => !todo.done) || []
  const recentTodos = activeTodosForDisplay.slice(0, 5)
  const activeRemindersForDisplay = reminders?.filter((reminder: any) => 
    !reminder.completed && new Date(reminder.expires_at) >= new Date()
  ) || []
  const recentReminders = activeRemindersForDisplay.slice(0, 5)

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
      queryClient.invalidateQueries({ queryKey: ['reminders'] })
      queryClient.invalidateQueries({ queryKey: ['active-reminders'] })
    } catch (error) {
      toast.error('Failed to complete reminder')
    }
  }

  const handleCompleteTodo = async (id: number) => {
    try {
      await todosAPI.updateTodo(id, { done: true })
      toast.success('Todo completed!')
      queryClient.invalidateQueries({ queryKey: ['todos'] })
    } catch (error) {
      toast.error('Failed to complete todo')
    }
  }

  


  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-6xl mx-auto px-6 py-12">
        


        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
            Welcome back, {user?.username}👋
          </h2>
          <p className="text-xl text-gray-600 dark:text-gray-300 mb-8 max-w-2xl mx-auto">
            Keep track of your todos, reminders, and AI configuration all in one place.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
          
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700 hover:shadow-lg transition-shadow">
            <div className="flex items-center">
              <div className={`p-2 rounded-lg mr-3 ${
                overviewData.aiConfigured 
                  ? 'bg-green-100 dark:bg-green-900/30' 
                  : 'bg-red-100 dark:bg-red-900/30'
              }`}>
                <Bot className={`w-6 h-6 ${
                  overviewData.aiConfigured ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                }`} />
              </div>
              <h3 className="font-semibold text-gray-900 dark:text-white">
                Custom AI Assistant
              </h3>
            </div>
            <p className="text-gray-600 dark:text-gray-300 text-sm mt-3 mb-4">
              {overviewData.aiConfigured 
                ? 'AI is ready to assist you with tasks and questions' 
                : 'Bring your own AI API key to unlock a limit-free AI command.'
              }
            </p>
            <a
              href="/api-keys"
              className="inline-flex items-center justify-center w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
            >
              {overviewData.aiConfigured ? 'Manage Configuration' : 'Configure AI'}
            </a>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700 hover:shadow-lg transition-shadow">
            <div className="flex items-center">
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30 mr-3">
                <CheckSquare className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              </div>
              <h3 className="font-semibold text-gray-900 dark:text-white">
                Todos
              </h3>
            </div>
            <p className="text-gray-600 dark:text-gray-300 text-sm mt-3 mb-4">
              {recentTodos.length > 0 
                ? `You have ${recentTodos.length} active todo${recentTodos.length > 1 ? 's' : ''} to complete`
                : 'No active todos. Create your first task to get started.'
              }
            </p>
            <a
              href="/todos"
              className="inline-flex items-center justify-center w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
            >
              {recentTodos.length > 0 ? 'View All Todos' : 'Create Todo'}
            </a>
          </div>

          {/* Reminders Summary Card */}
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700 hover:shadow-lg transition-shadow">
            <div className="flex items-center">
              <div className={`p-2 rounded-lg mr-3 ${
                overdueReminders.length > 0 
                  ? 'bg-red-100 dark:bg-red-900/30'
                  : 'bg-yellow-100 dark:bg-yellow-900/30'
              }`}>
                <Bell className={`w-6 h-6 ${
                  overdueReminders.length > 0 
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-yellow-600 dark:text-yellow-400'
                }`} />
              </div>
              <h3 className="font-semibold text-gray-900 dark:text-white">
                Reminders
              </h3>
            </div>
            <p className="text-gray-600 dark:text-gray-300 text-sm mt-3 mb-4">
              {overdueReminders.length > 0 
                ? `${overdueReminders.length} overdue reminder${overdueReminders.length > 1 ? 's' : ''} need attention`
                : recentReminders.length > 0
                  ? `You have ${recentReminders.length} active reminder${recentReminders.length > 1 ? 's' : ''}`
                  : 'No active reminders. Set your first reminder and receive it on Discord.'
              }
            </p>
            <a
              href="/reminders"
              className={`inline-flex items-center justify-center w-full font-medium py-2 px-4 rounded-lg transition-colors ${
                overdueReminders.length > 0
                  ? 'bg-red-600 hover:bg-red-700 text-white'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              {overdueReminders.length > 0 
                ? 'View Overdue' 
                : recentReminders.length > 0 
                  ? 'View All Reminders' 
                  : 'Create Reminder'
              }
            </a>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          <div>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white">Recent Todos</h3>
              <a href="/todos" className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors flex items-center space-x-1">
                <span>View All</span>
                <ArrowRight className="h-4 w-4" />
              </a>
            </div>
            {recentTodos.length > 0 ? (
              <div className="space-y-3">
                {recentTodos.slice(0, 5).map((todo: any) => (
                  <div key={todo.id} className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700 hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3 flex-1">
                        <div className={`w-3 h-3 rounded-full ${
                          todo.done ? 'bg-green-500' : 'bg-yellow-500'
                        }`}></div>
                        <div className="flex-1">
                          <p className={`font-medium ${
                            todo.done 
                              ? 'text-gray-500 dark:text-gray-400 line-through' 
                              : 'text-gray-900 dark:text-white'
                          }`}>
                            {todo.item}
                          </p>
                          <p className="text-gray-600 dark:text-gray-400 text-sm">
                            Created {new Date(todo.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      {!todo.done && (
                        <button
                          onClick={() => handleCompleteTodo(todo.id)}
                          className="text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300 text-sm font-medium px-3 py-1 rounded transition-colors"
                        >
                          Complete
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-white dark:bg-gray-800 rounded-lg p-8 border border-gray-200 dark:border-gray-700 text-center">
                <CheckSquare className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">No todos yet</h4>
                <p className="text-gray-600 dark:text-gray-400 mb-6">Create your first todo to start organizing your tasks</p>
                <a
                  href="/todos"
                  className="inline-flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg transition-colors font-medium"
                >
                  <Plus className="h-4 w-4" />
                  <span>Create Todo</span>
                </a>
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white">Recent Reminders</h3>
              <a href="/reminders" className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors flex items-center space-x-1">
                <span>View All</span>
                <ArrowRight className="h-4 w-4" />
              </a>
            </div>
            {recentReminders.length > 0 ? (
              <div className="space-y-3">
                {recentReminders.slice(0, 5).map((reminder: any) => {
                  const isOverdue = new Date(reminder.expires_at) < new Date()
                  const daysOverdue = isOverdue ? Math.ceil((Date.now() - new Date(reminder.expires_at).getTime()) / (1000 * 60 * 60 * 24)) : 0
                  
                  return (
                    <div key={reminder.reminder_id} className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700 hover:shadow-md transition-shadow">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3 flex-1">
                          <div className={`w-3 h-3 rounded-full ${
                            isOverdue ? 'bg-red-500' : 'bg-green-500'
                          }`}></div>
                          <div className="flex-1">
                            <p className="text-gray-900 dark:text-white font-medium">
                              {reminder.message}
                            </p>
                            <div className="flex items-center space-x-4 mt-1">
                              <p className="text-gray-600 dark:text-gray-400 text-sm">
                                Due {new Date(reminder.expires_at).toLocaleDateString()}
                              </p>
                              {isOverdue && (
                                <p className="text-red-600 dark:text-red-400 text-sm font-medium">
                                  {daysOverdue} day{daysOverdue > 1 ? 's' : ''} overdue
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => handleCompleteReminder(reminder.reminder_id)}
                          className={`text-sm font-medium px-3 py-1 rounded transition-colors ${
                            isOverdue 
                              ? 'text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300' 
                              : 'text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300'
                          }`}
                        >
                          Complete
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="bg-white dark:bg-gray-800 rounded-lg p-8 border border-gray-200 dark:border-gray-700 text-center">
                <Bell className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">No reminders yet</h4>
                <p className="text-gray-600 dark:text-gray-400 mb-6">Set up your first reminder to never miss important events</p>
                <a
                  href="/reminders"
                  className="inline-flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg transition-colors font-medium"
                >
                  <Plus className="h-4 w-4" />
                  <span>Create Reminder</span>
                </a>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default DashboardPage