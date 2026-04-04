/**
 * BIBI Cars - Main Application
 * 
 * Структура:
 * / - Публічний сайт (каталог, VIN перевірка)
 * /admin - CRM панель (з авторизацією)
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { Toaster } from 'sonner';

// i18n
import { LanguageProvider } from './i18n';

// Public pages
import PublicLayout from './components/public/PublicLayout';
import HomePage from './pages/public/HomePage';
import VehiclesPage from './pages/public/VehiclesPage';
import VinCheckPage from './pages/public/VinCheckPage';
import VehicleDetailPage from './pages/public/VehicleDetailPage';
import CalculatorPage from './pages/public/CalculatorPage';
import CustomerLoginPage, { CustomerAuthProvider, CustomerProtectedRoute, AuthCallback } from './pages/public/CustomerAuth';
import { CollectionsPage, CollectionDetailPage } from './pages/public/CollectionsPage';

// Admin pages
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Leads from './pages/Leads';
import Customers from './pages/Customers';
import Deals from './pages/Deals';
import Deposits from './pages/Deposits';
import Tasks from './pages/Tasks';
import Staff from './pages/Staff';
import Settings from './pages/Settings';
import Documents from './pages/Documents';
import ProxySettings from './pages/ProxySettings';
import ParserControl from './pages/ParserControl';
import ProxyManager from './pages/ProxyManager';
import ParserLogs from './pages/ParserLogs';
import ParserSettings from './pages/ParserSettings';
import Vehicles from './pages/Vehicles';
import VinSearch from './pages/VinSearch';
import CalculatorAdmin from './pages/CalculatorAdmin';
import QuoteAnalytics from './pages/QuoteAnalytics';
import Customer360 from './pages/Customer360';
import AdminAnalyticsDashboard from './components/AdminAnalyticsDashboard';
import MarketingControlPanel from './components/MarketingControlPanel';
import ModerationPage from './pages/ModerationPage';
import SourceHealthDashboard from './pages/admin/SourceHealthDashboard';
import HistoryReportsAdmin from './pages/admin/HistoryReportsAdmin';
import StaffSessionsBoard from './pages/admin/StaffSessionsBoard';
import KPIDashboard from './pages/admin/KPIDashboard';
import CallBoardPage from './pages/admin/CallBoardPage';
import PredictiveLeadsPage from './pages/admin/PredictiveLeadsPage';
import SecuritySettings from './pages/admin/SecuritySettings';
import NotificationSettings from './pages/admin/NotificationSettings';
import CarfaxAdminPage from './pages/admin/CarfaxAdminPage';
import TeamLeadDashboard from './pages/admin/TeamLeadDashboard';
import IntegrationsPage from './pages/admin/IntegrationsPage';
import RoutingRulesPage from './pages/admin/RoutingRulesPage';
import CadencesPage from './pages/admin/CadencesPage';
import ScoreRulesPage from './pages/admin/ScoreRulesPage';
import JourneyPage from './pages/admin/JourneyPage';
import RiskDashboardPage from './pages/admin/RiskDashboardPage';
import EscalationDashboard from './pages/admin/EscalationDashboard';
import ContractsAccountingPage from './pages/admin/ContractsAccountingPage';

// Team Lead pages
import TeamDashboardPage from './pages/team/TeamDashboardPage';
import TeamManagersPage from './pages/team/TeamManagersPage';
import ManagerProfilePage from './pages/team/ManagerProfilePage';
import TeamLeadsPage from './pages/team/TeamLeadsPage';
import ReassignmentCenterPage from './pages/team/ReassignmentCenterPage';
import TeamTasksPage from './pages/team/TeamTasksPage';
import TeamPaymentsPage from './pages/team/TeamPaymentsPage';
import TeamShippingPage from './pages/team/TeamShippingPage';
import TeamAlertsPage from './pages/team/TeamAlertsPage';
import TeamPerformancePage from './pages/team/TeamPerformancePage';

// Manager pages
import ManagerWorkspacePage from './pages/manager/ManagerWorkspacePage';
import ManagerShipmentsPage from './pages/manager/ManagerShipmentsPage';

import NotificationsPage from './pages/NotificationsPage';
import ParserTestLab from './pages/ParserTestLab';
import {
  CabinetLayout,
  CabinetDashboard,
  CabinetOrders,
  CabinetOrderDetails,
  CabinetRequests,
  CabinetDeposits,
  CabinetTimeline,
  CabinetProfile,
  CabinetNotifications,
  CabinetCarfax,
  CabinetContracts,
  CabinetInvoices,
  CabinetShipping
} from './pages/CustomerCabinet';
import Layout from './components/Layout';

// User Engagement Cabinet pages
import FavoritesPage from './pages/cabinet/FavoritesPage';
import ComparePage from './pages/cabinet/ComparePage';
import HistoryPage from './pages/cabinet/HistoryPage';
import HistoryReportsPage from './pages/cabinet/HistoryReportsPage';
import CarfaxPage from './pages/cabinet/CarfaxPage';
import ManagerCallsPage from './pages/manager/ManagerCallsPage';
import ManagerTasksPage from './pages/manager/ManagerTasksPage';

// Cabinet P1 pages
import InvoicesPage from './pages/cabinet/InvoicesPage';
import ContractsPage from './pages/cabinet/ContractsPage';
import ShippingPage from './pages/cabinet/ShippingPage';
import PaymentSuccessPage from './pages/cabinet/PaymentSuccessPage';

// Manager pages
import ManagerInvoicesPage from './pages/ManagerInvoicesPage';

// Intent & AI Dashboard
import IntentDashboard from './pages/IntentDashboard';
import AutoCallSettings from './pages/AutoCallSettings';
// TwilioIntegrationSettings removed - using Ringostat instead
import UserEngagementPage from './pages/UserEngagementPage';

// Owner & Finance Dashboards
import OwnerPaymentDashboard from './pages/OwnerPaymentDashboard';
import InvoiceRemindersDashboard from './pages/InvoiceRemindersDashboard';

// Analytics
import { initAnalytics } from './utils/analytics';

import './App.css';

// Initialize analytics tracking
if (typeof window !== 'undefined') {
  initAnalytics();
}

const API_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';

// Auth Context
const AuthContext = createContext(null);

export const useAuth = () => useContext(AuthContext);

const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      fetchUser();
    } else {
      setLoading(false);
    }
  }, [token]);

  // Setup axios interceptor for auth errors
  useEffect(() => {
    const interceptor = axios.interceptors.response.use(
      (response) => response,
      (error) => {
        // Only logout on explicit 401 from auth endpoints
        if (error.response?.status === 401 && error.config?.url?.includes('/api/auth/me')) {
          logout();
        }
        return Promise.reject(error);
      }
    );
    return () => axios.interceptors.response.eject(interceptor);
  }, []);

  const fetchUser = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/auth/me`);
      setUser(res.data);
    } catch (err) {
      // Only logout if it's an auth error
      if (err.response?.status === 401) {
        logout();
      }
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password) => {
    const res = await axios.post(`${API_URL}/api/auth/login`, { email, password });
    const { access_token, user } = res.data;
    localStorage.setItem('token', access_token);
    axios.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;
    setToken(access_token);
    setUser(user);
    return user;
  };

  const logout = () => {
    localStorage.removeItem('token');
    delete axios.defaults.headers.common['Authorization'];
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#F7F7F8]">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-[#0A0A0B] border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-sm text-[#71717A]">Завантаження...</p>
        </div>
      </div>
    );
  }
  
  if (!user) {
    return <Navigate to="/admin/login" replace />;
  }
  
  return children;
};

function App() {
  return (
    <BrowserRouter>
      <LanguageProvider>
        <AuthProvider>
          <CustomerAuthProvider>
            <Toaster position="top-right" richColors />
            <Routes>
              {/* ====== PUBLIC SITE ====== */}
              <Route path="/" element={<PublicLayout />}>
                <Route index element={<HomePage />} />
                <Route path="vehicles" element={<VehiclesPage />} />
                <Route path="cars" element={<VehiclesPage />} />
                <Route path="vehicle/:id" element={<VehicleDetailPage />} />
                <Route path="cars/:slug" element={<VehicleDetailPage />} />
              <Route path="vin-check" element={<VinCheckPage />} />
              <Route path="vin-check/:vin" element={<VinCheckPage />} />
              <Route path="calculator" element={<CalculatorPage />} />
              <Route path="collections" element={<CollectionsPage />} />
              <Route path="collections/:slug" element={<CollectionDetailPage />} />
            </Route>

            {/* ====== CUSTOMER AUTH ====== */}
            <Route path="/cabinet/login" element={<CustomerLoginPage />} />
            <Route path="/cabinet/callback" element={<AuthCallback />} />
            
            {/* ====== CABINET - redirect to login ====== */}
            <Route path="/cabinet" element={<Navigate to="/cabinet/login" replace />} />
            <Route path="/cabinet/favorites" element={<CustomerProtectedRoute><FavoritesPage /></CustomerProtectedRoute>} />
            <Route path="/cabinet/compare" element={<CustomerProtectedRoute><ComparePage /></CustomerProtectedRoute>} />
            <Route path="/cabinet/history" element={<CustomerProtectedRoute><HistoryPage /></CustomerProtectedRoute>} />
            <Route path="/cabinet/history-reports" element={<CustomerProtectedRoute><HistoryReportsPage /></CustomerProtectedRoute>} />
            <Route path="/cabinet/carfax" element={<CustomerProtectedRoute><CarfaxPage /></CustomerProtectedRoute>} />
            <Route path="/cabinet/invoices" element={<CustomerProtectedRoute><InvoicesPage /></CustomerProtectedRoute>} />
            <Route path="/cabinet/contracts" element={<CustomerProtectedRoute><ContractsPage /></CustomerProtectedRoute>} />
            <Route path="/cabinet/shipping" element={<CustomerProtectedRoute><ShippingPage /></CustomerProtectedRoute>} />

            {/* ====== ADMIN CRM ====== */}
            <Route path="/admin/login" element={<Login />} />
            <Route path="/admin" element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }>
              <Route index element={<Dashboard />} />
              <Route path="leads" element={<Leads />} />
              <Route path="customers" element={<Customers />} />
              <Route path="customers/:id/360" element={<Customer360 />} />
              <Route path="deals" element={<Deals />} />
              <Route path="deposits" element={<Deposits />} />
              <Route path="tasks" element={<Tasks />} />
              <Route path="staff" element={<Staff />} />
              <Route path="documents" element={<Documents />} />
              <Route path="settings" element={<Settings />} />
              <Route path="proxy-settings" element={<ProxySettings />} />
              <Route path="parser" element={<ParserControl />} />
              <Route path="parser/proxies" element={<ProxyManager />} />
              <Route path="parser/logs" element={<ParserLogs />} />
              <Route path="parser/settings" element={<ParserSettings />} />
              <Route path="parser-mesh/test" element={<ParserTestLab />} />
              <Route path="source-health" element={<SourceHealthDashboard />} />
              <Route path="vehicles" element={<Vehicles />} />
              <Route path="vin" element={<VinSearch />} />
              <Route path="calculator" element={<CalculatorAdmin />} />
              <Route path="analytics/quotes" element={<QuoteAnalytics />} />
              <Route path="analytics" element={<AdminAnalyticsDashboard />} />
              <Route path="marketing" element={<MarketingControlPanel />} />
              <Route path="moderation" element={<ModerationPage />} />
              <Route path="listings/moderation" element={<ModerationPage />} />
              <Route path="notifications" element={<NotificationsPage />} />
              <Route path="intent" element={<IntentDashboard />} />
              <Route path="engagement" element={<UserEngagementPage />} />
              <Route path="auto-call" element={<AutoCallSettings />} />
              {/* Twilio removed - use Settings > Integrations > Ringostat */}
              <Route path="history-reports" element={<HistoryReportsAdmin />} />
              <Route path="staff-sessions" element={<StaffSessionsBoard />} />
              <Route path="kpi" element={<KPIDashboard />} />
              <Route path="call-board" element={<CallBoardPage />} />
              <Route path="predictive-leads" element={<PredictiveLeadsPage />} />
              <Route path="security" element={<SecuritySettings />} />
              <Route path="notification-settings" element={<NotificationSettings />} />
              <Route path="carfax" element={<CarfaxAdminPage />} />
              <Route path="team-lead" element={<TeamLeadDashboard />} />
              <Route path="integrations" element={<IntegrationsPage />} />
              <Route path="routing-rules" element={<RoutingRulesPage />} />
              <Route path="cadences" element={<CadencesPage />} />
              <Route path="score-rules" element={<ScoreRulesPage />} />
              <Route path="journey" element={<JourneyPage />} />
              <Route path="risk" element={<RiskDashboardPage />} />
              <Route path="escalations" element={<EscalationDashboard />} />
              <Route path="contracts/accounting" element={<ContractsAccountingPage />} />
              <Route path="owner-dashboard" element={<OwnerPaymentDashboard />} />
              <Route path="invoice-reminders" element={<InvoiceRemindersDashboard />} />
            </Route>

            {/* ====== TEAM LEAD WORKSPACE ====== */}
            <Route path="/team" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
              <Route index element={<TeamDashboardPage />} />
              <Route path="dashboard" element={<TeamDashboardPage />} />
              <Route path="managers" element={<TeamManagersPage />} />
              <Route path="managers/:id" element={<ManagerProfilePage />} />
              <Route path="leads" element={<TeamLeadsPage />} />
              <Route path="reassignments" element={<ReassignmentCenterPage />} />
              <Route path="tasks" element={<TeamTasksPage />} />
              <Route path="payments" element={<TeamPaymentsPage />} />
              <Route path="shipping" element={<TeamShippingPage />} />
              <Route path="alerts" element={<TeamAlertsPage />} />
              <Route path="performance" element={<TeamPerformancePage />} />
            </Route>

            {/* ====== MANAGER WORKSPACE ====== */}
            <Route path="/manager" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
              <Route index element={<ManagerWorkspacePage />} />
              <Route path="calls" element={<ManagerCallsPage />} />
              <Route path="tasks" element={<ManagerTasksPage />} />
              <Route path="invoices" element={<ManagerInvoicesPage />} />
              <Route path="shipments" element={<ManagerShipmentsPage />} />
            </Route>

            {/* ====== CUSTOMER CABINET (CLIENT PORTAL) ====== */}
            <Route path="/cabinet/:customerId" element={<CabinetLayout />}>
              <Route index element={<CabinetDashboard />} />
              <Route path="notifications" element={<CabinetNotifications />} />
              <Route path="favorites" element={<FavoritesPage />} />
              <Route path="compare" element={<ComparePage />} />
              <Route path="history" element={<HistoryPage />} />
              <Route path="requests" element={<CabinetRequests />} />
              <Route path="orders" element={<CabinetOrders />} />
              <Route path="orders/:dealId" element={<CabinetOrderDetails />} />
              <Route path="deposits" element={<CabinetDeposits />} />
              <Route path="carfax" element={<CabinetCarfax />} />
              <Route path="contracts" element={<CabinetContracts />} />
              <Route path="invoices" element={<CabinetInvoices />} />
              <Route path="payment-success" element={<PaymentSuccessPage />} />
              <Route path="shipping" element={<CabinetShipping />} />
              <Route path="timeline" element={<CabinetTimeline />} />
              <Route path="profile" element={<CabinetProfile />} />
            </Route>

            {/* Legacy redirect: /login -> /admin/login */}
            <Route path="/login" element={<Navigate to="/admin/login" replace />} />
            
            {/* Catch all - redirect to home */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </CustomerAuthProvider>
      </AuthProvider>
    </LanguageProvider>
    </BrowserRouter>
  );
}

export default App;
export { API_URL };
