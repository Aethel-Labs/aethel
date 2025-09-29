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
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-discord-blurple"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">AI API Keys</h1>
        <p className="text-gray-600 dark:text-gray-300">
          Configure your custom AI API keys and endpoints for personalized AI interactions.
        </p>
      </div>

      <div className="bg-white/80 dark:bg-gray-800/90 p-6 rounded-lg border border-gray-200 dark:border-gray-700 shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">
            Current Configuration
          </h2>
          {apiKeyInfo?.hasApiKey && !isEditing && (
            <div className="flex flex-col sm:flex-row gap-2 sm:space-x-2 sm:gap-0">
              <button
                onClick={handleEdit}
                className="btn btn-secondary active:scale-95 transition-transform"
              >
                <Key className="h-4 w-4 mr-2" />
                Edit
              </button>
              <button
                onClick={() => deleteApiKeyMutation.mutate()}
                className="btn btn-danger active:scale-95 transition-transform"
                disabled={deleteApiKeyMutation.isPending}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Remove
              </button>
            </div>
          )}
        </div>

        {apiKeyInfo?.hasApiKey && !isEditing ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Status</span>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 border border-green-300 dark:border-green-700">
                <CheckCircle className="h-3 w-3 mr-1" />
                Configured
              </span>
            </div>
            {apiKeyInfo.model && (
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Model</span>
                <span className="text-sm text-gray-900 dark:text-gray-100">{apiKeyInfo.model}</span>
              </div>
            )}
            {apiKeyInfo.apiUrl && (
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  API Endpoint
                </span>
                <span className="text-sm text-gray-900 dark:text-gray-100 truncate max-w-64">
                  {apiKeyInfo.apiUrl}
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-8">
            <Key className="h-12 w-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
              No API Key Configured
            </h3>
            <p className="text-gray-600 dark:text-gray-300 mb-4">
              Set up your custom AI API key to use personalized models and endpoints.
            </p>
            <button
              onClick={() => setIsEditing(true)}
              className="btn btn-primary active:scale-95 transition-transform"
            >
              <Key className="h-4 w-4 mr-2" />
              Configure API Key
            </button>
          </div>
        )}
      </div>

      {isEditing && (
        <div className="bg-white/80 dark:bg-gray-800/90 p-6 rounded-lg border border-gray-200 dark:border-gray-700 shadow-lg">
          <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">
            {apiKeyInfo?.hasApiKey ? 'Update' : 'Configure'} API Key
          </h2>

          <form
            onSubmit={handleSubmit}
            className="space-y-4"
          >
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
                <span className="text-red-600 dark:text-red-400">*</span> You must test the API key
                before saving to ensure it works correctly.
              </p>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  AI Provider *
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
                  className="input dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 w-full"
                >
                  <option value="https://api.openai.com/v1">OpenAI (api.openai.com/v1)</option>
                  <option value="https://openrouter.ai/api/v1">
                    OpenRouter (openrouter.ai/api/v1)
                  </option>
                  <option value="https://api.anthropic.com/v1">
                    Anthropic Claude (api.anthropic.com/v1)
                  </option>
                  <option value="https://api.mistral.ai/v1">Mistral AI (api.mistral.ai/v1)</option>
                  <option value="https://api.deepseek.com/v1">
                    DeepSeek (api.deepseek.com/v1)
                  </option>
                  <option value="https://api.together.xyz/v1">
                    Together AI (api.together.xyz/v1)
                  </option>
                  <option value="https://api.perplexity.ai/v1">
                    Perplexity AI (api.perplexity.ai/v1)
                  </option>
                  <option value="https://generativelanguage.googleapis.com/v1beta">
                    Google Gemini (generativelanguage.googleapis.com)
                  </option>
                  <option value="https://api.groq.com/openai/v1">
                    Groq (api.groq.com/openai/v1)
                  </option>
                  <option value="https://api.lepton.ai/v1">Lepton AI (api.lepton.ai/v1)</option>
                  <option value="https://api.deepinfra.com/v1/openai">
                    DeepInfra (api.deepinfra.com/v1/openai)
                  </option>
                  <option value="https://api.x.ai/v1">xAI (api.x.ai/v1)</option>
                  <option value="https://api.moonshot.ai/v1">
                    Moonshot AI (api.moonshot.ai/v1)
                  </option>
                </select>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
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
                    className="input pr-10 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 dark:placeholder-gray-400 w-full"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  >
                    {showApiKey ? (
                      <EyeOff className="h-4 w-4 text-gray-400" />
                    ) : (
                      <Eye className="h-4 w-4 text-gray-400" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            <div className="relative">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Model (Optional)
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
                  className="model-input input dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 dark:placeholder-gray-400 w-full pr-8"
                />
                {isLoadingModels && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                  </div>
                )}
                {showModelDropdown && (availableModels.length > 0 || modelSearch) && (
                  <div className="absolute z-10 mt-1 w-full rounded-md bg-white dark:bg-gray-800 shadow-lg border border-gray-200 dark:border-gray-700 max-h-60 overflow-auto">
                    {filteredModels.length > 0 ? (
                      filteredModels.map((model: string) => (
                        <div
                          key={model}
                          className="px-4 py-2 text-sm text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            handleModelSelect(model);
                          }}
                        >
                          {model}
                        </div>
                      ))
                    ) : (
                      <div className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400">
                        No matching models found
                      </div>
                    )}
                  </div>
                )}
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                  {availableModels.length > 0
                    ? `Found ${availableModels.length} models`
                    : 'Type to search or leave empty for default'}
                </p>
              </div>
            </div>

            {testResult && (
              <div
                className={`p-3 rounded-lg flex items-center space-x-2 ${
                  testResult.success
                    ? 'bg-green-50 dark:bg-green-900/30 text-green-800 dark:text-green-300'
                    : 'bg-red-50 dark:bg-red-900/30 text-red-800 dark:text-red-300'
                }`}
              >
                {testResult.success ? (
                  <CheckCircle className="h-4 w-4" />
                ) : (
                  <AlertCircle className="h-4 w-4" />
                )}
                <span className="text-sm">{testResult.message}</span>
              </div>
            )}

            <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4">
              <button
                type="button"
                onClick={handleCancel}
                className="btn btn-secondary active:scale-95 transition-transform"
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
                className={`btn active:scale-95 transition-transform ${
                  hasPassedTest ? 'btn-primary' : 'btn-secondary'
                }`}
              >
                {testApiKeyMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Testing...
                  </>
                ) : updateApiKeyMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : hasPassedTest ? (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save
                  </>
                ) : (
                  <>
                    <TestTube className="h-4 w-4 mr-2" />
                    Test & Save
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white/60 dark:bg-gray-800/70 p-6 rounded-lg border border-gray-200 dark:border-gray-700 shadow-lg">
        <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">Information</h2>
        <div className="space-y-3 text-sm text-gray-600 dark:text-gray-300">
          <div className="flex items-start space-x-2">
            <AlertCircle className="h-4 w-4 text-blue-500 dark:text-blue-400 mt-0.5 flex-shrink-0" />
            <p>
              Your API key is encrypted and stored securely. It will only be used for AI
              interactions within the Discord bot.
            </p>
          </div>
          <div className="flex items-start space-x-2">
            <Key className="h-4 w-4 text-green-500 dark:text-green-400 mt-0.5 flex-shrink-0" />
            <p>
              Supported providers include OpenAI, OpenRouter, Anthropic, and any OpenAI-compatible
              API endpoints.
            </p>
          </div>
          <div className="flex items-start space-x-2">
            <TestTube className="h-4 w-4 text-purple-500 dark:text-purple-400 mt-0.5 flex-shrink-0" />
            <p>Use the test function to verify your API key works before saving.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ApiKeysPage;
