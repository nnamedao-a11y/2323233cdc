/**
 * Customer Auth Context and Login Page
 * 
 * Emergent Google OAuth (1-click)
 * REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
 */

import React, { useState, useEffect, createContext, useContext, useRef } from 'react';
import { useNavigate, useLocation, Link, Navigate } from 'react-router-dom';
import axios from 'axios';
import { useLang } from '../../i18n';
import { 
  User, 
  Lock, 
  Envelope, 
  Eye, 
  EyeSlash, 
  ArrowLeft,
  Warning,
  SpinnerGap,
  GoogleLogo
} from '@phosphor-icons/react';

const API_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';

// ============ AUTH CONTEXT ============

const CustomerAuthContext = createContext(null);

export const useCustomerAuth = () => useContext(CustomerAuthContext);

export const CustomerAuthProvider = ({ children }) => {
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // CRITICAL: If returning from OAuth callback, skip the /me check
    // AuthCallback will exchange the session_id and establish the session first
    if (window.location.hash?.includes('session_id=')) {
      setLoading(false);
      return;
    }
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      // First, check if we have a session token in localStorage
      const savedSession = localStorage.getItem('customer_session');
      let sessionToken = null;
      let savedCustomerData = null;
      
      if (savedSession) {
        try {
          savedCustomerData = JSON.parse(savedSession);
          sessionToken = savedCustomerData?.sessionToken;
        } catch {}
      }
      
      // If we have a sessionToken, verify it and use it
      if (sessionToken) {
        try {
          const res = await axios.get(`${API_URL}/api/customer-auth/google/me`, {
            headers: { 'Authorization': `Bearer ${sessionToken}` },
            withCredentials: true,
          });
          const customerData = res.data;
          setCustomer(customerData);
          // Update localStorage with fresh data but keep sessionToken
          localStorage.setItem('customer_session', JSON.stringify({
            ...customerData,
            sessionToken: customerData.sessionToken || sessionToken,
          }));
          return; // Successfully authenticated
        } catch (err) {
          // Session token invalid/expired - clear it
          console.log('Session token invalid, clearing');
          localStorage.removeItem('customer_session');
        }
      }
      
      // Try legacy JWT token
      const token = localStorage.getItem('customer_token');
      if (token) {
        try {
          const res = await axios.get(`${API_URL}/api/customer-auth/me`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          const customerData = res.data;
          setCustomer(customerData);
          // Save to localStorage
          if (customerData?.customerId) {
            localStorage.setItem('customer_session', JSON.stringify(customerData));
          }
          return; // Successfully authenticated
        } catch {
          localStorage.removeItem('customer_token');
          localStorage.removeItem('customer_session');
        }
      }
      
      // No valid auth found - user needs to login
      setCustomer(null);
    } finally {
      setLoading(false);
    }
  };

  // Emergent Google OAuth login
  const loginWithGoogle = () => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    const redirectUrl = window.location.origin + '/cabinet/callback';
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  // Process Emergent OAuth callback
  const processGoogleCallback = async (sessionId) => {
    console.log('[Auth] Processing Google callback with sessionId:', sessionId);
    const res = await axios.post(`${API_URL}/api/customer-auth/google/session`, 
      { sessionId },
      { withCredentials: true }
    );
    const customerData = res.data;
    console.log('[Auth] Google session response:', {
      customerId: customerData?.customerId,
      hasSessionToken: !!customerData?.sessionToken,
      sessionToken: customerData?.sessionToken?.substring(0, 20) + '...',
    });
    setCustomer(customerData);
    // Save to localStorage for session persistence - include sessionToken for auth headers
    if (customerData?.customerId) {
      const dataToSave = {
        ...customerData,
        sessionToken: customerData.sessionToken,
      };
      console.log('[Auth] Saving to localStorage:', {
        customerId: dataToSave.customerId,
        hasSessionToken: !!dataToSave.sessionToken,
      });
      localStorage.setItem('customer_session', JSON.stringify(dataToSave));
    }
    return customerData;
  };

  // Legacy email/password login
  const login = async (email, password) => {
    const res = await axios.post(`${API_URL}/api/customer-auth/login`, {
      email,
      password
    });
    const customerData = res.data;
    localStorage.setItem('customer_token', customerData.accessToken);
    localStorage.setItem('customer_session', JSON.stringify(customerData));
    setCustomer(customerData);
    return customerData;
  };

  // Legacy register
  const register = async (email, password, name) => {
    const res = await axios.post(`${API_URL}/api/customer-auth/register`, {
      email,
      password,
      name,
      customerId: ''
    });
    const customerData = res.data;
    localStorage.setItem('customer_token', customerData.accessToken);
    localStorage.setItem('customer_session', JSON.stringify(customerData));
    setCustomer(customerData);
    return customerData;
  };

  const logout = async () => {
    try {
      await axios.post(`${API_URL}/api/customer-auth/google/logout`, {}, {
        withCredentials: true
      });
    } catch {}
    localStorage.removeItem('customer_token');
    localStorage.removeItem('customer_session');
    setCustomer(null);
  };

  return (
    <CustomerAuthContext.Provider value={{ 
      customer, 
      loading, 
      login, 
      register, 
      logout, 
      loginWithGoogle,
      processGoogleCallback,
      checkAuth
    }}>
      {children}
    </CustomerAuthContext.Provider>
  );
};

// ============ PROTECTED ROUTE ============

export const CustomerProtectedRoute = ({ children }) => {
  const { customer, loading } = useCustomerAuth();
  const location = useLocation();

  // If user data passed from AuthCallback, render immediately
  if (location.state?.user) {
    return children;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <SpinnerGap size={48} className="animate-spin text-zinc-400" />
      </div>
    );
  }

  if (!customer) {
    return <Navigate to="/cabinet/login" replace />;
  }

  return children;
};

// ============ AUTH CALLBACK (Emergent OAuth) ============

export const AuthCallback = () => {
  const { t } = useLang();
  const navigate = useNavigate();
  const { processGoogleCallback } = useCustomerAuth();
  const hasProcessed = useRef(false);

  useEffect(() => {
    // Use ref to prevent double processing in StrictMode
    if (hasProcessed.current) return;
    hasProcessed.current = true;

    const hash = window.location.hash;
    const sessionIdMatch = hash.match(/session_id=([^&]+)/);
    
    if (sessionIdMatch) {
      const sessionId = sessionIdMatch[1];
      
      processGoogleCallback(sessionId)
        .then((data) => {
          // Navigate to cabinet with user data
          navigate(`/cabinet/${data.customerId}`, { 
            replace: true,
            state: { user: data }
          });
        })
        .catch((err) => {
          console.error('Auth callback error:', err);
          navigate('/cabinet/login', { replace: true });
        });
    } else {
      navigate('/cabinet/login', { replace: true });
    }
  }, []);

  return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
      <div className="text-center">
        <SpinnerGap size={48} className="animate-spin text-zinc-400 mx-auto mb-4" />
        <p className="text-zinc-500">{t('authorizing')}</p>
      </div>
    </div>
  );
};

// ============ LOGIN PAGE ============

export const CustomerLoginPage = () => {
  const { t, lang, changeLang } = useLang();
  const navigate = useNavigate();
  const { customer, loginWithGoogle } = useCustomerAuth();
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const auth = useCustomerAuth();

  // Redirect if already logged in
  useEffect(() => {
    if (customer?.customerId) {
      navigate(`/cabinet/${customer.customerId}`);
    }
  }, [customer, navigate]);

  const handleGoogleLogin = () => {
    loginWithGoogle();
  };

  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isLogin) {
        const data = await auth.login(email, password);
        navigate(`/cabinet/${data.customerId}`);
      } else {
        const data = await auth.register(email, password, name);
        navigate(`/cabinet/${data.customerId}`);
      }
    } catch (err) {
      const detail = err.response?.data?.message || err.response?.data?.detail || err.message;
      setError(typeof detail === 'string' ? detail : t('authError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-4" data-testid="customer-login-page">
      {/* Language Switcher */}
      <div className="fixed top-4 right-4 flex items-center gap-1 bg-white border border-zinc-200 rounded-lg px-2 py-1 shadow-sm">
        <button
          onClick={() => changeLang('uk')}
          className={`px-2 py-1 rounded text-sm ${lang === 'uk' ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:text-zinc-900'}`}
          data-testid="auth-lang-uk"
        >
          UA
        </button>
        <button
          onClick={() => changeLang('bg')}
          className={`px-2 py-1 rounded text-sm ${lang === 'bg' ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:text-zinc-900'}`}
          data-testid="auth-lang-bg"
        >
          BG
        </button>
        <button
          onClick={() => changeLang('en')}
          className={`px-2 py-1 rounded text-sm ${lang === 'en' ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:text-zinc-900'}`}
          data-testid="auth-lang-en"
        >
          EN
        </button>
      </div>
      
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl border border-zinc-200 p-8 shadow-sm">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-zinc-900 rounded-xl mx-auto mb-4 flex items-center justify-center">
              <User size={32} weight="bold" className="text-white" />
            </div>
            <h1 className="text-2xl font-bold text-zinc-900">
              {t('personalCabinet')}
            </h1>
            <p className="text-zinc-500 mt-2 text-sm">
              {t('loginForAccess')}
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3 text-red-700">
              <Warning size={20} />
              <span className="text-sm">{error}</span>
            </div>
          )}

          {/* Google Auth Button */}
          <button
            onClick={handleGoogleLogin}
            className="w-full bg-white border-2 border-zinc-200 text-zinc-900 py-3.5 rounded-xl font-semibold hover:bg-zinc-50 hover:border-zinc-300 transition-all flex items-center justify-center gap-3 mb-6"
            data-testid="google-login-btn"
          >
            <GoogleLogo size={24} weight="bold" className="text-[#4285F4]" />
            {t('loginWithGoogle')}
          </button>

          {/* Divider */}
          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-zinc-200"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-white text-zinc-400">{t('or')}</span>
            </div>
          </div>

          {/* Email Form Toggle */}
          {!showEmailForm ? (
            <button
              onClick={() => setShowEmailForm(true)}
              className="w-full text-zinc-500 hover:text-zinc-900 py-2 text-sm transition-colors"
            >
              {t('loginWithEmail')}
            </button>
          ) : (
            <>
              {/* Email Form */}
              <form onSubmit={handleEmailSubmit} className="space-y-5">
                {!isLogin && (
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-2">
                      {t('yourName')}
                    </label>
                    <div className="relative">
                      <User size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" />
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder={t('namePlaceholder')}
                        className="w-full pl-11 pr-4 py-3 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-zinc-900 focus:border-zinc-900 outline-none transition-all"
                        data-testid="register-name-input"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-2">
                    Email
                  </label>
                  <div className="relative">
                    <Envelope size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="your@email.com"
                      required
                      className="w-full pl-11 pr-4 py-3 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-zinc-900 focus:border-zinc-900 outline-none transition-all"
                      data-testid="login-email-input"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-2">
                    {t('password')}
                  </label>
                  <div className="relative">
                    <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      minLength={6}
                      className="w-full pl-11 pr-12 py-3 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-zinc-900 focus:border-zinc-900 outline-none transition-all"
                      data-testid="login-password-input"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                    >
                      {showPassword ? <EyeSlash size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-zinc-900 text-white py-3.5 rounded-xl font-semibold hover:bg-zinc-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  data-testid="login-submit-btn"
                >
                  {loading ? (
                    <>
                      <SpinnerGap size={20} className="animate-spin" />
                      {t('loading')}
                    </>
                  ) : (
                    isLogin ? t('login') : t('register')
                  )}
                </button>
              </form>

              {/* Toggle */}
              <div className="mt-6 text-center text-sm">
                <span className="text-zinc-500">
                  {isLogin ? t('noAccount') : t('haveAccount')}
                </span>
                <button
                  onClick={() => { setIsLogin(!isLogin); setError(''); }}
                  className="ml-2 text-zinc-900 font-semibold hover:underline"
                >
                  {isLogin ? t('register') : t('login')}
                </button>
              </div>
            </>
          )}

          {/* Back to site */}
          <div className="mt-8 pt-6 border-t border-zinc-100 text-center">
            <Link
              to="/"
              className="text-sm text-zinc-500 hover:text-zinc-900 inline-flex items-center gap-2"
            >
              <ArrowLeft size={16} />
              {t('backToSite')}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CustomerLoginPage;
