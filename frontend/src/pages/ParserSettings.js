/**
 * Parser Settings Page
 * 
 * Налаштування парсерів
 * Тільки для MASTER_ADMIN
 */

import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { useAuth, API_URL } from '../App';
import { useNavigate } from 'react-router-dom';
import { useLang } from '../i18n';
import {
  ArrowLeft,
  Gear,
  Clock,
  Shield,
  Database,
  CircleNotch,
  FloppyDisk,
  ToggleLeft,
  ToggleRight,
} from '@phosphor-icons/react';

const Toggle = ({ checked, onChange, label, description }) => (
  <div className="flex items-center justify-between p-4 bg-[#F4F4F5] rounded-xl">
    <div>
      <p className="font-medium text-[#18181B]">{label}</p>
      {description && <p className="text-sm text-[#71717A]">{description}</p>}
    </div>
    <button
      onClick={() => onChange(!checked)}
      className={`transition-colors ${checked ? 'text-green-500' : 'text-gray-300'}`}
    >
      {checked ? <ToggleRight size={32} weight="fill" /> : <ToggleLeft size={32} weight="fill" />}
    </button>
  </div>
);

const ParserSettings = () => {
  const { t } = useLang();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [settings, setSettings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);
  const [editSettings, setEditSettings] = useState({});

  const isMasterAdmin = ['master_admin', 'owner'].includes(user?.role);

  useEffect(() => {
    if (!isMasterAdmin) {
      navigate('/admin/parser');
      return;
    }
  }, [isMasterAdmin, navigate]);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await axios.get(`${API_URL}/api/ingestion/admin/settings`);
      setSettings(res.data || []);
      const initial = {};
      (res.data || []).forEach(s => {
        initial[s.source] = { ...s };
      });
      setEditSettings(initial);
    } catch (error) {
      toast.error('Помилка завантаження налаштувань');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleSave = async (source) => {
    setSaving(source);
    try {
      await axios.patch(`${API_URL}/api/ingestion/admin/settings/${source}`, editSettings[source]);
      toast.success(`Налаштування ${source.toUpperCase()} збережено`);
      fetchSettings();
    } catch (error) {
      toast.error('Помилка збереження');
    } finally {
      setSaving(null);
    }
  };

  const updateSetting = (source, key, value) => {
    setEditSettings(prev => ({
      ...prev,
      [source]: {
        ...prev[source],
        [key]: value,
      },
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <CircleNotch size={32} className="animate-spin text-[#18181B]" />
      </div>
    );
  }

  return (
    <div data-testid="parser-settings-page">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate('/admin/parser')}
          className="p-2 hover:bg-[#F4F4F5] rounded-lg transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-[#18181B]">{t('settingsTitle') || 'Parser Settings'}</h1>
          <p className="text-[#71717A]">{t('settingsDescription') || 'Налаштування конфігурації парсерів'}</p>
        </div>
      </div>

      {/* Settings Cards */}
      <div className="space-y-6">
        {settings.map((setting) => {
          const edit = editSettings[setting.source] || setting;
          return (
            <div key={setting.source} className="bg-white rounded-2xl border border-[#E4E4E7] p-4 sm:p-6" data-testid={`settings-card-${setting.source}`}>
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-[#18181B] rounded-xl flex items-center justify-center flex-shrink-0">
                    <Database size={20} className="text-white" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold uppercase">{setting.source}</h2>
                    <p className="text-sm text-[#71717A]">{t('parserConfig') || 'Конфігурація парсера'}</p>
                  </div>
                </div>
                <button
                  onClick={() => handleSave(setting.source)}
                  disabled={saving === setting.source}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 bg-[#18181B] text-white rounded-xl hover:bg-[#27272A] disabled:opacity-50"
                  data-testid={`save-${setting.source}`}
                >
                  {saving === setting.source ? (
                    <CircleNotch size={16} className="animate-spin" />
                  ) : (
                    <FloppyDisk size={16} />
                  )}
                  {t('save') || 'Зберегти'}
                </button>
              </div>

              {/* Main Toggle */}
              <div className="mb-6">
                <Toggle
                  checked={edit.enabled}
                  onChange={(v) => updateSetting(setting.source, 'enabled', v)}
                  label={t('parserEnabled')}
                  description={t('parserEnabledDesc')}
                />
              </div>

              {/* Timing Section */}
              <div className="mb-6">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-[#71717A] mb-3">
                  <Clock size={16} />
                  {t('timing')}
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-[#18181B] mb-1">{t('cronExpression')}</label>
                    <input
                      type="text"
                      value={edit.cronExpression || ''}
                      onChange={(e) => updateSetting(setting.source, 'cronExpression', e.target.value)}
                      className="w-full px-4 py-2.5 bg-white border border-[#E4E4E7] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#18181B] font-mono text-sm"
                      data-testid={`cron-${setting.source}`}
                    />
                    <p className="text-xs text-[#71717A] mt-1">{t('cronExample')} 0 */4 * * * {t('cronExampleText')}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-[#18181B] mb-1">{t('timeoutMs')}</label>
                      <input
                        type="number"
                        value={edit.timeoutMs || 30000}
                        onChange={(e) => updateSetting(setting.source, 'timeoutMs', parseInt(e.target.value))}
                        min={5000}
                        max={120000}
                        className="w-full px-4 py-2.5 bg-white border border-[#E4E4E7] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#18181B]"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[#18181B] mb-1">{t('maxRetries')}</label>
                      <input
                        type="number"
                        value={edit.maxRetries || 3}
                        onChange={(e) => updateSetting(setting.source, 'maxRetries', parseInt(e.target.value))}
                        min={1}
                        max={10}
                        className="w-full px-4 py-2.5 bg-white border border-[#E4E4E7] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#18181B]"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Scraping Section */}
              <div className="mb-6">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-[#71717A] mb-3">
                  <Gear size={16} />
                  {t('scraping')}
                </h3>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-[#18181B] mb-1">{t('maxPages')}</label>
                      <input
                        type="number"
                        value={edit.maxPages || 5}
                        onChange={(e) => updateSetting(setting.source, 'maxPages', parseInt(e.target.value))}
                        min={1}
                        max={50}
                        className="w-full px-4 py-2.5 bg-white border border-[#E4E4E7] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#18181B]"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[#18181B] mb-1">{t('scrollCount')}</label>
                      <input
                        type="number"
                        value={edit.scrollCount || 3}
                        onChange={(e) => updateSetting(setting.source, 'scrollCount', parseInt(e.target.value))}
                        min={1}
                        max={10}
                        className="w-full px-4 py-2.5 bg-white border border-[#E4E4E7] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#18181B]"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#18181B] mb-1">{t('waitTimeMs')}</label>
                    <input
                      type="number"
                      value={edit.waitTimeMs || 2000}
                      onChange={(e) => updateSetting(setting.source, 'waitTimeMs', parseInt(e.target.value))}
                      min={500}
                      max={10000}
                      className="w-full px-4 py-2.5 bg-white border border-[#E4E4E7] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#18181B]"
                    />
                  </div>
                </div>
              </div>

              {/* Anti-block Section */}
              <div className="mb-6">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-[#71717A] mb-3">
                  <Shield size={16} />
                  {t('antiBlock')}
                </h3>
                <div className="space-y-3">
                  <Toggle
                    checked={edit.useProxies}
                    onChange={(v) => updateSetting(setting.source, 'useProxies', v)}
                    label={t('useProxies')}
                    description={t('useProxiesDesc')}
                  />
                  <Toggle
                    checked={edit.useFingerprint}
                    onChange={(v) => updateSetting(setting.source, 'useFingerprint', v)}
                    label={t('httpFingerprint')}
                    description={t('httpFingerprintDesc')}
                  />
                  <Toggle
                    checked={edit.useCircuitBreaker}
                    onChange={(v) => updateSetting(setting.source, 'useCircuitBreaker', v)}
                    label={t('circuitBreaker')}
                    description={t('circuitBreakerDesc')}
                  />
                </div>
              </div>

              {/* Other Settings */}
              <div>
                <h3 className="flex items-center gap-2 text-sm font-semibold text-[#71717A] mb-3">
                  <Database size={16} />
                  {t('other')}
                </h3>
                <div className="space-y-3">
                  <Toggle
                    checked={edit.autoRestartOnFailure}
                    onChange={(v) => updateSetting(setting.source, 'autoRestartOnFailure', v)}
                    label={t('autoRestart')}
                    description={t('autoRestartDesc')}
                  />
                  <Toggle
                    checked={edit.saveRawPayloads}
                    onChange={(v) => updateSetting(setting.source, 'saveRawPayloads', v)}
                    label={t('saveRawData')}
                    description={t('saveRawDataDesc')}
                  />
                  <Toggle
                    checked={edit.enableAlerts}
                    onChange={(v) => updateSetting(setting.source, 'enableAlerts', v)}
                    label={t('notifications')}
                    description={t('notificationsDesc')}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ParserSettings;
