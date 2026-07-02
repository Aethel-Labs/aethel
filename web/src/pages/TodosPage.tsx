import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Check, Trash2, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { todosAPI } from '../lib/api';
import Modal from '../components/Modal';

interface Todo {
  id: number;
  item: string;
  done: boolean;
  created_at: string;
  completed_at?: string;
}

const relativeTime = (date: string) => {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
};

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
      toast.success('Todo added');
    },
    onError: () => toast.error('Failed to add todo'),
  });

  const updateTodoMutation = useMutation({
    mutationFn: ({ id, done }: { id: number; done: boolean }) => todosAPI.updateTodo(id, { done }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['todos'] }),
    onError: () => toast.error('Failed to update todo'),
  });

  const deleteTodoMutation = useMutation({
    mutationFn: (id: number) => todosAPI.deleteTodo(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['todos'] });
      toast.success('Todo deleted');
    },
    onError: () => toast.error('Failed to delete todo'),
  });

  const clearAllMutation = useMutation({
    mutationFn: () => todosAPI.clearTodos(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['todos'] });
      setShowClearConfirm(false);
      toast.success('All todos cleared');
    },
    onError: () => toast.error('Failed to clear todos'),
  });

  const handleAddTodo = (e: React.FormEvent) => {
    e.preventDefault();
    if (newTodo.trim()) addTodoMutation.mutate(newTodo.trim());
  };

  const completedTodos = todos?.filter((t: Todo) => t.done) || [];
  const pendingTodos = todos?.filter((t: Todo) => !t.done) || [];
  const progress = todos?.length ? Math.round((completedTodos.length / todos.length) * 100) : 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="spinner h-5 w-5" />
      </div>
    );
  }

  return (
    <div className="space-y-7">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-muted">Productivity</p>
          <h1 className="mt-1.5 text-3xl font-semibold tracking-tight text-ink">Todos</h1>
        </div>
        {todos && todos.length > 0 && (
          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 sm:flex">
              <div className="h-1.5 w-24 overflow-hidden rounded-full bg-line-strong">
                <div
                  className="h-full rounded-full bg-success transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="text-sm tabular-nums text-muted">
                {completedTodos.length}/{todos.length}
              </span>
            </div>
            <button
              onClick={() => setShowClearConfirm(true)}
              className="btn btn-ghost btn-sm"
              disabled={clearAllMutation.isPending}
            >
              <Trash2 className="h-4 w-4" />
              Clear all
            </button>
          </div>
        )}
      </div>

      <form
        onSubmit={handleAddTodo}
        className="flex gap-2"
      >
        <input
          type="text"
          value={newTodo}
          onChange={(e) => setNewTodo(e.target.value)}
          placeholder="Add a todo and press enter..."
          className="input flex-1"
          disabled={addTodoMutation.isPending}
          autoFocus
        />
        <button
          type="submit"
          disabled={!newTodo.trim() || addTodoMutation.isPending}
          className="btn btn-primary"
        >
          <Plus className="h-4 w-4" />
          Add
        </button>
      </form>

      {todos && todos.length > 0 ? (
        <div className="space-y-6">
          {pendingTodos.length > 0 && (
            <section>
              <h2 className="mb-2.5 text-sm font-medium text-faint">
                Pending · {pendingTodos.length}
              </h2>
              <div className="overflow-hidden rounded-lg border border-line bg-surface">
                {pendingTodos.map((todo: Todo, i: number) => (
                  <div
                    key={todo.id}
                    className={`group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-hover ${
                      i !== pendingTodos.length - 1 ? 'border-b border-line' : ''
                    }`}
                  >
                    <button
                      onClick={() => updateTodoMutation.mutate({ id: todo.id, done: !todo.done })}
                      className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border border-line-strong text-transparent transition-colors hover:border-success hover:text-success"
                      disabled={updateTodoMutation.isPending}
                      aria-label="Complete"
                    >
                      <Check className="h-3 w-3" />
                    </button>
                    <span className="flex-1 text-sm text-ink">{todo.item}</span>
                    <span className="flex-shrink-0 text-xs text-faint">
                      {relativeTime(todo.created_at)}
                    </span>
                    <button
                      onClick={() => deleteTodoMutation.mutate(todo.id)}
                      className="rounded p-1 text-faint opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
                      disabled={deleteTodoMutation.isPending}
                      aria-label="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {completedTodos.length > 0 && (
            <section>
              <h2 className="mb-2.5 text-sm font-medium text-faint">
                Completed · {completedTodos.length}
              </h2>
              <div className="overflow-hidden rounded-lg border border-line bg-surface">
                {completedTodos.map((todo: Todo, i: number) => (
                  <div
                    key={todo.id}
                    className={`group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-hover ${
                      i !== completedTodos.length - 1 ? 'border-b border-line' : ''
                    }`}
                  >
                    <button
                      onClick={() => updateTodoMutation.mutate({ id: todo.id, done: !todo.done })}
                      className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-success text-white transition-transform hover:scale-110"
                      disabled={updateTodoMutation.isPending}
                      aria-label="Undo"
                    >
                      <Check className="h-3 w-3" />
                    </button>
                    <span className="flex-1 text-sm text-muted line-through">{todo.item}</span>
                    <button
                      onClick={() => deleteTodoMutation.mutate(todo.id)}
                      className="rounded p-1 text-faint opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
                      disabled={deleteTodoMutation.isPending}
                      aria-label="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-line py-20">
          <CheckCircle2 className="mb-3 h-8 w-8 text-faint" />
          <p className="text-sm font-medium text-ink">No todos</p>
          <p className="mt-0.5 text-xs text-muted">Add one above to get started.</p>
        </div>
      )}

      <Modal
        open={showClearConfirm}
        onClose={() => setShowClearConfirm(false)}
        title="Clear all todos?"
        closeDisabled={clearAllMutation.isPending}
        size="sm"
      >
        <p className="text-sm text-muted">
          Permanently deletes all {todos?.length || 0} todos. Cannot be undone.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={() => setShowClearConfirm(false)}
            className="btn btn-secondary btn-sm"
            disabled={clearAllMutation.isPending}
          >
            Cancel
          </button>
          <button
            onClick={() => clearAllMutation.mutate()}
            className="btn btn-danger btn-sm"
            disabled={clearAllMutation.isPending}
          >
            {clearAllMutation.isPending ? 'Clearing...' : 'Clear all'}
          </button>
        </div>
      </Modal>
    </div>
  );
};

export default TodosPage;
