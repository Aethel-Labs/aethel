import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Check, Trash2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { todosAPI } from '../lib/api';

interface Todo {
  id: number;
  item: string;
  done: boolean;
  created_at: string;
  completed_at?: string;
}

const TodosPage = () => {
  const [newTodo, setNewTodo] = useState('');
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const queryClient = useQueryClient();

  const { data: todos, isLoading } = useQuery({
    queryKey: ['todos'],
    queryFn: () => todosAPI.getTodos().then((res) => res.data),
  });

  const addTodoMutation = useMutation({
    mutationFn: (item: string) => todosAPI.createTodo({ item }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['todos'] });
      setNewTodo('');
      toast.success('Todo added successfully!');
    },
    onError: () => {
      toast.error('Failed to add todo');
    },
  });

  const updateTodoMutation = useMutation({
    mutationFn: ({ id, done }: { id: number; done: boolean }) => todosAPI.updateTodo(id, { done }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['todos'] });
    },
    onError: () => {
      toast.error('Failed to update todo');
    },
  });

  const deleteTodoMutation = useMutation({
    mutationFn: (id: number) => todosAPI.deleteTodo(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['todos'] });
      toast.success('Todo deleted successfully!');
    },
    onError: () => {
      toast.error('Failed to delete todo');
    },
  });

  const clearAllMutation = useMutation({
    mutationFn: () => todosAPI.clearTodos(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['todos'] });
      setShowClearConfirm(false);
      toast.success('All todos cleared successfully!');
    },
    onError: () => {
      toast.error('Failed to clear todos');
    },
  });

  const handleAddTodo = (e: React.FormEvent) => {
    e.preventDefault();
    if (newTodo.trim()) {
      addTodoMutation.mutate(newTodo.trim());
    }
  };

  const handleToggleTodo = (id: number, done: boolean) => {
    updateTodoMutation.mutate({ id, done: !done });
  };

  const handleDeleteTodo = (id: number) => {
    deleteTodoMutation.mutate(id);
  };

  const handleClearAll = () => {
    clearAllMutation.mutate();
  };

  const completedTodos = todos?.filter((todo: Todo) => todo.done) || [];
  const pendingTodos = todos?.filter((todo: Todo) => !todo.done) || [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-discord-blurple"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Todos</h1>
          <p className="text-gray-600">
            Manage your todo list. {todos?.length || 0} total, {completedTodos.length} completed
          </p>
        </div>
        {todos && todos.length > 0 && (
          <button
            onClick={() => setShowClearConfirm(true)}
            className="btn btn-danger active:scale-95 transition-transform"
            disabled={clearAllMutation.isPending}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Clear All
          </button>
        )}
      </div>

      <div className="card p-6">
        <form onSubmit={handleAddTodo} className="flex gap-3">
          <input
            type="text"
            value={newTodo}
            onChange={(e) => setNewTodo(e.target.value)}
            placeholder="Add a new todo..."
            className="input flex-1"
            disabled={addTodoMutation.isPending}
          />
          <button
            type="submit"
            disabled={!newTodo.trim() || addTodoMutation.isPending}
            className="btn btn-primary active:scale-95 transition-transform"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Todo
          </button>
        </form>
      </div>

      {todos && todos.length > 0 ? (
        <div className="space-y-4">
          {pendingTodos.length > 0 && (
            <div className="bg-white/80 p-6 rounded-lg border border-gray-200 shadow-lg">
              <h2 className="text-lg font-medium text-gray-900 mb-4">
                Pending ({pendingTodos.length})
              </h2>
              <div className="space-y-3">
                {pendingTodos.map((todo: Todo) => (
                  <div
                    key={todo.id}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200"
                  >
                    <div className="flex items-center space-x-3">
                      <button
                        onClick={() => handleToggleTodo(todo.id, todo.done)}
                        className="flex-shrink-0 w-5 h-5 border-2 border-gray-300 rounded hover:border-green-500 transition-colors"
                        disabled={updateTodoMutation.isPending}
                      >
                        {updateTodoMutation.isPending ? (
                          <div className="w-full h-full animate-spin rounded-full border-b border-gray-400"></div>
                        ) : null}
                      </button>
                      <span className="text-gray-900">{todo.item}</span>
                    </div>
                    <button
                      onClick={() => handleDeleteTodo(todo.id)}
                      className="text-red-600 hover:text-red-800 p-1"
                      disabled={deleteTodoMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {completedTodos.length > 0 && (
            <div className="bg-white/80 p-6 rounded-lg border border-gray-200 shadow-lg">
              <h2 className="text-lg font-medium text-gray-900 mb-4">
                Completed ({completedTodos.length})
              </h2>
              <div className="space-y-3">
                {completedTodos.map((todo: Todo) => (
                  <div
                    key={todo.id}
                    className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-200"
                  >
                    <div className="flex items-center space-x-3">
                      <button
                        onClick={() => handleToggleTodo(todo.id, todo.done)}
                        className="flex-shrink-0 w-5 h-5 bg-green-500 border-2 border-green-500 rounded flex items-center justify-center hover:bg-green-600 transition-colors"
                        disabled={updateTodoMutation.isPending}
                      >
                        <Check className="h-3 w-3 text-white" />
                      </button>
                      <span className="text-gray-600 line-through">{todo.item}</span>
                    </div>
                    <button
                      onClick={() => handleDeleteTodo(todo.id)}
                      className="text-red-600 hover:text-red-800 p-1"
                      disabled={deleteTodoMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="card p-12 text-center">
          <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No todos yet</h3>
          <p className="text-gray-600">Create your first todo to get started!</p>
        </div>
      )}

      {showClearConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
            <div className="flex items-center mb-4">
              <AlertCircle className="h-6 w-6 text-red-600 mr-3" />
              <h3 className="text-lg font-medium text-gray-900">Clear All Todos</h3>
            </div>
            <p className="text-gray-600 mb-6">
              Are you sure you want to clear all todos? This action cannot be undone.
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="btn btn-secondary active:scale-95 transition-transform"
                disabled={clearAllMutation.isPending}
              >
                Cancel
              </button>
              <button
                onClick={handleClearAll}
                className="btn btn-danger active:scale-95 transition-transform"
                disabled={clearAllMutation.isPending}
              >
                {clearAllMutation.isPending ? 'Clearing...' : 'Clear All'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TodosPage;
