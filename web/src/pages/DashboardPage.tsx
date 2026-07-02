import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Bell, Bot, ArrowRight, Circle, Clock, AlertTriangle, ListTodo } from 'lucide-react';
import { todosAPI, apiKeysAPI, remindersAPI } from '../lib/api';
import { useAuthStore } from '../stores/authStore';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';

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
    activeReminders?.filter(
      (reminder: Reminder) => new Date(reminder.expires_at).getTime() < Date.now(),
    ) || [];

  const activeTodosForDisplay = todos?.filter((todo: Todo) => !todo.done) || [];
  const recentTodos = activeTodosForDisplay.slice(0, 6);
  const activeRemindersForDisplay =
    reminders?.filter(
      (reminder: Reminder) =>
        !reminder.completed && new Date(reminder.expires_at).getTime() >= Date.now(),
    ) || [];
  const recentReminders = activeRemindersForDisplay.slice(0, 4);

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
      toast.success('Reminder completed');
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
      toast.success('Todo completed');
      queryClient.invalidateQueries({ queryKey: ['todos'] });
    } catch (_error) {
      toast.error('Failed to complete todo');
    }
  };

  const hasOverdue = overdueReminders.length > 0;
  const todoProgress = totalTodos > 0 ? Math.round((completedTodos / totalTodos) * 100) : 0;

  const relativeTime = (date: string) => {
    const diff = Date.now() - new Date(date).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const formatDueTime = (date: string) => {
    const d = new Date(date);
    const now = new Date();
    const diff = d.getTime() - now.getTime();
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(hours / 24);
    if (days > 0) return `in ${days}d`;
    if (hours > 0) return `in ${hours}h`;
    const mins = Math.floor(diff / 60000);
    if (mins > 0) return `in ${mins}m`;
    return 'now';
  };

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-muted">
            {hasOverdue
              ? 'Needs your attention'
              : pendingTodos > 0
                ? 'You have things to do'
                : 'All caught up'}
          </p>
          <h1 className="mt-1.5 text-3xl font-semibold tracking-tight text-ink">
            Hey, {user?.username}
          </h1>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted">
          <span className="flex h-2 w-2 rounded-full bg-success" />
          Bot online
        </div>
      </div>

      {hasOverdue ? (
        <div className="overflow-hidden rounded-xl border border-danger/30 bg-danger-tint/30">
          <div className="flex items-center gap-2.5 border-b border-danger/20 px-5 py-3.5">
            <AlertTriangle className="h-4 w-4 text-danger" />
            <span className="text-base font-semibold text-danger">
              {overdueReminders.length} overdue reminder{overdueReminders.length > 1 ? 's' : ''}
            </span>
          </div>
          <div className="divide-y divide-danger/10">
            {overdueReminders.slice(0, 3).map((reminder: Reminder) => {
              const daysOverdue = Math.ceil(
                (Date.now() - new Date(reminder.expires_at).getTime()) / 86400000,
              );
              return (
                <div
                  key={reminder.reminder_id}
                  className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-danger-tint/50"
                >
                  <Clock className="h-4 w-4 flex-shrink-0 text-danger" />
                  <p className="flex-1 truncate text-sm text-ink">{reminder.message}</p>
                  <span className="flex-shrink-0 text-sm font-medium text-danger">
                    {daysOverdue}d overdue
                  </span>
                  <button
                    onClick={() => handleCompleteReminder(reminder.reminder_id)}
                    className="btn btn-ghost btn-sm flex-shrink-0"
                  >
                    Done
                  </button>
                </div>
              );
            })}
          </div>
          {overdueReminders.length > 3 && (
            <Link
              to="/reminders"
              className="block px-5 py-3 text-center text-sm font-medium text-danger hover:bg-danger-tint/50"
            >
              View all {overdueReminders.length} overdue →
            </Link>
          )}
        </div>
      ) : pendingTodos > 0 ? (
        <Link
          to="/todos"
          className="flex items-center gap-3 rounded-xl border border-line bg-surface px-5 py-4 transition-colors hover:bg-surface-hover"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-tint">
            <ListTodo className="h-4 w-4 text-accent" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-ink">
              {pendingTodos} todo{pendingTodos > 1 ? 's' : ''} pending
            </p>
            <p className="text-sm text-muted">No reminders overdue — you're on track.</p>
          </div>
          <ArrowRight className="h-4 w-4 text-faint" />
        </Link>
      ) : (
        <div className="flex items-center gap-3 rounded-xl border border-line bg-surface px-5 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-success-tint">
            <Check className="h-4 w-4 text-success" />
          </div>
          <p className="text-sm text-muted">Nothing pending. You're fully caught up.</p>
        </div>
      )}

      <div className="grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-line bg-line">
        <Link
          to="/todos"
          className="group flex flex-col gap-2.5 bg-surface p-5 transition-colors hover:bg-surface-hover"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted">Todos</span>
            <Check className="h-4 w-4 text-faint" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-semibold tabular-nums text-ink">{pendingTodos}</span>
            <span className="text-sm text-faint">pending</span>
          </div>
          {totalTodos > 0 && (
            <div className="flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line-strong">
                <div
                  className="h-full rounded-full bg-success transition-all"
                  style={{ width: `${todoProgress}%` }}
                />
              </div>
              <span className="text-xs tabular-nums text-faint">{todoProgress}%</span>
            </div>
          )}
        </Link>

        <Link
          to="/reminders"
          className="group flex flex-col gap-2.5 bg-surface p-5 transition-colors hover:bg-surface-hover"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted">Reminders</span>
            <Bell className="h-4 w-4 text-faint" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-semibold tabular-nums text-ink">
              {activeRemindersCount}
            </span>
            <span className="text-sm text-faint">active</span>
          </div>
          {recentReminders.length > 0 ? (
            <p className="text-xs text-faint">
              Next: {formatDueTime(recentReminders[0].expires_at)}
            </p>
          ) : (
            <p className="text-xs text-faint">None scheduled</p>
          )}
        </Link>

        <Link
          to="/api-keys"
          className="group flex flex-col gap-2.5 bg-surface p-5 transition-colors hover:bg-surface-hover"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted">AI</span>
            <Bot className="h-4 w-4 text-faint" />
          </div>
          <div className="flex items-baseline gap-2">
            {hasApiKey ? (
              <span className="text-xl font-semibold text-ink">Ready</span>
            ) : (
              <span className="text-base font-medium text-muted">Not set up</span>
            )}
          </div>
          <p className="truncate text-xs text-faint">
            {hasApiKey ? apiKeyInfo?.model || 'Configured' : 'Bring your own key'}
          </p>
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-5">
        <section className="lg:col-span-3">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold text-ink">Recent todos</h2>
            <Link
              to="/todos"
              className="flex items-center gap-1.5 text-sm font-medium text-accent hover:text-accent-hover"
            >
              All {pendingTodos > 0 && <span className="text-faint">({pendingTodos})</span>}
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {recentTodos.length > 0 ? (
            <div className="overflow-hidden rounded-lg border border-line bg-surface">
              {recentTodos.map((todo: Todo, i: number) => (
                <div
                  key={todo.id}
                  className={`group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-hover ${
                    i !== recentTodos.length - 1 ? 'border-b border-line' : ''
                  }`}
                >
                  <button
                    onClick={() => handleCompleteTodo(todo.id)}
                    className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border border-line-strong text-transparent transition-colors hover:border-success hover:text-success"
                    aria-label="Complete todo"
                  >
                    <Check className="h-3 w-3" />
                  </button>
                  <span className="flex-1 truncate text-sm text-ink">{todo.item}</span>
                  <span className="flex-shrink-0 text-xs text-faint">
                    {relativeTime(todo.created_at)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-line py-14">
              <Check className="mb-2 h-7 w-7 text-faint" />
              <p className="text-sm text-muted">No pending todos</p>
            </div>
          )}
        </section>

        <section className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold text-ink">Upcoming</h2>
            <Link
              to="/reminders"
              className="flex items-center gap-1.5 text-sm font-medium text-accent hover:text-accent-hover"
            >
              All
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {recentReminders.length > 0 ? (
            <div className="overflow-hidden rounded-lg border border-line bg-surface">
              {recentReminders.map((reminder: Reminder, i: number) => {
                const overdue = new Date(reminder.expires_at).getTime() < Date.now();
                return (
                  <div
                    key={reminder.reminder_id}
                    className={`flex items-start gap-3 px-4 py-3 transition-colors hover:bg-surface-hover ${
                      i !== recentReminders.length - 1 ? 'border-b border-line' : ''
                    }`}
                  >
                    <Circle
                      className={`mt-1 h-3.5 w-3.5 flex-shrink-0 ${
                        overdue ? 'fill-danger text-danger' : 'fill-success text-success'
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-ink">{reminder.message}</p>
                      <p className="mt-0.5 text-xs text-faint">
                        {formatDueTime(reminder.expires_at)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-line py-14">
              <Bell className="mb-2 h-7 w-7 text-faint" />
              <p className="text-sm text-muted">No reminders</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default DashboardPage;
