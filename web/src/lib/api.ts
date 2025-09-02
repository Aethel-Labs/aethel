import axios from 'axios';
import { toast } from 'sonner';

const api = axios.create({
  baseURL: `/api`,
  timeout: 10000,
});

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/';
      toast.error('Session expired. Please login again.');
    } else if (error.response?.status >= 500) {
      toast.error('Server error. Please try again later.');
    } else if (error.response?.data?.message) {
      toast.error(error.response.data.message);
    } else {
      toast.error('An unexpected error occurred.');
    }
    return Promise.reject(error);
  },
);

export default api;

export const authAPI = {
  getDiscordAuthUrl: () => api.get('/auth/discord'),
  getMe: () => api.get('/auth/me'),
  logout: () => api.post('/auth/logout'),
};

export const todosAPI = {
  getTodos: () => api.get('/todos'),
  createTodo: (data: { item: string }) => api.post('/todos', data),
  updateTodo: (id: number, data: { item?: string; done?: boolean }) =>
    api.put(`/todos/${id}`, data),
  deleteTodo: (id: number) => api.delete(`/todos/${id}`),
  clearTodos: () => api.delete('/todos'),
};

export const apiKeysAPI = {
  getApiKeys: () => api.get('/user/api-keys'),
  updateApiKey: (data: { apiKey?: string; model?: string; apiUrl?: string }) =>
    api.post('/user/api-keys', data),
  deleteApiKey: () => api.delete('/user/api-keys'),
  testApiKey: (data: { apiKey: string; model?: string; apiUrl?: string }) =>
    api.post('/user/api-keys/test', data),
};

export const remindersAPI = {
  getReminders: () => api.get('/reminders'),
  createReminder: (data: { message: string; expires_at: string }) => api.post('/reminders', data),
  getReminder: (id: string) => api.get(`/reminders/${id}`),
  completeReminder: (id: string) => api.patch(`/reminders/${id}/complete`),
  getActiveReminders: () => api.get('/reminders/active/all'),
  clearCompletedReminders: () => api.delete('/reminders/completed'),
};
