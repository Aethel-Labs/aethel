import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckSquare, Bell, Plus, ArrowRight, Bot } from 'lucide-react';
import { todosAPI, apiKeysAPI, remindersAPI } from '../lib/api';
import { useAuthStore } from '../stores/authStore';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

const DashboardPage = () => {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [notifications, setNotifications] = useState<string[]>([]);

  interface Todo {
    id: number;
    item: string;
    done: boolean;
    created_at: string;
  }

  interface Reminder {
    reminder_id: string;
    message: string;
    expires_at: string;
    completed: boolean;
  }

  const { data: todos } = useQuery({
    queryKey: ['todos'],
    queryFn: () => todosAPI.getTodos().then((res) => res.data),
  });

  const { data: apiKeyInfo } = useQuery({
    queryKey: ['api-keys'],
    queryFn: () => apiKeysAPI.getApiKeys().then((res) => res.data),
  });

  const { data: reminders } = useQuery({
    queryKey: ['reminders'],
    queryFn: () => remindersAPI.getReminders().then((res) => res.data.reminders),
  });

  const { data: activeReminders } = useQuery({
    queryKey: ['active-reminders'],
    queryFn: () => remindersAPI.getActiveReminders().then((res) => res.data.reminders),
    refetchInterval: 30000,
  });

  const completedTodos = todos?.filter((todo: Todo) => todo.done).length || 0;
  const pendingTodos = todos?.filter((todo: Todo) => !todo.done).length || 0;
  const totalTodos = todos?.length || 0;
  const hasApiKey = !!apiKeyInfo?.hasApiKey;

  const activeRemindersCount = activeReminders?.length || 0;
  const overdueReminders =
    activeReminders?.filter((reminder: Reminder) => new Date(reminder.expires_at) < new Date()) ||
    [];

  const overviewData = {
    todos: { total: totalTodos, completed: completedTodos, pending: pendingTodos },
    reminders: { active: activeRemindersCount, overdue: overdueReminders.length },
    aiConfigured: hasApiKey,
  };

  const activeTodosForDisplay = todos?.filter((todo: Todo) => !todo.done) || [];
  const recentTodos = activeTodosForDisplay.slice(0, 5);
  const activeRemindersForDisplay =
    reminders?.filter(
      (reminder: Reminder) => !reminder.completed && new Date(reminder.expires_at) >= new Date()
    ) || [];
  const recentReminders = activeRemindersForDisplay.slice(0, 5);

  useEffect(() => {
    if (overdueReminders.length > 0) {
      overdueReminders.forEach((reminder: Reminder) => {
        const notificationId = `reminder-${reminder.reminder_id}`;
        if (!notifications.includes(notificationId)) {
          toast.error(`Reminder: ${reminder.message}`, {
            duration: 10000,
            action: {
              label: 'Mark Complete',
              onClick: () => handleCompleteReminder(reminder.reminder_id),
            },
          });
          setNotifications((prev) => [...prev, notificationId]);
        }
      });
    }
  }, [overdueReminders]);

  const handleCompleteReminder = async (id: string) => {
    try {
      await remindersAPI.completeReminder(id);
      toast.success('Reminder completed!');
      setNotifications((prev) => prev.filter((notif) => notif !== `reminder-${id}`));
      queryClient.invalidateQueries({ queryKey: ['reminders'] });
      queryClient.invalidateQueries({ queryKey: ['active-reminders'] });
    } catch (_error) {
      toast.error('Failed to complete reminder');
    }
  };

  const handleCompleteTodo = async (id: number) => {
    try {
      await todosAPI.updateTodo(id, { done: true });
      toast.success('Todo completed!');
      queryClient.invalidateQueries({ queryKey: ['todos'] });
    } catch (_error) {
      toast.error('Failed to complete todo');
    }
  };

  return (
    <div className="min-h-screen">
      <div className="max-w-6xl mx-auto px-6 py-12">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold text-gray-900 dark:text-gray-100 mb-4">
            Welcome back, {user?.username}👋
          </h2>
          <p className="text-xl text-gray-600 dark:text-gray-300 mb-8 max-w-2xl mx-auto">
            Keep track of your todos, reminders, and AI configuration all in one place.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
          <div className="command-card">
            <Bot className="w-8 h-8 text-purple-500 mb-3" />
            <h3 className="text-xl font-semibold mb-2 dark:text-gray-100">Custom AI Assistant</h3>
            <p className="text-gray-600 dark:text-gray-300 mb-4">
              {overviewData.aiConfigured
                ? 'AI is ready to assist you with tasks and questions'
                : 'Bring your own AI API key to unlock a limit-free AI command.'}
            </p>
            <a
              href="/api-keys"
              className="bg-white/90 text-gray-800 font-bold py-3 px-8 rounded-full inline-flex items-center space-x-2 transition-all hover:bg-gray-50 hover:shadow-xl hover:scale-102 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-200 shadow-lg"
            >
              <span>{overviewData.aiConfigured ? 'Manage Configuration' : 'Configure AI'}</span>
            </a>
          </div>

          <div className="command-card">
            <CheckSquare className="w-8 h-8 text-green-500 mb-3" />
            <h3 className="text-xl font-semibold mb-2 dark:text-gray-100">Todos</h3>
            <p className="text-gray-600 dark:text-gray-300 mb-4">
              {recentTodos.length > 0
                ? `You have ${recentTodos.length} active todo${recentTodos.length > 1 ? 's' : ''} to complete`
                : 'No active todos. Create your first task to get started.'}
            </p>
            <a
              href="/todos"
              className="bg-white/90 text-gray-800 font-bold py-3 px-8 rounded-full inline-flex items-center space-x-2 transition-all hover:bg-gray-50 hover:shadow-xl hover:scale-102 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-200 shadow-lg"
            >
              <span>{recentTodos.length > 0 ? 'View All Todos' : 'Create Todo'}</span>
            </a>
          </div>

          <div className="command-card">
            <Bell className="w-8 h-8 text-orange-500 mb-3" />
            <h3 className="text-xl font-semibold mb-2 dark:text-gray-100">Reminders</h3>
            <p className="text-gray-600 dark:text-gray-300 mb-4">
              {overdueReminders.length > 0
                ? `${overdueReminders.length} overdue reminder${overdueReminders.length > 1 ? 's' : ''} need attention`
                : recentReminders.length > 0
                  ? `You have ${recentReminders.length} active reminder${recentReminders.length > 1 ? 's' : ''}`
                  : 'No active reminders. Set your first reminder and receive it on Discord.'}
            </p>
            <a
              href="/reminders"
              className="bg-white/90 text-gray-800 font-bold py-3 px-8 rounded-full inline-flex items-center space-x-2 transition-all hover:bg-gray-50 hover:shadow-xl hover:scale-102 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-200 shadow-lg"
            >
              <span>
                {overdueReminders.length > 0
                  ? 'View Overdue'
                  : recentReminders.length > 0
                    ? 'View All Reminders'
                    : 'Create Reminder'}
              </span>
            </a>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Recent Todos</h3>
              <a
                href="/todos"
                className="text-pink-600 hover:text-pink-700 dark:text-pink-400 dark:hover:text-pink-300 transition-colors flex items-center space-x-1"
              >
                <span>View All</span>
                <ArrowRight className="h-4 w-4" />
              </a>
            </div>
            {recentTodos.length > 0 ? (
              <div className="space-y-3">
                {recentTodos.slice(0, 5).map((todo: Todo) => (
                  <div key={todo.id} className="stats-card">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3 flex-1">
                        <div
                          className={`w-3 h-3 rounded-full ${
                            todo.done ? 'bg-green-500' : 'bg-yellow-500'
                          }`}
                        ></div>
                        <div className="flex-1">
                          <p
                            className={`font-medium ${
                              todo.done
                                ? 'text-gray-500 dark:text-gray-400 line-through'
                                : 'text-gray-900 dark:text-gray-100'
                            }`}
                          >
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
                          className="text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300 hover:bg-green-50 dark:hover:bg-green-900/30 text-sm font-medium px-3 py-1 rounded transition-colors"
                        >
                          Complete
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="stats-card text-center">
                <CheckSquare className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  No todos yet
                </h4>
                <p className="text-gray-600 dark:text-gray-300 mb-6">
                  Create your first todo to start organizing your tasks
                </p>
                <a
                  href="/todos"
                  className="inline-flex items-center space-x-2 bg-green-600 text-white py-3 px-8 rounded-full transition-all transform hover:bg-green-700 hover:shadow-lg active:scale-95 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-600 shadow-lg font-bold"
                >
                  <Plus className="h-4 w-4" />
                  <span>Create Todo</span>
                </a>
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                Recent Reminders
              </h3>
              <a
                href="/reminders"
                className="text-pink-600 hover:text-pink-700 dark:text-pink-400 dark:hover:text-pink-300 transition-colors flex items-center space-x-1"
              >
                <span>View All</span>
                <ArrowRight className="h-4 w-4" />
              </a>
            </div>
            {recentReminders.length > 0 ? (
              <div className="space-y-3">
                {recentReminders.slice(0, 5).map((reminder: Reminder) => {
                  const isOverdue = new Date(reminder.expires_at) < new Date();
                  const daysOverdue = isOverdue
                    ? Math.ceil(
                        (Date.now() - new Date(reminder.expires_at).getTime()) /
                          (1000 * 60 * 60 * 24)
                      )
                    : 0;

                  return (
                    <div key={reminder.reminder_id} className="stats-card">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3 flex-1">
                          <div
                            className={`w-3 h-3 rounded-full ${
                              isOverdue ? 'bg-red-500' : 'bg-green-500'
                            }`}
                          ></div>
                          <div className="flex-1">
                            <p className="text-gray-900 dark:text-gray-100 font-medium">
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
                              ? 'text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/30'
                              : 'text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300 hover:bg-green-50 dark:hover:bg-green-900/30'
                          }`}
                        >
                          Complete
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="stats-card text-center">
                <Bell className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  No reminders yet
                </h4>
                <p className="text-gray-600 dark:text-gray-300 mb-6">
                  Set up your first reminder to never miss important events
                </p>
                <a
                  href="/reminders"
                  className="inline-flex items-center space-x-2 bg-orange-600 text-white py-3 px-8 rounded-full transition-all transform hover:bg-orange-700 hover:shadow-lg active:scale-95 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-600 shadow-lg font-bold"
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
  );
};

export default DashboardPage;
