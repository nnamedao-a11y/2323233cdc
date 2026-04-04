/**
 * Integrations Admin Page
 * 
 * Керування всіма зовнішніми інтеграціями:
 * - Stripe, DocuSign, Ringostat, Telegram, Viber, Email, Shipping
 * - Test connections
 * - Enable/disable
 * - Health status
 */

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { useLang } from '../../i18n';
import {
  CreditCard,
  FileSignature,
  Phone,
  Send,
  MessageCircle,
  Mail,
  Ship,
  Brain,
  Check,
  X,
  AlertTriangle,
  RefreshCw,
  Settings,
  Eye,
  EyeOff,
  TestTube,
  Power,
  Activity,
} from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';

const PROVIDER_CONFIG = {
  stripe: {
    name: 'Stripe',
    icon: CreditCard,
    color: '#635BFF',
    fields: [
      { key: 'publishableKey', label: 'Publishable Key', type: 'text' },
      { key: 'secretKey', label: 'Secret Key', type: 'password' },
      { key: 'webhookSecret', label: 'Webhook Secret', type: 'password' },
    ],
    settings: [
      { key: 'currency', label: 'Currency', type: 'select', options: ['USD', 'EUR', 'UAH'] },
    ],
  },
  docusign: {
    name: 'DocuSign',
    icon: FileSignature,
    color: '#FFD700',
    fields: [
      { key: 'integrationKey', label: 'Integration Key (Client ID)', type: 'text' },
      { key: 'clientSecret', label: 'Client Secret', type: 'password' },
      { key: 'accountId', label: 'Account ID', type: 'text' },
      { key: 'userId', label: 'User ID (for JWT)', type: 'text' },
      { key: 'privateKey', label: 'RSA Private Key (for JWT)', type: 'textarea' },
      { key: 'hmacKey', label: 'Webhook HMAC Key', type: 'password' },
    ],
    settings: [
      { key: 'redirectUrl', label: 'OAuth Redirect URL', type: 'text' },
      { key: 'baseUrl', label: 'Base URL', type: 'select', options: ['https://demo.docusign.net', 'https://www.docusign.net'] },
    ],
  },
  ringostat: {
    name: 'Ringostat',
    icon: Phone,
    color: '#00D4AA',
    fields: [
      { key: 'apiKey', label: 'API Key', type: 'password' },
      { key: 'projectId', label: 'Project ID', type: 'text' },
    ],
    settings: [],
  },
  telegram: {
    name: 'Telegram',
    icon: Send,
    color: '#0088CC',
    fields: [
      { key: 'botToken', label: 'Bot Token', type: 'password' },
      { key: 'ownerChatId', label: 'Owner Chat ID', type: 'text' },
    ],
    settings: [],
  },
  viber: {
    name: 'Viber',
    icon: MessageCircle,
    color: '#7360F2',
    fields: [
      { key: 'token', label: 'API Token', type: 'password' },
    ],
    settings: [
      { key: 'senderName', label: 'Sender Name', type: 'text' },
    ],
  },
  twilio: {
    name: 'Twilio SMS',
    icon: MessageCircle,
    color: '#F22F46',
    fields: [
      { key: 'accountSid', label: 'Account SID', type: 'text' },
      { key: 'authToken', label: 'Auth Token', type: 'password' },
      { key: 'phoneNumber', label: 'Phone Number', type: 'text' },
    ],
    settings: [],
  },
  email: {
    name: 'Email (SMTP)',
    icon: Mail,
    color: '#EA4335',
    fields: [
      { key: 'smtpHost', label: 'SMTP Host', type: 'text' },
      { key: 'smtpPort', label: 'SMTP Port', type: 'text' },
      { key: 'smtpLogin', label: 'Login', type: 'text' },
      { key: 'smtpPassword', label: 'Password', type: 'password' },
    ],
    settings: [
      { key: 'senderEmail', label: 'Sender Email', type: 'text' },
    ],
  },
  shipping: {
    name: 'Shipping Tracker',
    icon: Ship,
    color: '#1E90FF',
    fields: [
      { key: 'apiKey', label: 'API Key', type: 'password' },
    ],
    settings: [
      { key: 'provider', label: 'Provider', type: 'select', options: ['manual', 'marinetraffic', 'shipsgo', 'searates'] },
      { key: 'pollingInterval', label: 'Polling Interval (min)', type: 'number' },
      { key: 'autoTrackingEnabled', label: 'Auto Tracking', type: 'toggle' },
    ],
  },
  openai: {
    name: 'OpenAI',
    icon: Brain,
    color: '#10A37F',
    fields: [
      { key: 'apiKey', label: 'API Key', type: 'password' },
    ],
    settings: [
      { key: 'model', label: 'Model', type: 'select', options: ['gpt-4o', 'gpt-4o-mini', 'gpt-3.5-turbo'] },
    ],
  },
  meta_ads: {
    name: 'Meta Ads API',
    icon: Activity,
    color: '#1877F2',
    fields: [
      { key: 'accessToken', label: 'Access Token', type: 'password' },
      { key: 'adAccountId', label: 'Ad Account ID', type: 'text' },
    ],
    settings: [],
  },
  facebook_capi: {
    name: 'Facebook Conversion API',
    icon: Activity,
    color: '#0866FF',
    fields: [
      { key: 'pixelId', label: 'Pixel ID', type: 'text' },
      { key: 'accessToken', label: 'Access Token', type: 'password' },
    ],
    settings: [],
  },
  one_c: {
    name: '1C Integration',
    icon: Activity,
    color: '#FFCC00',
    fields: [
      { key: 'apiUrl', label: 'API URL', type: 'text' },
      { key: 'apiKey', label: 'API Key', type: 'password' },
    ],
    settings: [
      { key: 'syncInterval', label: 'Sync Interval (min)', type: 'number' },
    ],
  },
  pna: {
    name: 'ПНЯ (Privat Nova Poshta)',
    icon: Ship,
    color: '#CD171A',
    fields: [
      { key: 'apiKey', label: 'API Key', type: 'password' },
      { key: 'senderId', label: 'Sender ID', type: 'text' },
    ],
    settings: [],
  },
  contract_template: {
    name: 'Шаблон Договору',
    icon: FileSignature,
    color: '#374151',
    fields: [
      { key: 'templateUrl', label: 'Template URL', type: 'text' },
      { key: 'templateId', label: 'Template ID (DocuSign)', type: 'text' },
    ],
    settings: [
      { key: 'autoGenerate', label: 'Auto Generate', type: 'toggle' },
    ],
  },
  car_vertical: {
    name: 'CarVertical (History)',
    icon: Activity,
    color: '#00C853',
    fields: [
      { key: 'apiKey', label: 'API Key', type: 'password' },
    ],
    settings: [],
    description: 'European vehicle history reports provider',
  },
  carfax: {
    name: 'Carfax (History)',
    icon: Activity,
    color: '#E53935',
    fields: [
      { key: 'apiKey', label: 'API Key', type: 'password' },
      { key: 'accountId', label: 'Account ID', type: 'text' },
    ],
    settings: [],
    description: 'US vehicle history reports provider',
  },
};

const STATUS_COLORS = {
  ok: 'bg-green-100 text-green-800',
  degraded: 'bg-yellow-100 text-yellow-800',
  failed: 'bg-red-100 text-red-800',
  unknown: 'bg-gray-100 text-gray-800',
  not_configured: 'bg-gray-100 text-gray-500',
};

const STATUS_ICONS = {
  ok: Check,
  degraded: AlertTriangle,
  failed: X,
  unknown: Activity,
  not_configured: Settings,
};

export default function IntegrationsPage() {
  const { t } = useLang();
  const [configs, setConfigs] = useState([]);
  const [health, setHealth] = useState({});
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(null);
  const [expandedProvider, setExpandedProvider] = useState(null);
  const [editMode, setEditMode] = useState({});
  const [editValues, setEditValues] = useState({});
  const [showPasswords, setShowPasswords] = useState({});

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [configsRes, healthRes] = await Promise.all([
        axios.get(`${API_URL}/api/admin/integrations`),
        axios.get(`${API_URL}/api/admin/integrations/health`),
      ]);
      setConfigs(configsRes.data);
      setHealth(healthRes.data);
    } catch (error) {
      toast.error('Failed to load integrations');
    } finally {
      setLoading(false);
    }
  };

  const testConnection = async (provider) => {
    setTesting(provider);
    try {
      const res = await axios.post(`${API_URL}/api/admin/integrations/${provider}/test`);
      if (res.data.success) {
        toast.success(`${PROVIDER_CONFIG[provider]?.name}: ${res.data.message}`);
      } else {
        toast.error(`${PROVIDER_CONFIG[provider]?.name}: ${res.data.message}`);
      }
      await loadData();
    } catch (error) {
      toast.error(`Test failed: ${error.message}`);
    } finally {
      setTesting(null);
    }
  };

  const toggleEnabled = async (provider, currentState) => {
    try {
      await axios.post(`${API_URL}/api/admin/integrations/${provider}/toggle`, {
        isEnabled: !currentState,
      });
      toast.success(`${PROVIDER_CONFIG[provider]?.name} ${!currentState ? 'enabled' : 'disabled'}`);
      await loadData();
    } catch (error) {
      toast.error('Failed to toggle integration');
    }
  };

  const saveConfig = async (provider) => {
    const values = editValues[provider];
    if (!values) return;

    try {
      await axios.patch(`${API_URL}/api/admin/integrations/${provider}`, {
        credentials: values.credentials,
        settings: values.settings,
        mode: values.mode,
      });
      toast.success(`${PROVIDER_CONFIG[provider]?.name} saved`);
      setEditMode({ ...editMode, [provider]: false });
      await loadData();
    } catch (error) {
      toast.error('Failed to save configuration');
    }
  };

  const getConfigByProvider = (provider) => {
    return configs.find(c => c.provider === provider) || {
      provider,
      credentials: {},
      settings: {},
      mode: 'disabled',
      isEnabled: false,
    };
  };

  const startEdit = (provider) => {
    const config = getConfigByProvider(provider);
    setEditValues({
      ...editValues,
      [provider]: {
        credentials: { ...config.credentials },
        settings: { ...config.settings },
        mode: config.mode,
      },
    });
    setEditMode({ ...editMode, [provider]: true });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('integrationsTitle')}</h1>
          <p className="text-gray-500 mt-1">{t('integrationsSubtitle')}</p>
        </div>
        <button
          onClick={loadData}
          className="flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-200"
        >
          <RefreshCw className="w-4 h-4" />
          {t('refresh')}
        </button>
      </div>

      {/* Health Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 mb-8">
        {Object.entries(health).map(([provider, data]) => {
          const config = PROVIDER_CONFIG[provider];
          if (!config) return null;
          const StatusIcon = STATUS_ICONS[data.status] || Activity;
          const Icon = config.icon;
          
          return (
            <div
              key={provider}
              className={`p-4 rounded-xl border ${data.isEnabled ? 'border-gray-200' : 'border-gray-100 opacity-60'}`}
            >
              <div className="flex items-center gap-2 mb-2">
                <Icon className="w-5 h-5" style={{ color: config.color }} />
                <span className="font-medium text-sm">{config.name}</span>
              </div>
              <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs ${STATUS_COLORS[data.status]}`}>
                <StatusIcon className="w-3 h-3" />
                {data.status}
              </div>
            </div>
          );
        })}
      </div>

      {/* Integration Cards */}
      <div className="space-y-4">
        {Object.entries(PROVIDER_CONFIG).map(([provider, config]) => {
          const integrationConfig = getConfigByProvider(provider);
          const healthData = health[provider] || {};
          const isExpanded = expandedProvider === provider;
          const isEditing = editMode[provider];
          const Icon = config.icon;
          const StatusIcon = STATUS_ICONS[healthData.status] || Activity;

          return (
            <div
              key={provider}
              className={`bg-white rounded-xl border ${integrationConfig.isEnabled ? 'border-gray-200' : 'border-gray-100'}`}
            >
              {/* Header */}
              <div
                className="flex items-center justify-between p-4 cursor-pointer"
                onClick={() => setExpandedProvider(isExpanded ? null : provider)}
              >
                <div className="flex items-center gap-4">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: `${config.color}20` }}
                  >
                    <Icon className="w-5 h-5" style={{ color: config.color }} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{config.name}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${STATUS_COLORS[healthData.status]}`}>
                        <StatusIcon className="w-3 h-3" />
                        {healthData.status}
                      </span>
                      {integrationConfig.mode && (
                        <span className={`px-2 py-0.5 rounded-full text-xs ${
                          integrationConfig.mode === 'live' ? 'bg-green-100 text-green-800' :
                          integrationConfig.mode === 'sandbox' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {integrationConfig.mode}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); testConnection(provider); }}
                    disabled={testing === provider}
                    className="p-2 rounded-lg hover:bg-gray-100 text-gray-600"
                    title="Test Connection"
                  >
                    {testing === provider ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <TestTube className="w-4 h-4" />
                    )}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleEnabled(provider, integrationConfig.isEnabled); }}
                    className={`p-2 rounded-lg ${integrationConfig.isEnabled ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'}`}
                    title={integrationConfig.isEnabled ? 'Disable' : 'Enable'}
                  >
                    <Power className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Expanded Content */}
              {isExpanded && (
                <div className="border-t border-gray-100 p-4">
                  <div className="flex justify-between items-center mb-4">
                    <h4 className="font-medium text-gray-700">Configuration</h4>
                    {!isEditing ? (
                      <button
                        onClick={() => startEdit(provider)}
                        className="text-sm text-blue-600 hover:text-blue-800"
                      >
                        Edit
                      </button>
                    ) : (
                      <div className="flex gap-2">
                        <button
                          onClick={() => setEditMode({ ...editMode, [provider]: false })}
                          className="text-sm text-gray-500 hover:text-gray-700"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => saveConfig(provider)}
                          className="text-sm text-green-600 hover:text-green-800 font-medium"
                        >
                          Save
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Credentials */}
                  <div className="space-y-3 mb-4">
                    <p className="text-xs font-medium text-gray-500 uppercase">Credentials</p>
                    {config.fields.map((field) => (
                      <div key={field.key} className="flex items-center gap-2">
                        <label className="w-32 text-sm text-gray-600">{field.label}</label>
                        {isEditing ? (
                          <div className="flex-1 flex items-center gap-2">
                            {field.type === 'textarea' ? (
                              <textarea
                                className="flex-1 px-3 py-2 border rounded-lg text-sm font-mono"
                                rows={3}
                                value={editValues[provider]?.credentials?.[field.key] || ''}
                                onChange={(e) => setEditValues({
                                  ...editValues,
                                  [provider]: {
                                    ...editValues[provider],
                                    credentials: {
                                      ...editValues[provider]?.credentials,
                                      [field.key]: e.target.value,
                                    },
                                  },
                                })}
                              />
                            ) : (
                              <input
                                type={field.type === 'password' && !showPasswords[`${provider}_${field.key}`] ? 'password' : 'text'}
                                className="flex-1 px-3 py-2 border rounded-lg text-sm font-mono"
                                value={editValues[provider]?.credentials?.[field.key] || ''}
                                onChange={(e) => setEditValues({
                                  ...editValues,
                                  [provider]: {
                                    ...editValues[provider],
                                    credentials: {
                                      ...editValues[provider]?.credentials,
                                      [field.key]: e.target.value,
                                    },
                                  },
                                })}
                              />
                            )}
                            {field.type === 'password' && (
                              <button
                                type="button"
                                onClick={() => setShowPasswords({
                                  ...showPasswords,
                                  [`${provider}_${field.key}`]: !showPasswords[`${provider}_${field.key}`],
                                })}
                                className="p-2 text-gray-400 hover:text-gray-600"
                              >
                                {showPasswords[`${provider}_${field.key}`] ? (
                                  <EyeOff className="w-4 h-4" />
                                ) : (
                                  <Eye className="w-4 h-4" />
                                )}
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="flex-1 text-sm font-mono text-gray-800 bg-gray-50 px-3 py-2 rounded-lg">
                            {integrationConfig.credentials?.[field.key] || '—'}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Settings */}
                  {config.settings.length > 0 && (
                    <div className="space-y-3 mb-4">
                      <p className="text-xs font-medium text-gray-500 uppercase">Settings</p>
                      {config.settings.map((setting) => (
                        <div key={setting.key} className="flex items-center gap-2">
                          <label className="w-32 text-sm text-gray-600">{setting.label}</label>
                          {isEditing ? (
                            setting.type === 'select' ? (
                              <select
                                className="flex-1 px-3 py-2 border rounded-lg text-sm"
                                value={editValues[provider]?.settings?.[setting.key] || ''}
                                onChange={(e) => setEditValues({
                                  ...editValues,
                                  [provider]: {
                                    ...editValues[provider],
                                    settings: {
                                      ...editValues[provider]?.settings,
                                      [setting.key]: e.target.value,
                                    },
                                  },
                                })}
                              >
                                {setting.options?.map((opt) => (
                                  <option key={opt} value={opt}>{opt}</option>
                                ))}
                              </select>
                            ) : setting.type === 'toggle' ? (
                              <button
                                type="button"
                                onClick={() => setEditValues({
                                  ...editValues,
                                  [provider]: {
                                    ...editValues[provider],
                                    settings: {
                                      ...editValues[provider]?.settings,
                                      [setting.key]: !editValues[provider]?.settings?.[setting.key],
                                    },
                                  },
                                })}
                                className={`w-12 h-6 rounded-full transition-colors ${
                                  editValues[provider]?.settings?.[setting.key] ? 'bg-green-500' : 'bg-gray-300'
                                }`}
                              >
                                <div className={`w-5 h-5 bg-white rounded-full shadow transform transition-transform ${
                                  editValues[provider]?.settings?.[setting.key] ? 'translate-x-6' : 'translate-x-0.5'
                                }`} />
                              </button>
                            ) : (
                              <input
                                type={setting.type || 'text'}
                                className="flex-1 px-3 py-2 border rounded-lg text-sm"
                                value={editValues[provider]?.settings?.[setting.key] || ''}
                                onChange={(e) => setEditValues({
                                  ...editValues,
                                  [provider]: {
                                    ...editValues[provider],
                                    settings: {
                                      ...editValues[provider]?.settings,
                                      [setting.key]: e.target.value,
                                    },
                                  },
                                })}
                              />
                            )
                          ) : (
                            <span className="flex-1 text-sm text-gray-800">
                              {String(integrationConfig.settings?.[setting.key] || '—')}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Mode Selection */}
                  {isEditing && (
                    <div className="flex items-center gap-2 mt-4 pt-4 border-t">
                      <label className="w-32 text-sm text-gray-600">Mode</label>
                      <select
                        className="px-3 py-2 border rounded-lg text-sm"
                        value={editValues[provider]?.mode || 'disabled'}
                        onChange={(e) => setEditValues({
                          ...editValues,
                          [provider]: {
                            ...editValues[provider],
                            mode: e.target.value,
                          },
                        })}
                      >
                        <option value="disabled">Disabled</option>
                        <option value="sandbox">Sandbox</option>
                        <option value="live">Live</option>
                      </select>
                    </div>
                  )}

                  {/* Last Check Info */}
                  {healthData.lastCheck && (
                    <div className="mt-4 pt-4 border-t text-xs text-gray-500">
                      Last checked: {new Date(healthData.lastCheck).toLocaleString()}
                      {healthData.error && (
                        <span className="block text-red-500 mt-1">Error: {healthData.error}</span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
