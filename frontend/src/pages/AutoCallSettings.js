/**
 * Auto-Call Settings Page
 * 
 * Admin page for configuring Twilio auto-calls to managers
 */

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_URL } from '../App';
import { toast } from 'sonner';
import {
  Phone,
  Gear,
  Plus,
  Trash,
  TestTube,
  Check,
  X,
  Clock,
  ChartLine,
  Lightning,
  Warning,
  Play,
} from '@phosphor-icons/react';
import { motion } from 'framer-motion';

import { useLang } from '../i18n';

const AutoCallSettings = () => {
  const { t } = useLang();
  const [config, setConfig] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testPhone, setTestPhone] = useState('');
  const [newManagerPhone, setNewManagerPhone] = useState('');
  const [twilioCredentials, setTwilioCredentials] = useState({
    accountSid: '',
    authToken: '',
    phoneNumber: '',
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [configRes, analyticsRes, logsRes] = await Promise.all([
        axios.get(`${API_URL}/api/auto-call/config`),
        axios.get(`${API_URL}/api/auto-call/analytics`),
        axios.get(`${API_URL}/api/auto-call/logs?limit=20`),
      ]);
      setConfig(configRes.data);
      setAnalytics(analyticsRes.data);
      setLogs(logsRes.data.items || []);
    } catch (err) {
      toast.error(t('dataLoadError'));
    } finally {
      setLoading(false);
    }
  };

  const updateConfig = async (updates) => {
    setSaving(true);
    try {
      await axios.put(`${API_URL}/api/auto-call/config`, updates);
      toast.success(t('settingsSaved'));
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || t('actionError'));
    } finally {
      setSaving(false);
    }
  };

  const addManagerPhone = async () => {
    if (!newManagerPhone) return;
    try {
      await axios.post(`${API_URL}/api/auto-call/config/managers`, { phone: newManagerPhone });
      toast.success(t('phoneAdded'));
      setNewManagerPhone('');
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || t('actionError'));
    }
  };

  const removeManagerPhone = async (phone) => {
    try {
      await axios.post(`${API_URL}/api/auto-call/config/managers/remove`, { phone });
      toast.success(t('phoneRemoved'));
      fetchData();
    } catch (err) {
      toast.error(t('actionError'));
    }
  };

  const testCall = async () => {
    if (!testPhone) {
      toast.error(t('requiredFields') || 'Enter phone number');
      return;
    }
    try {
      const res = await axios.post(`${API_URL}/api/auto-call/test`, { phone: testPhone });
      toast.success(`${t('testCallInitiated')} SID: ${res.data.callSid}`);
    } catch (err) {
      toast.error(err.response?.data?.message || t('testCallError'));
    }
  };

  const saveTwilioCredentials = async () => {
    if (!twilioCredentials.accountSid || !twilioCredentials.authToken || !twilioCredentials.phoneNumber) {
      toast.error(t('requiredFields') || 'Fill all Twilio fields');
      return;
    }
    await updateConfig({
      twilioAccountSid: twilioCredentials.accountSid,
      twilioAuthToken: twilioCredentials.authToken,
      twilioPhoneNumber: twilioCredentials.phoneNumber,
    });
  };

  if (loading) {
    return (
      <div className="p-6 animate-pulse">
        <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
        <div className="grid grid-cols-3 gap-4">
          <div className="h-32 bg-gray-100 rounded-xl"></div>
          <div className="h-32 bg-gray-100 rounded-xl"></div>
          <div className="h-32 bg-gray-100 rounded-xl"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" data-testid="auto-call-settings">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Phone className="w-6 h-6 text-green-600" weight="fill" />
            Auto-Call Settings
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Налаштування автоматичних дзвінків менеджерам при HOT intent
          </p>
        </div>
        
        {/* Enable/Disable Toggle */}
        <button
          onClick={() => updateConfig({ enabled: !config?.enabled })}
          className={`px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors ${
            config?.enabled
              ? 'bg-green-100 text-green-700 hover:bg-green-200'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
          disabled={saving}
          data-testid="toggle-enabled"
        >
          {config?.enabled ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
          {config?.enabled ? 'Увімкнено' : 'Вимкнено'}
        </button>
      </div>

      {/* Analytics Cards */}
      {analytics && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            icon={Phone}
            label="Всього дзвінків"
            value={analytics.totalCalls}
            color="blue"
          />
          <StatCard
            icon={Check}
            label="Відповіли"
            value={`${analytics.answeredCalls} (${analytics.answerRate}%)`}
            color="green"
          />
          <StatCard
            icon={Clock}
            label="Сьогодні"
            value={analytics.todayCalls}
            color="purple"
          />
          <StatCard
            icon={Lightning}
            label="Менеджерів"
            value={analytics.managersCount}
            color="orange"
          />
        </div>
      )}

      {/* Configuration Status */}
      {!config?.twilioConfigured && (
        <div className="rounded-xl bg-yellow-50 border border-yellow-200 p-4 flex items-start gap-3">
          <Warning className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-yellow-800">Twilio не налаштовано</p>
            <p className="text-sm text-yellow-700">
              Додайте Twilio credentials нижче, щоб увімкнути автодзвінки
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Twilio Credentials */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Gear className="w-5 h-5 text-gray-600" />
            <h2 className="font-semibold text-gray-900">Twilio Credentials</h2>
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="text-sm text-gray-600 block mb-1">Account SID</label>
              <input
                type="text"
                placeholder="ACxxxxxxxxxxxxxxxx"
                value={twilioCredentials.accountSid}
                onChange={(e) => setTwilioCredentials({...twilioCredentials, accountSid: e.target.value})}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-gray-400 outline-none"
                data-testid="twilio-sid"
              />
            </div>
            <div>
              <label className="text-sm text-gray-600 block mb-1">Auth Token</label>
              <input
                type="password"
                placeholder="••••••••••••••••"
                value={twilioCredentials.authToken}
                onChange={(e) => setTwilioCredentials({...twilioCredentials, authToken: e.target.value})}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-gray-400 outline-none"
                data-testid="twilio-token"
              />
            </div>
            <div>
              <label className="text-sm text-gray-600 block mb-1">Phone Number</label>
              <input
                type="text"
                placeholder="+1234567890"
                value={twilioCredentials.phoneNumber}
                onChange={(e) => setTwilioCredentials({...twilioCredentials, phoneNumber: e.target.value})}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-gray-400 outline-none"
                data-testid="twilio-phone"
              />
            </div>
            <button
              onClick={saveTwilioCredentials}
              className="w-full px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
              disabled={saving}
            >
              {saving ? 'Зберігаю...' : 'Зберегти Twilio'}
            </button>
            
            {config?.twilioConfigured && (
              <p className="text-sm text-green-600 flex items-center gap-1">
                <Check className="w-4 h-4" />
                Twilio підключено: {config.twilioPhoneNumber}
              </p>
            )}
          </div>
        </div>

        {/* Manager Phones */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Phone className="w-5 h-5 text-gray-600" />
            <h2 className="font-semibold text-gray-900">Номери менеджерів</h2>
          </div>

          {/* Add phone */}
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              placeholder="+380501234567"
              value={newManagerPhone}
              onChange={(e) => setNewManagerPhone(e.target.value)}
              className="flex-1 px-3 py-2 rounded-lg border border-gray-200 focus:border-gray-400 outline-none"
              data-testid="new-manager-phone"
            />
            <button
              onClick={addManagerPhone}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-1"
            >
              <Plus className="w-4 h-4" />
              Додати
            </button>
          </div>

          {/* Phone list */}
          <div className="space-y-2">
            {config?.managerPhones?.length === 0 && (
              <p className="text-sm text-gray-500 text-center py-4">
                Немає номерів менеджерів
              </p>
            )}
            {config?.managerPhones?.map((phone, idx) => (
              <div key={phone} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <span className="font-mono text-gray-800">{phone}</span>
                <button
                  onClick={() => removeManagerPhone(phone)}
                  className="p-1.5 rounded hover:bg-red-100 text-gray-400 hover:text-red-600 transition-colors"
                >
                  <Trash className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Voice Message Template */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Play className="w-5 h-5 text-gray-600" />
            <h2 className="font-semibold text-gray-900">Голосове повідомлення</h2>
          </div>
          
          <textarea
            value={config?.voiceMessageTemplate || ''}
            onChange={(e) => updateConfig({ voiceMessageTemplate: e.target.value })}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-gray-400 outline-none h-24 resize-none"
            placeholder="HOT клієнт чекає дзвінка..."
          />
          <p className="text-xs text-gray-500 mt-2">
            Змінні: {'{vin}'}, {'{score}'}, {'{name}'}, {'{level}'}
          </p>
        </div>

        {/* Test Call */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <TestTube className="w-5 h-5 text-gray-600" />
            <h2 className="font-semibold text-gray-900">Тестовий дзвінок</h2>
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              placeholder="+380501234567"
              value={testPhone}
              onChange={(e) => setTestPhone(e.target.value)}
              className="flex-1 px-3 py-2 rounded-lg border border-gray-200 focus:border-gray-400 outline-none"
              data-testid="test-phone"
            />
            <button
              onClick={testCall}
              disabled={!config?.twilioConfigured}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors 
                         flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Phone className="w-4 h-4" />
              Тест
            </button>
          </div>
          {!config?.twilioConfigured && (
            <p className="text-xs text-gray-500 mt-2">
              Спочатку налаштуйте Twilio credentials
            </p>
          )}
        </div>
      </div>

      {/* Working Hours */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Clock className="w-5 h-5 text-gray-600" />
          <h2 className="font-semibold text-gray-900">Робочі години</h2>
        </div>
        
        <div className="flex items-center gap-4">
          <div>
            <label className="text-sm text-gray-600 block mb-1">Початок</label>
            <input
              type="time"
              value={config?.workingHours?.start || '09:00'}
              onChange={(e) => updateConfig({ workingHours: { ...config?.workingHours, start: e.target.value } })}
              className="px-3 py-2 rounded-lg border border-gray-200 focus:border-gray-400 outline-none"
            />
          </div>
          <div>
            <label className="text-sm text-gray-600 block mb-1">Кінець</label>
            <input
              type="time"
              value={config?.workingHours?.end || '21:00'}
              onChange={(e) => updateConfig({ workingHours: { ...config?.workingHours, end: e.target.value } })}
              className="px-3 py-2 rounded-lg border border-gray-200 focus:border-gray-400 outline-none"
            />
          </div>
          <p className="text-sm text-gray-500 self-end">
            Дзвінки здійснюються тільки в робочий час
          </p>
        </div>
      </div>

      {/* Recent Calls Log */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ChartLine className="w-5 h-5 text-gray-600" />
            <h2 className="font-semibold text-gray-900">Останні дзвінки</h2>
          </div>
          <button
            onClick={fetchData}
            className="text-sm text-blue-600 hover:underline"
          >
            Оновити
          </button>
        </div>

        {logs.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <Phone className="w-12 h-12 mx-auto text-gray-300 mb-2" />
            <p>Немає історії дзвінків</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {logs.map((log) => (
              <div key={log._id} className="p-4 hover:bg-gray-50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      log.status === 'answered' || log.status === 'completed' 
                        ? 'bg-green-100' 
                        : log.status === 'failed'
                        ? 'bg-red-100'
                        : 'bg-gray-100'
                    }`}>
                      <Phone className={`w-4 h-4 ${
                        log.status === 'answered' || log.status === 'completed' 
                          ? 'text-green-600' 
                          : log.status === 'failed'
                          ? 'text-red-600'
                          : 'text-gray-600'
                      }`} />
                    </div>
                    <div>
                      <p className="font-medium text-gray-800">{log.managerPhone}</p>
                      <p className="text-xs text-gray-500">
                        User: {log.userId?.substring(0, 12)}... | Score: {log.context?.intentScore}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      log.status === 'answered' || log.status === 'completed' 
                        ? 'bg-green-100 text-green-700'
                        : log.status === 'failed'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-gray-100 text-gray-700'
                    }`}>
                      {log.status}
                    </span>
                    <p className="text-xs text-gray-400 mt-1">
                      {new Date(log.createdAt).toLocaleString('uk-UA')}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const StatCard = ({ icon: Icon, label, value, color }) => {
  const colors = {
    blue: 'bg-blue-50 text-blue-600 border-blue-200',
    green: 'bg-green-50 text-green-600 border-green-200',
    purple: 'bg-purple-50 text-purple-600 border-purple-200',
    orange: 'bg-orange-50 text-orange-600 border-orange-200',
  };

  return (
    <div className={`rounded-xl border p-4 ${colors[color]}`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-5 h-5" weight="fill" />
        <span className="text-sm font-medium">{label}</span>
      </div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
};

export default AutoCallSettings;
