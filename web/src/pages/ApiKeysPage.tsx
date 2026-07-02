import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Key,
  Eye,
  EyeOff,
  TestTube,
  Save,
  Trash2,
  AlertCircle,
  CheckCircle,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiKeysAPI } from '../lib/api';
import Modal from '../components/Modal';

interface ApiKeyInfo {
  apiKey?: string;
  model?: string;
  apiUrl?: string;
  hasApiKey: boolean;
}

interface FormData {
  apiKey: string;
  model: string;
  apiUrl: string;
}

interface TestResult {
  success: boolean;
  message: string;
}

const ApiKeysPage = () => {
  const [showApiKey, setShowApiKey] = useState(false);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [modelSearch, setModelSearch] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [hasPassedTest, setHasPassedTest] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [formData, setFormData] = useState<FormData>({
    apiKey: '',
    model: '',
    apiUrl: 'https://api.openai.com/v1',
  });

  const filteredModels = React.useMemo(() => {
    if (!modelSearch) return availableModels;
    const searchTerm = modelSearch.toLowerCase();
    return availableModels.filter((model) => model.toLowerCase().includes(searchTerm));
  }, [availableModels, modelSearch]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleModelSelect = (model: string) => {
    setFormData((prev) => ({
      ...prev,
      model,
    }));
    setModelSearch('');
    setShowModelDropdown(false);
  };

  const handleModelInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setFormData((prev) => ({ ...prev, model: value }));
    setModelSearch(value);
    setHasPassedTest(false);
    setTestResult(null);
    setShowModelDropdown(true);

    if (availableModels.length === 0 && formData.apiKey) {
      fetchModels();
    }
  };

  const fetchModels = async () => {
    if (!formData.apiKey) return;

    setIsLoadingModels(true);
    try {
      const response = await apiKeysAPI.getModels({
        apiKey: formData.apiKey,
        apiUrl: formData.apiUrl,
      });

      if (response.data?.models?.length > 0) {
        setAvailableModels(response.data.models);
      } else {
        setAvailableModels([]);
      }
    } catch (error) {
      console.error('Error fetching models:', error);
      setAvailableModels([]);
    } finally {
      setIsLoadingModels(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (hasPassedTest) {
      updateApiKeyMutation.mutate({
        apiKey: formData.apiKey,
        model: formData.model,
        apiUrl: formData.apiUrl,
      });
      return;
    }

    try {
      const result = await testApiKeyMutation.mutateAsync({
        apiKey: formData.apiKey,
        model: formData.model,
        apiUrl: formData.apiUrl,
      });

      if (result.data?.success) {
        updateApiKeyMutation.mutate({
          apiKey: formData.apiKey,
          model: formData.model,
          apiUrl: formData.apiUrl,
        });
      }
    } catch (_error) {
      // ignore
    }
  };

  const handleEdit = () => {
    setIsEditing(true);
    setFormData({
      apiKey: apiKeyInfo?.apiKey || '',
      model: apiKeyInfo?.model || '',
      apiUrl: apiKeyInfo?.apiUrl || 'https://api.openai.com/v1',
    });
    setTestResult(null);
    setHasPassedTest(false);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setFormData({
      apiKey: apiKeyInfo?.apiKey || '',
      model: apiKeyInfo?.model || '',
      apiUrl: apiKeyInfo?.apiUrl || 'https://api.openai.com/v1',
    });
    setTestResult(null);
    setHasPassedTest(false);
  };

  const queryClient = useQueryClient();

  const { data: apiKeyInfo, isLoading } = useQuery<ApiKeyInfo>({
    queryKey: ['api-keys'],
    queryFn: () => apiKeysAPI.getApiKeys().then((res) => res.data as ApiKeyInfo),
  });

  useEffect(() => {
    if (apiKeyInfo) {
      setFormData({
        apiKey: apiKeyInfo.apiKey || '',
        model: apiKeyInfo.model || '',
        apiUrl: apiKeyInfo.apiUrl || 'https://api.openai.com/v1',
      });
    }
  }, [apiKeyInfo]);

  const updateApiKeyMutation = useMutation({
    mutationFn: (data: { apiKey?: string; model?: string; apiUrl?: string }) =>
      apiKeysAPI.updateApiKey(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
      toast.success('API key updated successfully');
      setIsEditing(false);
    },
    onError: (error: unknown) => {
      const errorMessage =
        error && typeof error === 'object' && 'response' in error
          ? (error as { response?: { data?: { error?: string } } })?.response?.data?.error
          : 'Failed to update API key';
      toast.error(errorMessage);
    },
  });
  const testApiKeyMutation = useMutation({
    mutationFn: (data: { apiKey: string; model?: string; apiUrl?: string }) =>
      apiKeysAPI.testApiKey(data),
    onSuccess: async (_, variables) => {
      setHasPassedTest(true);
      setTestResult({
        success: true,
        message: 'API key test successful!',
      });
      toast.success('API key test successful!');

      if (variables.apiKey) {
        try {
          setIsLoadingModels(true);
          const modelsResponse = await apiKeysAPI.getModels({
            apiKey: variables.apiKey,
            apiUrl: variables.apiUrl,
          });
          if (modelsResponse.data?.models?.length > 0) {
            setAvailableModels(modelsResponse.data.models);
          } else {
            setAvailableModels([]);
          }
        } catch (error) {
          console.error('Error fetching models:', error);
          setAvailableModels([]);
        } finally {
          setIsLoadingModels(false);
        }
      }
    },
    onError: (error: unknown) => {
      const errorMessage =
        error && typeof error === 'object' && 'response' in error
          ? (error as { response?: { data?: { error?: string | { message: string } } } })?.response
              ?.data?.error
          : undefined;
      const message =
        typeof errorMessage === 'object'
          ? errorMessage?.message
          : errorMessage || 'API key test failed';
      setHasPassedTest(false);
      setTestResult({ success: false, message });
      toast.error(message);
    },
  });

  const deleteApiKeyMutation = useMutation({
    mutationFn: () => apiKeysAPI.deleteApiKey(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
      toast.success('API key deleted successfully');
      setIsEditing(false);
      setHasPassedTest(false);
      setTestResult(null);
      setFormData({
        apiKey: '',
        model: '',
        apiUrl: 'https://api.openai.com/v1',
      });
    },
    onError: (error: unknown) => {
      const errorMessage =
        error && typeof error === 'object' && 'response' in error
          ? (error as { response?: { data?: { error?: string } } })?.response?.data?.error
          : 'Failed to delete API key';
      toast.error(errorMessage);
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="spinner h-5 w-5" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-faint">Configuration</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink">AI Keys</h1>
        </div>
        {apiKeyInfo?.hasApiKey && !isEditing && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleEdit}
              className="btn btn-secondary btn-sm"
            >
              <Key className="h-3.5 w-3.5" />
              Edit
            </button>
            <button
              onClick={() => deleteApiKeyMutation.mutate()}
              className="btn btn-ghost btn-sm"
              disabled={deleteApiKeyMutation.isPending}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Remove
            </button>
          </div>
        )}
      </div>

      {apiKeyInfo?.hasApiKey && !isEditing ? (
        <div className="overflow-hidden rounded-lg border border-line bg-surface">
          <div className="flex items-center gap-3 border-b border-line px-4 py-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-success-tint">
              <CheckCircle className="h-4 w-4 text-success" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-ink">AI assistant ready</p>
              <p className="text-xs text-muted">Configured and encrypted</p>
            </div>
          </div>
          <dl className="divide-y divide-line">
            {apiKeyInfo.model && (
              <div className="flex items-center justify-between px-4 py-2.5">
                <dt className="text-xs font-medium uppercase tracking-wider text-faint">Model</dt>
                <dd className="font-mono text-sm text-ink">{apiKeyInfo.model}</dd>
              </div>
            )}
            {apiKeyInfo.apiUrl && (
              <div className="flex items-center justify-between gap-3 px-4 py-2.5">
                <dt className="text-xs font-medium uppercase tracking-wider text-faint">
                  Endpoint
                </dt>
                <dd
                  className="truncate font-mono text-sm text-muted"
                  title={apiKeyInfo.apiUrl}
                >
                  {apiKeyInfo.apiUrl}
                </dd>
              </div>
            )}
          </dl>
        </div>
      ) : !isEditing ? (
        <div className="rounded-lg border border-dashed border-line bg-surface py-12 text-center">
          <Key className="mx-auto mb-3 h-8 w-8 text-faint" />
          <p className="text-sm font-medium text-ink">No API key configured</p>
          <p className="mt-0.5 text-xs text-muted">
            Bring your own key to unlock AI without limits.
          </p>
          <button
            onClick={() => setIsEditing(true)}
            className="btn btn-primary btn-sm mt-4"
          >
            <Key className="h-3.5 w-3.5" />
            Configure
          </button>
        </div>
      ) : null}

      <Modal
        open={isEditing}
        onClose={handleCancel}
        title={apiKeyInfo?.hasApiKey ? 'Update API key' : 'Configure API key'}
        closeDisabled={updateApiKeyMutation.isPending || testApiKeyMutation.isPending}
        size="md"
      >
        <form
          onSubmit={handleSubmit}
          className="space-y-4"
        >
          <p className="text-xs text-muted">
            <span className="text-danger">*</span> Test before saving to verify the key works.
          </p>

          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-faint">
              Provider *
            </label>
            <select
              value={formData.apiUrl}
              onChange={(e) => {
                const url = e.target.value;
                setFormData({ ...formData, apiUrl: url, model: '' });
                setAvailableModels([]);
                setHasPassedTest(false);
                setTestResult(null);
              }}
              className="input w-full"
            >
              <option value="https://api.openai.com/v1">OpenAI (api.openai.com/v1)</option>
              <option value="https://openrouter.ai/api/v1">
                OpenRouter (openrouter.ai/api/v1)
              </option>
              <option value="https://api.anthropic.com/v1">
                Anthropic Claude (api.anthropic.com/v1)
              </option>
              <option value="https://api.mistral.ai/v1">Mistral AI (api.mistral.ai/v1)</option>
              <option value="https://api.deepseek.com/v1">DeepSeek (api.deepseek.com/v1)</option>
              <option value="https://api.together.xyz/v1">Together AI (api.together.xyz/v1)</option>
              <option value="https://api.perplexity.ai/v1">
                Perplexity AI (api.perplexity.ai/v1)
              </option>
              <option value="https://generativelanguage.googleapis.com/v1beta">
                Google Gemini (generativelanguage.googleapis.com)
              </option>
              <option value="https://api.groq.com/openai/v1">Groq (api.groq.com/openai/v1)</option>
              <option value="https://api.lepton.ai/v1">Lepton AI (api.lepton.ai/v1)</option>
              <option value="https://api.deepinfra.com/v1/openai">
                DeepInfra (api.deepinfra.com/v1/openai)
              </option>
              <option value="https://api.x.ai/v1">xAI (api.x.ai/v1)</option>
              <option value="https://api.moonshot.ai/v1">Moonshot AI (api.moonshot.ai/v1)</option>
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-faint">
              API Key *
            </label>
            <div className="relative">
              <input
                type={showApiKey ? 'text' : 'password'}
                name="apiKey"
                value={formData.apiKey}
                onChange={(e) => {
                  handleInputChange(e);
                  setHasPassedTest(false);
                  setTestResult(null);
                }}
                placeholder="Enter your API key"
                className="input pr-10 w-full"
                required
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center"
              >
                {showApiKey ? (
                  <EyeOff className="h-4 w-4 text-faint" />
                ) : (
                  <Eye className="h-4 w-4 text-faint" />
                )}
              </button>
            </div>
          </div>

          <div className="relative">
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-faint">
              Model <span className="text-faint/60 normal-case">(optional)</span>
            </label>
            <div className="relative">
              <input
                type="text"
                name="model"
                value={formData.model}
                onFocus={() => setShowModelDropdown(true)}
                onChange={handleModelInputChange}
                onBlur={() => {
                  setTimeout(() => setShowModelDropdown(false), 200);
                }}
                placeholder="Select or type a model name"
                className="model-input input w-full pr-8"
              />
              {isLoadingModels && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <Loader2 className="h-4 w-4 animate-spin text-faint" />
                </div>
              )}
              {showModelDropdown && (availableModels.length > 0 || modelSearch) && (
                <div className="absolute z-10 mt-1 w-full rounded-md border border-line bg-surface shadow-md max-h-60 overflow-auto">
                  {filteredModels.length > 0 ? (
                    filteredModels.map((model: string) => (
                      <div
                        key={model}
                        className="px-3 py-2 text-sm text-ink hover:bg-surface-hover cursor-pointer"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleModelSelect(model);
                        }}
                      >
                        {model}
                      </div>
                    ))
                  ) : (
                    <div className="px-3 py-2 text-sm text-muted">No matching models</div>
                  )}
                </div>
              )}
              <p className="mt-1 text-xs text-faint">
                {availableModels.length > 0
                  ? `${availableModels.length} models found`
                  : 'Type to search or leave empty for default'}
              </p>
            </div>
          </div>

          {testResult && (
            <div
              className={`flex items-center gap-2 rounded-md p-3 text-sm ${
                testResult.success ? 'bg-success-tint text-success' : 'bg-danger-tint text-danger'
              }`}
            >
              {testResult.success ? (
                <CheckCircle className="h-4 w-4 flex-shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
              )}
              <span>{testResult.message}</span>
            </div>
          )}

          <div className="flex justify-end gap-2 border-t border-line pt-3">
            <button
              type="button"
              onClick={handleCancel}
              className="btn btn-secondary btn-sm"
              disabled={updateApiKeyMutation.isPending || testApiKeyMutation.isPending}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={
                !formData.apiKey.trim() ||
                updateApiKeyMutation.isPending ||
                testApiKeyMutation.isPending
              }
              className={`btn btn-sm ${hasPassedTest ? 'btn-primary' : 'btn-secondary'}`}
            >
              {testApiKeyMutation.isPending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Testing...
                </>
              ) : updateApiKeyMutation.isPending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Saving...
                </>
              ) : hasPassedTest ? (
                <>
                  <Save className="h-3.5 w-3.5" />
                  Save
                </>
              ) : (
                <>
                  <TestTube className="h-3.5 w-3.5" />
                  Test & Save
                </>
              )}
            </button>
          </div>
        </form>
      </Modal>

      <div className="rounded-lg border border-line bg-surface p-4">
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-faint">About</h2>
        <div className="space-y-2 text-xs text-muted">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-3 w-3 flex-shrink-0 text-accent" />
            <p>Keys are encrypted (AES-256-GCM) and used only for AI within the bot.</p>
          </div>
          <div className="flex items-start gap-2">
            <Key className="mt-0.5 h-3 w-3 flex-shrink-0 text-success" />
            <p>Supports OpenAI, OpenRouter, Anthropic, and OpenAI-compatible endpoints.</p>
          </div>
          <div className="flex items-start gap-2">
            <TestTube className="mt-0.5 h-3 w-3 flex-shrink-0 text-accent" />
            <p>Always test before saving to verify the key works.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ApiKeysPage;
