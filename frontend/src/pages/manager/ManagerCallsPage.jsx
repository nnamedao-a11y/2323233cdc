/**
 * Manager Calls Page
 * 
 * /manager/calls
 * 
 * Features:
 * - List of calls (today / week)
 * - Status indicators
 * - Add notes / outcome
 * - Follow-up reminders
 */

import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useLang } from '../../i18n';
import { 
  Phone, 
  PhoneIncoming,
  PhoneOutgoing,
  Clock, 
  CheckCircle, 
  Warning,
  X,
  NotePencil,
  ArrowClockwise,
  User,
  CalendarBlank,
  Timer,
  Play,
  Waveform
} from '@phosphor-icons/react';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';

// Status Badge
const StatusBadge = ({ status }) => {
  const config = {
    started: { color: 'blue', icon: Play, label: 'В процесі' },
    answered: { color: 'emerald', icon: Phone, label: 'Відповів' },
    completed: { color: 'emerald', icon: CheckCircle, label: 'Завершено' },
    no_answer: { color: 'amber', icon: X, label: 'Немає відповіді' },
    busy: { color: 'red', icon: X, label: 'Зайнято' },
    failed: { color: 'red', icon: Warning, label: 'Помилка' },
  };
  const { color, icon: Icon, label } = config[status] || config.completed;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-${color}-100 text-${color}-700`}>
      <Icon size={12} />
      {label}
    </span>
  );
};

// Format duration
const formatDuration = (seconds) => {
  if (!seconds) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

// Call Card Component
const CallCard = ({ call, onUpdate, onOpenNotes }) => {
  const isInbound = call.direction === 'inbound';
  const phone = call.callerPhone || call.receiverPhone;
  
  return (
    <div 
      className={`bg-white rounded-xl border p-4 hover:shadow-md transition-all
        ${call.needsFollowUp && !call.isProcessed ? 'border-amber-300 bg-amber-50/50' : 'border-zinc-200'}`}
      data-testid={`call-card-${call.id}`}
    >
      <div className="flex items-start justify-between">
        {/* Left: Call Info */}
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-xl ${isInbound ? 'bg-blue-100' : 'bg-emerald-100'}`}>
            {isInbound ? (
              <PhoneIncoming size={20} className="text-blue-600" />
            ) : (
              <PhoneOutgoing size={20} className="text-emerald-600" />
            )}
          </div>
          
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono font-medium">{phone}</span>
              {call.customerName && (
                <span className="text-zinc-500">• {call.customerName}</span>
              )}
            </div>
            
            <div className="flex items-center gap-3 text-sm text-zinc-500 mt-1">
              <span className="flex items-center gap-1">
                <Clock size={14} />
                {new Date(call.startedAt).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}
              </span>
              <span className="flex items-center gap-1">
                <Timer size={14} />
                {formatDuration(call.talkTime || call.duration)}
              </span>
              {call.hasRecording && (
                <button 
                  className="flex items-center gap-1 text-blue-600 hover:text-blue-700"
                  onClick={() => window.open(call.recordingUrl, '_blank')}
                >
                  <Waveform size={14} />
                  Запис
                </button>
              )}
            </div>

            {call.leadId && (
              <div className="flex items-center gap-1 text-xs text-zinc-400 mt-1">
                <User size={12} />
                Lead: {call.leadId.slice(0, 8)}...
              </div>
            )}

            {call.note && (
              <div className="mt-2 p-2 bg-zinc-50 rounded-lg text-sm text-zinc-600">
                {call.note}
              </div>
            )}
          </div>
        </div>

        {/* Right: Status & Actions */}
        <div className="flex flex-col items-end gap-2">
          <StatusBadge status={call.status} />
          
          <button
            onClick={() => onOpenNotes(call)}
            className="flex items-center gap-1 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100 rounded-lg"
            data-testid={`add-note-${call.id}`}
          >
            <NotePencil size={14} />
            {call.note ? 'Редагувати' : 'Нотатка'}
          </button>

          {call.needsFollowUp && !call.isProcessed && (
            <button
              onClick={() => onUpdate(call.id, { isProcessed: true })}
              className="px-2 py-1 text-xs bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200"
            >
              Оброблено
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// Note Modal
const NoteModal = ({ call, onClose, onSave }) => {
  const [note, setNote] = useState(call.note || '');
  const [outcome, setOutcome] = useState(call.outcome || '');
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    setLoading(true);
    try {
      await onSave(call.id, { note, outcome });
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-bold mb-4">Нотатка до дзвінка</h3>
        <p className="text-sm text-zinc-500 mb-4">{call.callerPhone || call.receiverPhone}</p>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Результат</label>
            <select
              value={outcome}
              onChange={(e) => setOutcome(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
            >
              <option value="">Оберіть...</option>
              <option value="interested">Зацікавлений</option>
              <option value="thinking">Думає</option>
              <option value="callback">Передзвонити</option>
              <option value="not_interested">Не зацікавлений</option>
              <option value="wrong_number">Невірний номер</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Нотатка</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Додайте коментар..."
              rows={4}
              className="w-full px-3 py-2 border rounded-lg"
            />
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 px-4 py-2 border rounded-lg">
            Скасувати
          </button>
          <button 
            onClick={handleSave}
            disabled={loading}
            className="flex-1 px-4 py-2 bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 disabled:opacity-50"
          >
            {loading ? 'Збереження...' : 'Зберегти'}
          </button>
        </div>
      </div>
    </div>
  );
};

// Main Component
export default function ManagerCallsPage() {
  const [calls, setCalls] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('7'); // days
  const [noteModal, setNoteModal] = useState(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [callsRes, analyticsRes] = await Promise.all([
        axios.get(`${API_URL}/api/calls/board?period=${period}`),
        axios.get(`${API_URL}/api/calls/analytics?period=${period}`),
      ]);
      setCalls(Array.isArray(callsRes.data) ? callsRes.data : []);
      setAnalytics(analyticsRes.data);
    } catch (err) {
      console.error('Failed to load calls:', err);
      toast.error('Помилка завантаження');
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleUpdateCall = async (callId, updates) => {
    try {
      await axios.patch(`${API_URL}/api/calls/${callId}`, updates);
      toast.success('Оновлено');
      loadData();
    } catch (err) {
      toast.error('Помилка оновлення');
    }
  };

  // Group calls by date
  const groupedCalls = calls.reduce((acc, call) => {
    const date = new Date(call.startedAt).toLocaleDateString('uk-UA');
    if (!acc[date]) acc[date] = [];
    acc[date].push(call);
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-zinc-900 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="manager-calls-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-blue-100">
            <Phone size={24} weight="fill" className="text-blue-700" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-zinc-900">Мої дзвінки</h1>
            <p className="text-zinc-500">Історія та статистика</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="px-3 py-2 border rounded-lg text-sm"
          >
            <option value="1">Сьогодні</option>
            <option value="7">7 днів</option>
            <option value="30">30 днів</option>
          </select>
          <button
            onClick={loadData}
            className="p-2 rounded-xl hover:bg-zinc-100 transition-colors"
          >
            <ArrowClockwise size={20} className="text-zinc-600" />
          </button>
        </div>
      </div>

      {/* Analytics Cards */}
      {analytics && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="bg-white rounded-xl p-4 border">
            <p className="text-2xl font-bold">{analytics.totalCalls}</p>
            <p className="text-sm text-zinc-500">Всього дзвінків</p>
          </div>
          <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-200">
            <p className="text-2xl font-bold text-emerald-700">{analytics.answeredCalls}</p>
            <p className="text-sm text-emerald-600">Відповіли</p>
          </div>
          <div className="bg-amber-50 rounded-xl p-4 border border-amber-200">
            <p className="text-2xl font-bold text-amber-700">{analytics.noAnswerCalls}</p>
            <p className="text-sm text-amber-600">Не відповіли</p>
          </div>
          <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
            <p className="text-2xl font-bold text-blue-700">{analytics.answerRate}%</p>
            <p className="text-sm text-blue-600">Відсоток відповіді</p>
          </div>
          <div className="bg-zinc-50 rounded-xl p-4 border">
            <p className="text-2xl font-bold">{formatDuration(analytics.avgTalkTime)}</p>
            <p className="text-sm text-zinc-500">Сер. тривалість</p>
          </div>
        </div>
      )}

      {/* Calls List */}
      {calls.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border">
          <Phone size={48} className="mx-auto mb-4 text-zinc-300" />
          <h3 className="text-lg font-medium text-zinc-700">Немає дзвінків</h3>
          <p className="text-zinc-500">За обраний період дзвінків не знайдено</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedCalls).map(([date, dayCalls]) => (
            <div key={date}>
              <div className="flex items-center gap-2 mb-3">
                <CalendarBlank size={16} className="text-zinc-400" />
                <h3 className="text-sm font-medium text-zinc-500">{date}</h3>
                <span className="text-xs text-zinc-400">({dayCalls.length} дзв.)</span>
              </div>
              <div className="space-y-2">
                {dayCalls.map(call => (
                  <CallCard
                    key={call.id}
                    call={call}
                    onUpdate={handleUpdateCall}
                    onOpenNotes={setNoteModal}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Note Modal */}
      {noteModal && (
        <NoteModal
          call={noteModal}
          onClose={() => setNoteModal(null)}
          onSave={handleUpdateCall}
        />
      )}
    </div>
  );
}
