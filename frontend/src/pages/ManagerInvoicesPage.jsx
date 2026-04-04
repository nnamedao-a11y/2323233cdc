/**
 * Manager Invoices Page
 * 
 * /manager/invoices (or in Deals page)
 * 
 * Manager can create, send, and manage invoices for customers
 */

import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { 
  Receipt, 
  Plus, 
  PaperPlaneTilt, 
  CheckCircle, 
  Clock,
  Warning,
  CurrencyDollar,
  X,
  User,
  FileText,
  CalendarBlank,
  MagnifyingGlass,
  Funnel,
  ArrowsClockwise
} from '@phosphor-icons/react';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';

// Invoice Types
const INVOICE_TYPES = [
  { value: 'deposit', label: 'Депозит', icon: '💰' },
  { value: 'lot_payment', label: 'Оплата лоту', icon: '🚗' },
  { value: 'auction_fee', label: 'Комісія аукціону', icon: '🔨' },
  { value: 'logistics', label: 'Логістика', icon: '🚢' },
  { value: 'customs', label: 'Митниця', icon: '📋' },
  { value: 'delivery', label: 'Доставка', icon: '🚚' },
  { value: 'service_fee', label: 'Сервісний збір', icon: '⚙️' },
  { value: 'other', label: 'Інше', icon: '📄' },
];

// Status Badge
const StatusBadge = ({ status }) => {
  const config = {
    draft: { color: 'zinc', icon: FileText, label: 'Чернетка' },
    sent: { color: 'blue', icon: PaperPlaneTilt, label: 'Надіслано' },
    pending: { color: 'amber', icon: Clock, label: 'Очікує оплати' },
    paid: { color: 'emerald', icon: CheckCircle, label: 'Оплачено' },
    overdue: { color: 'red', icon: Warning, label: 'Прострочено' },
    cancelled: { color: 'zinc', icon: X, label: 'Скасовано' },
    expired: { color: 'red', icon: Warning, label: 'Термін вийшов' },
  };
  const { color, icon: Icon, label } = config[status] || config.draft;
  
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-${color}-100 text-${color}-700`}>
      <Icon size={12} weight="bold" />
      {label}
    </span>
  );
};

// Create Invoice Modal
const CreateInvoiceModal = ({ isOpen, onClose, onCreated, deals, customers }) => {
  const [form, setForm] = useState({
    dealId: '',
    userId: '',
    type: 'deposit',
    title: '',
    description: '',
    amount: '',
    currency: 'USD',
    dueDate: '',
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!form.dealId || !form.userId || !form.amount || !form.title) {
      toast.error('Заповніть всі обов\'язкові поля');
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(
        `${API_URL}/api/invoices/create`,
        {
          ...form,
          amount: parseFloat(form.amount),
          dueDate: form.dueDate ? new Date(form.dueDate) : undefined,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      toast.success('Рахунок створено');
      onCreated(response.data);
      onClose();
      setForm({
        dealId: '',
        userId: '',
        type: 'deposit',
        title: '',
        description: '',
        amount: '',
        currency: 'USD',
        dueDate: '',
      });
    } catch (error) {
      console.error('Error creating invoice:', error);
      toast.error(error.response?.data?.message || 'Помилка створення рахунку');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" data-testid="create-invoice-modal">
        <div className="p-6 border-b border-zinc-200">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-zinc-900">Новий рахунок</h2>
            <button onClick={onClose} className="p-2 hover:bg-zinc-100 rounded-lg">
              <X size={20} />
            </button>
          </div>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Deal Selection */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Угода *</label>
            <select
              value={form.dealId}
              onChange={(e) => setForm({ ...form, dealId: e.target.value })}
              className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              data-testid="invoice-deal-select"
            >
              <option value="">Оберіть угоду</option>
              {deals?.map(deal => (
                <option key={deal.id} value={deal.id}>
                  {deal.title || deal.vehicle?.title || `Угода #${deal.id.slice(0, 8)}`}
                </option>
              ))}
            </select>
          </div>

          {/* Customer Selection */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Клієнт *</label>
            <select
              value={form.userId}
              onChange={(e) => setForm({ ...form, userId: e.target.value })}
              className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              data-testid="invoice-customer-select"
            >
              <option value="">Оберіть клієнта</option>
              {customers?.map(customer => (
                <option key={customer.id} value={customer.id}>
                  {customer.firstName} {customer.lastName} ({customer.email})
                </option>
              ))}
            </select>
          </div>

          {/* Invoice Type */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Тип рахунку *</label>
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
              className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              data-testid="invoice-type-select"
            >
              {INVOICE_TYPES.map(type => (
                <option key={type.value} value={type.value}>
                  {type.icon} {type.label}
                </option>
              ))}
            </select>
          </div>

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Назва *</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Напр: Депозит за BMW X5"
              className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              data-testid="invoice-title-input"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Опис</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Додаткова інформація..."
              rows={2}
              className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              data-testid="invoice-description-input"
            />
          </div>

          {/* Amount */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Сума *</label>
              <div className="relative">
                <CurrencyDollar size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  placeholder="0.00"
                  className="w-full pl-9 pr-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  data-testid="invoice-amount-input"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Валюта</label>
              <select
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
                className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="UAH">UAH</option>
              </select>
            </div>
          </div>

          {/* Due Date */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Термін оплати</label>
            <div className="relative">
              <CalendarBlank size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                className="w-full pl-9 pr-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                data-testid="invoice-due-date-input"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-zinc-300 rounded-lg hover:bg-zinc-50 transition-colors"
            >
              Скасувати
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              data-testid="create-invoice-submit"
            >
              {loading ? (
                <ArrowsClockwise size={18} className="animate-spin" />
              ) : (
                <Plus size={18} />
              )}
              Створити
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Invoice Row
const InvoiceRow = ({ invoice, onSend, onCancel, onMarkPaid }) => {
  const canSend = invoice.status === 'draft';
  const canCancel = ['draft', 'sent', 'pending'].includes(invoice.status);
  const canMarkPaid = ['sent', 'pending', 'overdue'].includes(invoice.status);
  
  return (
    <tr className="hover:bg-zinc-50" data-testid={`invoice-row-${invoice.id}`}>
      <td className="px-4 py-3">
        <div>
          <div className="font-medium text-zinc-900">{invoice.title}</div>
          <div className="text-sm text-zinc-500">{invoice.id.slice(0, 8)}</div>
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="text-sm">
          <div className="font-medium text-zinc-700">{invoice.customerName || 'Невідомий'}</div>
          <div className="text-zinc-500">{invoice.customerEmail}</div>
        </div>
      </td>
      <td className="px-4 py-3">
        <span className="text-sm text-zinc-600 capitalize">
          {INVOICE_TYPES.find(t => t.value === invoice.type)?.label || invoice.type}
        </span>
      </td>
      <td className="px-4 py-3">
        <div className="font-bold text-zinc-900">
          ${invoice.amount?.toLocaleString()}
          <span className="text-xs font-normal text-zinc-500 ml-1">{invoice.currency}</span>
        </div>
      </td>
      <td className="px-4 py-3">
        <StatusBadge status={invoice.status} />
      </td>
      <td className="px-4 py-3 text-sm text-zinc-500">
        {new Date(invoice.createdAt).toLocaleDateString('uk-UA')}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          {canSend && (
            <button
              onClick={() => onSend(invoice)}
              className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              title="Надіслати клієнту"
              data-testid={`send-invoice-${invoice.id}`}
            >
              <PaperPlaneTilt size={18} />
            </button>
          )}
          {canMarkPaid && (
            <button
              onClick={() => onMarkPaid(invoice)}
              className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
              title="Позначити оплаченим"
              data-testid={`mark-paid-${invoice.id}`}
            >
              <CheckCircle size={18} />
            </button>
          )}
          {canCancel && (
            <button
              onClick={() => onCancel(invoice)}
              className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              title="Скасувати"
              data-testid={`cancel-invoice-${invoice.id}`}
            >
              <X size={18} />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
};

// Main Component
const ManagerInvoicesPage = () => {
  const [invoices, setInvoices] = useState([]);
  const [deals, setDeals] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [analytics, setAnalytics] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      
      const [invoicesRes, dealsRes, customersRes, analyticsRes] = await Promise.all([
        axios.get(`${API_URL}/api/invoices/manager/my`, { headers }),
        axios.get(`${API_URL}/api/deals`, { headers }),
        axios.get(`${API_URL}/api/customers`, { headers }),
        axios.get(`${API_URL}/api/invoices/analytics`, { headers }),
      ]);
      
      setInvoices(invoicesRes.data || []);
      setDeals(dealsRes.data || []);
      setCustomers(customersRes.data || []);
      setAnalytics(analyticsRes.data);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Помилка завантаження даних');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSend = async (invoice) => {
    try {
      const token = localStorage.getItem('token');
      await axios.patch(
        `${API_URL}/api/invoices/${invoice.id}/send`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success('Рахунок надіслано клієнту');
      fetchData();
    } catch (error) {
      console.error('Error sending invoice:', error);
      toast.error('Помилка відправки рахунку');
    }
  };

  const handleCancel = async (invoice) => {
    if (!window.confirm('Скасувати цей рахунок?')) return;
    
    try {
      const token = localStorage.getItem('token');
      await axios.patch(
        `${API_URL}/api/invoices/${invoice.id}/cancel`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success('Рахунок скасовано');
      fetchData();
    } catch (error) {
      console.error('Error cancelling invoice:', error);
      toast.error('Помилка скасування рахунку');
    }
  };

  const handleMarkPaid = async (invoice) => {
    if (!window.confirm('Позначити рахунок як оплачений вручну?')) return;
    
    try {
      const token = localStorage.getItem('token');
      await axios.patch(
        `${API_URL}/api/invoices/${invoice.id}/mark-paid`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success('Рахунок позначено як оплачений');
      fetchData();
    } catch (error) {
      console.error('Error marking paid:', error);
      toast.error('Помилка оновлення статусу');
    }
  };

  // Filter invoices
  const filteredInvoices = invoices.filter(inv => {
    if (filter !== 'all' && inv.status !== filter) return false;
    if (search) {
      const searchLower = search.toLowerCase();
      return (
        inv.title?.toLowerCase().includes(searchLower) ||
        inv.customerName?.toLowerCase().includes(searchLower) ||
        inv.customerEmail?.toLowerCase().includes(searchLower) ||
        inv.id.includes(searchLower)
      );
    }
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <ArrowsClockwise size={32} className="text-blue-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6" data-testid="manager-invoices-page">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Рахунки</h1>
          <p className="text-zinc-600">Створюйте та керуйте рахунками для клієнтів</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors"
          data-testid="create-invoice-btn"
        >
          <Plus size={20} />
          Новий рахунок
        </button>
      </div>

      {/* Analytics Cards */}
      {analytics && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-zinc-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Receipt size={20} className="text-blue-600" />
              </div>
              <div>
                <div className="text-sm text-zinc-500">Всього</div>
                <div className="text-xl font-bold text-zinc-900">{analytics.total}</div>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-zinc-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 rounded-lg">
                <Clock size={20} className="text-amber-600" />
              </div>
              <div>
                <div className="text-sm text-zinc-500">Очікують оплати</div>
                <div className="text-xl font-bold text-amber-600">
                  {analytics.byStatus?.pending?.count || 0}
                </div>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-zinc-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-100 rounded-lg">
                <CheckCircle size={20} className="text-emerald-600" />
              </div>
              <div>
                <div className="text-sm text-zinc-500">Оплачено</div>
                <div className="text-xl font-bold text-emerald-600">
                  ${analytics.totalPaid?.toLocaleString() || 0}
                </div>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-zinc-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-lg">
                <Warning size={20} className="text-red-600" />
              </div>
              <div>
                <div className="text-sm text-zinc-500">Прострочено</div>
                <div className="text-xl font-bold text-red-600">
                  ${analytics.totalOverdue?.toLocaleString() || 0}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-4 mb-6">
        <div className="relative flex-1 max-w-md">
          <MagnifyingGlass size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Пошук за назвою, клієнтом..."
            className="w-full pl-10 pr-4 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            data-testid="invoice-search"
          />
        </div>
        <div className="flex items-center gap-2">
          <Funnel size={18} className="text-zinc-400" />
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="px-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            data-testid="invoice-filter"
          >
            <option value="all">Всі статуси</option>
            <option value="draft">Чернетки</option>
            <option value="sent">Надіслані</option>
            <option value="pending">Очікують оплати</option>
            <option value="paid">Оплачені</option>
            <option value="overdue">Прострочені</option>
          </select>
        </div>
      </div>

      {/* Invoices Table */}
      <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-zinc-50 border-b border-zinc-200">
            <tr>
              <th className="text-left px-4 py-3 text-sm font-medium text-zinc-600">Рахунок</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-zinc-600">Клієнт</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-zinc-600">Тип</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-zinc-600">Сума</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-zinc-600">Статус</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-zinc-600">Дата</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-zinc-600">Дії</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {filteredInvoices.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-zinc-500">
                  <Receipt size={48} className="mx-auto mb-4 text-zinc-300" />
                  <p>Рахунків не знайдено</p>
                </td>
              </tr>
            ) : (
              filteredInvoices.map(invoice => (
                <InvoiceRow
                  key={invoice.id}
                  invoice={invoice}
                  onSend={handleSend}
                  onCancel={handleCancel}
                  onMarkPaid={handleMarkPaid}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Create Modal */}
      <CreateInvoiceModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={(newInvoice) => {
          setInvoices([newInvoice, ...invoices]);
        }}
        deals={deals}
        customers={customers}
      />
    </div>
  );
};

export default ManagerInvoicesPage;
