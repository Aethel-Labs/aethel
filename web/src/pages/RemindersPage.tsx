import React, { useState, useEffect } from 'react';
import { Plus, Check, Bell, Clock, Calendar } from 'lucide-react';
import { remindersAPI } from '../lib/api';
import { toast } from 'sonner';

interface Reminder {
  reminder_id: string;
  message: string;
  expires_at: string;
  is_completed: boolean;
  created_at: string;
}

const formatTime = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const relativeDue = (dateString: string) => {
  const diff = new Date(dateString).getTime() - Date.now();
  const overdue = diff < 0;
  const abs = Math.abs(diff);
  const mins = Math.floor(abs / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  let str;
  if (days > 0) str = `${days}d`;
  else if (hours > 0) str = `${hours}h`;
  else if (mins > 0) str = `${mins}m`;
  else str = 'now';
  return overdue ? `${str} ago` : `in ${str}`;
};

const RemindersPage: React.FC = () => {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newReminder, setNewReminder] = useState({ message: '', expires_at: '' });

  useEffect(() => {
    fetchReminders();
  }, []);

  const fetchReminders = async () => {
    try {
      const response = await remindersAPI.getReminders();
      setReminders(response.data.reminders || []);
    } catch (_error) {
      toast.error('Failed to fetch reminders');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateReminder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newReminder.message.trim() || !newReminder.expires_at) {
      toast.error('Please fill in all fields');
      return;
    }
    try {
      await remindersAPI.createReminder({
        message: newReminder.message.trim(),
        expires_at: newReminder.expires_at,
      });
      toast.success('Reminder created');
      setNewReminder({ message: '', expires_at: '' });
      setShowCreateForm(false);
      fetchReminders();
    } catch (_error) {
      toast.error('Failed to create reminder');
    }
  };

  const handleCompleteReminder = async (id: string) => {
    try {
      await remindersAPI.completeReminder(id);
      toast.success('Reminder completed');
      fetchReminders();
    } catch (_error) {
      toast.error('Failed to complete reminder');
    }
  };

  const handleClearCompleted = async () => {
    try {
      const completed = reminders.filter((r) => r.is_completed);
      if (completed.length === 0) {
        toast.info('No completed reminders to clear');
        return;
      }
      await remindersAPI.clearCompletedReminders();
      toast.success('Completed reminders cleared');
      fetchReminders();
    } catch (_error) {
      toast.error('Failed to clear completed reminders');
    }
  };

  const getMinDateTime = () => {
    const minTime = new Date(Date.now() + 60000);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${minTime.getFullYear()}-${pad(minTime.getMonth() + 1)}-${pad(minTime.getDate())}T${pad(minTime.getHours())}:${pad(minTime.getMinutes())}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="spinner h-5 w-5" />
      </div>
    );
  }

  const activeReminders = reminders.filter((r) => !r.is_completed);
  const overdue = activeReminders.filter((r) => new Date(r.expires_at).getTime() < Date.now());
  const upcoming = activeReminders.filter((r) => new Date(r.expires_at).getTime() >= Date.now());
  const completedReminders = reminders.filter((r) => r.is_completed);

  return (
    <div className="space-y-7">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-muted">
            {overdue.length > 0 ? `${overdue.length} overdue` : 'Notifications'}
          </p>
          <h1 className="mt-1.5 text-3xl font-semibold tracking-tight text-ink">Reminders</h1>
        </div>
        <div className="flex items-center gap-2">
          {completedReminders.length > 0 && (
            <button
              onClick={handleClearCompleted}
              className="btn btn-ghost btn-sm"
            >
              Clear completed
            </button>
          )}
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="btn btn-primary"
          >
            <Plus className="h-4 w-4" />
            New
          </button>
        </div>
      </div>

      {showCreateForm && (
        <form
          onSubmit={handleCreateReminder}
          className="space-y-4 rounded-lg border border-line bg-surface p-4"
        >
          <div>
            <label
              htmlFor="message"
              className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-faint"
            >
              Message
            </label>
            <textarea
              id="message"
              value={newReminder.message}
              onChange={(e) => setNewReminder({ ...newReminder, message: e.target.value })}
              placeholder="What should I remind you about?"
              className="input min-h-[72px] resize-y"
              rows={3}
              required
              autoFocus
            />
          </div>
          <div>
            <label
              htmlFor="expires_at"
              className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-faint"
            >
              Remind me at
            </label>
            <input
              type="datetime-local"
              id="expires_at"
              value={newReminder.expires_at}
              onChange={(e) => setNewReminder({ ...newReminder, expires_at: e.target.value })}
              min={getMinDateTime()}
              className="input"
              required
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              className="btn btn-primary"
            >
              Create
            </button>
            <button
              type="button"
              onClick={() => {
                setShowCreateForm(false);
                setNewReminder({ message: '', expires_at: '' });
              }}
              className="btn btn-secondary"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {reminders.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-line py-20">
          <Bell className="mb-3 h-8 w-8 text-faint" />
          <p className="text-sm font-medium text-ink">No reminders</p>
          <p className="mt-0.5 text-xs text-muted">Get notified on Discord when it's time.</p>
          <button
            onClick={() => setShowCreateForm(true)}
            className="btn btn-secondary btn-sm mt-4"
          >
            Create reminder
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {overdue.length > 0 && (
            <section>
              <h2 className="mb-2.5 text-sm font-medium text-danger">Overdue · {overdue.length}</h2>
              <div className="overflow-hidden rounded-lg border border-danger/30 bg-danger-tint/20">
                {overdue.map((reminder, i) => (
                  <div
                    key={reminder.reminder_id}
                    className={`flex items-center gap-3 px-4 py-3 transition-colors hover:bg-danger-tint/40 ${
                      i !== overdue.length - 1 ? 'border-b border-danger/20' : ''
                    }`}
                  >
                    <div className="h-2 w-2 flex-shrink-0 rounded-full bg-danger" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-ink">{reminder.message}</p>
                      <p className="mt-0.5 text-xs font-medium text-danger">
                        {relativeDue(reminder.expires_at)}
                      </p>
                    </div>
                    <button
                      onClick={() => handleCompleteReminder(reminder.reminder_id)}
                      className="btn btn-ghost btn-sm"
                    >
                      <Check className="h-4 w-4" />
                      Done
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {upcoming.length > 0 && (
            <section>
              <h2 className="mb-2.5 text-sm font-medium text-faint">
                Upcoming · {upcoming.length}
              </h2>
              <div className="overflow-hidden rounded-lg border border-line bg-surface">
                {upcoming.map((reminder, i) => (
                  <div
                    key={reminder.reminder_id}
                    className={`flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-hover ${
                      i !== upcoming.length - 1 ? 'border-b border-line' : ''
                    }`}
                  >
                    <div className="h-2 w-2 flex-shrink-0 rounded-full bg-success" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-ink">{reminder.message}</p>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-faint">
                        <Clock className="h-3 w-3" />
                        {relativeDue(reminder.expires_at)}
                        <span className="text-faint/60">·</span>
                        <Calendar className="h-3 w-3" />
                        {formatTime(reminder.expires_at)}
                      </div>
                    </div>
                    <button
                      onClick={() => handleCompleteReminder(reminder.reminder_id)}
                      className="btn btn-ghost btn-sm"
                    >
                      <Check className="h-4 w-4" />
                      Done
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {completedReminders.length > 0 && (
            <section>
              <h2 className="mb-2.5 text-sm font-medium text-faint">
                Completed · {completedReminders.length}
              </h2>
              <div className="overflow-hidden rounded-lg border border-line bg-surface">
                {completedReminders.map((reminder, i) => (
                  <div
                    key={reminder.reminder_id}
                    className={`flex items-center gap-3 px-4 py-3 ${
                      i !== completedReminders.length - 1 ? 'border-b border-line' : ''
                    }`}
                  >
                    <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-success">
                      <Check className="h-3 w-3 text-white" />
                    </div>
                    <p className="flex-1 truncate text-sm text-muted line-through">
                      {reminder.message}
                    </p>
                    <span className="text-xs text-faint">{formatTime(reminder.expires_at)}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
};

export default RemindersPage;
