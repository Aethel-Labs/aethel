import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Key, Eye, EyeOff, TestTube, Save, Trash2, AlertCircle, CheckCircle } from 'lucide-react'
import { toast } from 'sonner'
import { apiKeysAPI } from '../lib/api'

const ApiKeysPage = () => {
  const [showApiKey, setShowApiKey] = useState(false)
  const [formData, setFormData] = useState({
    apiKey: '',
    model: '',
    apiUrl: ''
  })
  const [isEditing, setIsEditing] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const queryClient = useQueryClient()

  const { data: apiKeyInfo, isLoading } = useQuery({
    queryKey: ['api-keys'],
    queryFn: () => apiKeysAPI.getApiKeys().then(res => res.data),
  })

  const updateApiKeyMutation = useMutation({
    mutationFn: (data: { apiKey: string; model?: string; apiUrl?: string }) =>
      apiKeysAPI.updateApiKey(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] })
      setIsEditing(false)
      setFormData({ apiKey: '', model: '', apiUrl: '' })
      toast.success('API key updated successfully!')
    },
    onError: () => {
      toast.error('Failed to update API key')
    },
  })

  const deleteApiKeyMutation = useMutation({
    mutationFn: () => apiKeysAPI.deleteApiKey(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] })
      setFormData({ apiKey: '', model: '', apiUrl: '' })
      setIsEditing(false)
      toast.success('API key deleted successfully!')
    },
    onError: () => {
      toast.error('Failed to delete API key')
    },
  })

  const testApiKeyMutation = useMutation({
    mutationFn: (data: { apiKey: string; model?: string; apiUrl?: string }) =>
      apiKeysAPI.testApiKey(data),
    onSuccess: () => {
      setTestResult({ success: true, message: 'API key is valid and working!' })
      toast.success('API key test successful!')
    },
    onError: (error: any) => {
      const message = error.response?.data?.error || 'API key test failed'
      setTestResult({ success: false, message })
      toast.error(message)
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.apiKey.trim()) {
      toast.error('API key is required')
      return
    }
    updateApiKeyMutation.mutate({
      apiKey: formData.apiKey,
      model: formData.model || undefined,
      apiUrl: formData.apiUrl || undefined,
    })
  }

  const handleTest = () => {
    if (!formData.apiKey.trim()) {
      toast.error('API key is required for testing')
      return
    }
    setTestResult(null)
    testApiKeyMutation.mutate({
      apiKey: formData.apiKey,
      model: formData.model || undefined,
      apiUrl: formData.apiUrl || undefined,
    })
  }

  const handleEdit = () => {
    setIsEditing(true)
    setFormData({
      apiKey: '',
      model: apiKeyInfo?.model || '',
      apiUrl: apiKeyInfo?.apiUrl || ''
    })
    setTestResult(null)
  }

  const handleCancel = () => {
    setIsEditing(false)
    setFormData({ apiKey: '', model: '', apiUrl: '' })
    setTestResult(null)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-discord-blurple"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">AI API Keys</h1>
        <p className="text-gray-400">
          Configure your custom AI API keys and endpoints for personalized AI interactions.
        </p>
      </div>

      {/* Current Status */}
      <div className="bg-gray-900/50 p-6 rounded-lg border border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium text-white">Current Configuration</h2>
          {apiKeyInfo?.hasApiKey && !isEditing && (
            <div className="flex space-x-2">
              <button
                onClick={handleEdit}
                className="btn btn-secondary"
              >
                <Key className="h-4 w-4 mr-2" />
                Edit
              </button>
              <button
                onClick={() => deleteApiKeyMutation.mutate()}
                className="btn btn-danger"
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
              <span className="text-sm font-medium text-gray-400">Status</span>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-900/30 text-green-400 border border-green-700">
                <CheckCircle className="h-3 w-3 mr-1" />
                Configured
              </span>
            </div>
            {apiKeyInfo.model && (
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-400">Model</span>
                <span className="text-sm text-white">{apiKeyInfo.model}</span>
              </div>
            )}
            {apiKeyInfo.apiUrl && (
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-400">API Endpoint</span>
                <span className="text-sm text-white truncate max-w-64">
                  {apiKeyInfo.apiUrl}
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-8">
            <Key className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-white mb-2">
              No API Key Configured
            </h3>
            <p className="text-gray-400 mb-4">
              Set up your custom AI API key to use personalized models and endpoints.
            </p>
            <button
              onClick={() => setIsEditing(true)}
              className="btn btn-primary"
            >
              <Key className="h-4 w-4 mr-2" />
              Configure API Key
            </button>
          </div>
        )}
      </div>

      {/* Configuration Form */}
      {isEditing && (
        <div className="bg-gray-900/50 p-6 rounded-lg border border-gray-700">
          <h2 className="text-lg font-medium text-white mb-4">
            {apiKeyInfo?.hasApiKey ? 'Update' : 'Configure'} API Key
          </h2>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* API Key */}
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                API Key *
              </label>
              <div className="relative">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={formData.apiKey}
                  onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                  placeholder="Enter your API key"
                  className="input pr-10"
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

            {/* Model */}
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Model (Optional)
              </label>
              <input
                type="text"
                value={formData.model}
                onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                placeholder="e.g., gpt-4, claude-3-opus"
                className="input"
              />
              <p className="text-xs text-gray-400 mt-1">
                Leave empty to use the default model
              </p>
            </div>

            {/* API URL */}
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                API Endpoint URL (Optional)
              </label>
              <input
                type="url"
                value={formData.apiUrl}
                onChange={(e) => setFormData({ ...formData, apiUrl: e.target.value })}
                placeholder="https://api.openai.com/v1/chat/completions"
                className="input"
              />
              <p className="text-xs text-gray-400 mt-1">
                Enter the full API endpoint URL including the path (e.g., /chat/completions)
              </p>
            </div>

            {/* Test Result */}
            {testResult && (
              <div className={`p-3 rounded-lg flex items-center space-x-2 ${
                testResult.success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
              }`}>
                {testResult.success ? (
                  <CheckCircle className="h-4 w-4" />
                ) : (
                  <AlertCircle className="h-4 w-4" />
                )}
                <span className="text-sm">{testResult.message}</span>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-between pt-4">
              <button
                type="button"
                onClick={handleTest}
                disabled={!formData.apiKey.trim() || testApiKeyMutation.isPending}
                className="btn btn-secondary"
              >
                <TestTube className="h-4 w-4 mr-2" />
                {testApiKeyMutation.isPending ? 'Testing...' : 'Test API Key'}
              </button>
              
              <div className="flex space-x-3">
                <button
                  type="button"
                  onClick={handleCancel}
                  className="btn btn-secondary"
                  disabled={updateApiKeyMutation.isPending}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!formData.apiKey.trim() || updateApiKeyMutation.isPending}
                  className="btn btn-primary"
                >
                  <Save className="h-4 w-4 mr-2" />
                  {updateApiKeyMutation.isPending ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Information */}
      <div className="bg-gray-800/50 p-6 rounded-lg border border-gray-700">
        <h2 className="text-lg font-medium text-white mb-4">Information</h2>
        <div className="space-y-3 text-sm text-gray-400">
          <div className="flex items-start space-x-2">
            <AlertCircle className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
            <p>
              Your API key is encrypted and stored securely. It will only be used for AI interactions within the Discord bot.
            </p>
          </div>
          <div className="flex items-start space-x-2">
            <Key className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
            <p>
              Supported providers include OpenAI, Anthropic, and any OpenAI-compatible API endpoints.
            </p>
          </div>
          <div className="flex items-start space-x-2">
            <TestTube className="h-4 w-4 text-purple-500 mt-0.5 flex-shrink-0" />
            <p>
              Use the test function to verify your API key works before saving.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ApiKeysPage