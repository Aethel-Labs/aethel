import React, { useState, useEffect } from 'react';
import { Plus, Clock, Check, Trash2, Bell } from 'lucide-react';
import { remindersAPI } from '../lib/api';
import { toast } from 'sonner';

interface Reminder {
  reminder_id: string;
  message: string;
  expires_at: string;
  is_completed: boolean;
  created_at: string;
}

const RemindersPage: React.FC = () => {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newReminder, setNewReminder] = useState({
    message: '',
    expires_at: '',
  });

  useEffect(() => {
    fetchReminders();
  }, []);

  const fetchReminders = async () => {
    try {
      const response = await remindersAPI.getReminders();
      setReminders(response.data.reminders || []);
    } catch (error) {
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

      toast.success('Reminder created successfully!');
      setNewReminder({ message: '', expires_at: '' });
      setShowCreateForm(false);
      fetchReminders();
    } catch (error) {
      toast.error('Failed to create reminder');
    }
  };

  const handleCompleteReminder = async (id: string) => {
    try {
      await remindersAPI.completeReminder(id);
      toast.success('Reminder completed!');
      fetchReminders();
    } catch (error) {
      toast.error('Failed to complete reminder');
    }
  };

  const handleClearCompleted = async () => {
    try {
      const completedReminders = reminders.filter((r) => r.is_completed);
      if (completedReminders.length === 0) {
        toast.info('No completed reminders to clear');
        return;
      }

      await remindersAPI.clearCompletedReminders();
      toast.success('Completed reminders cleared!');
      fetchReminders();
    } catch (error) {
      toast.error('Failed to clear completed reminders');
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const isExpired = (dateString: string) => {
    return new Date(dateString) < new Date();
  };

  const getMinDateTime = () => {
    const now = new Date();
    const minTime = new Date(now.getTime() + 60000);
    const year = minTime.getFullYear();
    const month = String(minTime.getMonth() + 1).padStart(2, '0');
    const day = String(minTime.getDate()).padStart(2, '0');
    const hours = String(minTime.getHours()).padStart(2, '0');
    const minutes = String(minTime.getMinutes()).padStart(2, '0');

    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-discord-blurple"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Reminders</h1>
          <p className="text-gray-600 mt-2">Manage your personal reminders and notifications</p>
        </div>
        <div className="flex items-center gap-3">
          {reminders.some((r) => r.is_completed) && (
            <button
              onClick={handleClearCompleted}
              className="btn btn-danger active:scale-95 transition-transform"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Clear Completed
            </button>
          )}
          <button
            onClick={() => setShowCreateForm(true)}
            className="btn btn-primary active:scale-95 transition-transform"
          >
            <Plus className="h-4 w-4 mr-2" />
            New Reminder
          </button>
        </div>
      </div>

      {/* Create Reminder Form */}
      {showCreateForm && (
        <div className="bg-white/80 p-8 rounded-lg border border-gray-200 shadow-lg">
          <h2 className="text-xl font-semibold mb-6 text-gray-900">Create New Reminder</h2>
          <form onSubmit={handleCreateReminder} className="space-y-6">
            <div>
              <label htmlFor="message" className="block text-sm font-medium text-gray-700 mb-2">
                Reminder Message
              </label>
              <textarea
                id="message"
                value={newReminder.message}
                onChange={(e) => setNewReminder({ ...newReminder, message: e.target.value })}
                placeholder="What would you like to be reminded about?"
                className="input"
                rows={3}
                required
              />
            </div>
            <div>
              <label htmlFor="expires_at" className="block text-sm font-medium text-gray-700 mb-2">
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
            <div className="flex gap-3">
              <button
                type="submit"
                className="btn btn-primary active:scale-95 transition-transform"
              >
                Create Reminder
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowCreateForm(false);
                  setNewReminder({ message: '', expires_at: '' });
                }}
                className="btn btn-secondary active:scale-95 transition-transform"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="space-y-4">
        {reminders.length === 0 ? (
          <div className="text-center py-12">
            <Bell className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No reminders yet</h3>
            <p className="text-gray-600 mb-4">Create your first reminder to get started!</p>
            <button
              onClick={() => setShowCreateForm(true)}
              className="btn btn-primary active:scale-95 transition-transform"
            >
              Create Reminder
            </button>
          </div>
        ) : (
          reminders.map((reminder) => (
            <div
              key={reminder.reminder_id}
              className={`card p-6 border-l-4 ${
                reminder.is_completed
                  ? 'border-green-500 bg-green-900/20'
                  : isExpired(reminder.expires_at)
                    ? 'border-red-500 bg-red-900/20'
                    : 'border-blue-500'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p
                    className={`text-lg ${reminder.is_completed ? 'line-through text-gray-500' : 'text-gray-900'}`}
                  >
                    {reminder.message}
                  </p>
                  <div className="flex items-center gap-4 mt-3 text-sm text-gray-600">
                    <div className="flex items-center gap-1">
                      <Clock className="h-4 w-4" />
                      <span>Remind at: {formatDate(reminder.expires_at)}</span>
                    </div>
                    {isExpired(reminder.expires_at) && !reminder.is_completed && (
                      <span className="text-red-600 font-medium">Overdue</span>
                    )}
                    {reminder.is_completed && (
                      <span className="text-green-600 font-medium">Completed</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-4">
                  {!reminder.is_completed && (
                    <button
                      onClick={() => handleCompleteReminder(reminder.reminder_id)}
                      className="btn btn-success p-2 active:scale-95 transition-transform"
                      title="Mark as completed"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default RemindersPage;
