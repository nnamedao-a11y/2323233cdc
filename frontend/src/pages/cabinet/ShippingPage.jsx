/**
 * Shipping Page (Cabinet)
 * 
 * /cabinet/shipping
 * 
 * Shows shipping tracking and timeline with REAL-TIME notifications
 */

import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useLang } from '../../i18n';
import { 
  Truck, 
  Package, 
  Anchor,
  CheckCircle, 
  Clock, 
  MapPin,
  CalendarBlank,
  FileText,
  ArrowRight,
  Bell,
  WifiHigh,
  WifiSlash
} from '@phosphor-icons/react';
import { toast } from 'sonner';
import { useShipmentNotifications } from '../../hooks/useShipmentNotifications';

const API_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';

// Status config
const STATUS_CONFIG = {
  pending: { color: 'zinc', icon: Clock, label: 'Очікує', step: 0 },
  picked_up: { color: 'blue', icon: Package, label: 'Забрано', step: 1 },
  in_transit: { color: 'amber', icon: Truck, label: 'В дорозі', step: 2 },
  at_port: { color: 'indigo', icon: Anchor, label: 'В порту', step: 3 },
  customs_clearance: { color: 'purple', icon: FileText, label: 'Митниця', step: 4 },
  delivered: { color: 'emerald', icon: CheckCircle, label: 'Доставлено', step: 5 },
  cancelled: { color: 'red', icon: Clock, label: 'Скасовано', step: -1 },
};

// Progress Steps
const ProgressSteps = ({ currentStatus }) => {
  const steps = ['pending', 'picked_up', 'in_transit', 'at_port', 'customs_clearance', 'delivered'];
  const currentStep = STATUS_CONFIG[currentStatus]?.step || 0;
  
  return (
    <div className="flex items-center justify-between mb-8">
      {steps.map((step, index) => {
        const config = STATUS_CONFIG[step];
        const Icon = config.icon;
        const isActive = currentStep >= config.step;
        const isCurrent = currentStatus === step;
        
        return (
          <React.Fragment key={step}>
            <div className="flex flex-col items-center">
              <div 
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-all
                  ${isActive ? `bg-${config.color}-500 text-white` : 'bg-zinc-200 text-zinc-400'}
                  ${isCurrent ? 'ring-4 ring-blue-200 scale-110' : ''}`}
              >
                <Icon size={20} weight={isActive ? 'fill' : 'regular'} />
              </div>
              <span className={`text-xs mt-2 ${isActive ? 'text-zinc-900 font-medium' : 'text-zinc-400'}`}>
                {config.label}
              </span>
            </div>
            
            {index < steps.length - 1 && (
              <div className={`flex-1 h-1 mx-2 rounded ${currentStep > config.step ? 'bg-emerald-500' : 'bg-zinc-200'}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

// Timeline Event
const TimelineEvent = ({ event, isLast }) => {
  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <div className="w-3 h-3 rounded-full bg-blue-500"></div>
        {!isLast && <div className="flex-1 w-0.5 bg-zinc-200 my-1"></div>}
      </div>
      <div className="pb-4">
        <div className="font-medium text-zinc-900">{event.description}</div>
        <div className="text-sm text-zinc-500 flex items-center gap-2 mt-1">
          <MapPin size={14} />
          {event.location}
        </div>
        <div className="text-xs text-zinc-400 mt-1">
          {new Date(event.timestamp).toLocaleString('uk-UA')}
        </div>
      </div>
    </div>
  );
};

// Shipment Card
const ShipmentCard = ({ shipment, expanded, onToggle }) => {
  const config = STATUS_CONFIG[shipment.status] || STATUS_CONFIG.pending;
  const Icon = config.icon;
  
  return (
    <div 
      className="bg-white rounded-2xl border border-zinc-200 overflow-hidden"
      data-testid={`shipment-card-${shipment.id}`}
    >
      {/* Header */}
      <div 
        className="p-4 cursor-pointer hover:bg-zinc-50 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl bg-${config.color}-100`}>
              <Icon size={24} className={`text-${config.color}-600`} />
            </div>
            <div>
              <h3 className="font-semibold text-zinc-900">{shipment.vehicleTitle || 'Транспортування'}</h3>
              <p className="text-sm text-zinc-500 font-mono">VIN: {shipment.vin}</p>
            </div>
          </div>
          <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium bg-${config.color}-100 text-${config.color}-700`}>
            <Icon size={14} />
            {config.label}
          </span>
        </div>
        
        {/* Quick Info */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
          {shipment.containerNumber && (
            <div>
              <div className="text-xs text-zinc-500">Контейнер</div>
              <div className="font-mono text-sm">{shipment.containerNumber}</div>
            </div>
          )}
          {shipment.originPort && (
            <div>
              <div className="text-xs text-zinc-500">Порт відправлення</div>
              <div className="text-sm">{shipment.originPort}</div>
            </div>
          )}
          {shipment.destinationPort && (
            <div>
              <div className="text-xs text-zinc-500">Порт призначення</div>
              <div className="text-sm">{shipment.destinationPort}</div>
            </div>
          )}
          {shipment.estimatedArrivalDate && (
            <div>
              <div className="text-xs text-zinc-500">ETA</div>
              <div className="text-sm font-medium text-blue-600">
                {new Date(shipment.estimatedArrivalDate).toLocaleDateString('uk-UA')}
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* Expanded Content */}
      {expanded && (
        <div className="border-t border-zinc-100 p-4 bg-zinc-50">
          {/* Progress */}
          <ProgressSteps currentStatus={shipment.status} />
          
          {/* Timeline */}
          {shipment.events?.length > 0 && (
            <div className="mt-6">
              <h4 className="font-medium text-zinc-900 mb-4">Історія доставки</h4>
              <div className="bg-white rounded-xl p-4 border border-zinc-200">
                {shipment.events.slice().reverse().map((event, index) => (
                  <TimelineEvent 
                    key={index} 
                    event={event} 
                    isLast={index === shipment.events.length - 1}
                  />
                ))}
              </div>
            </div>
          )}
          
          {/* Documents */}
          {shipment.documents?.length > 0 && (
            <div className="mt-6">
              <h4 className="font-medium text-zinc-900 mb-4">Документи</h4>
              <div className="grid grid-cols-2 gap-2">
                {shipment.documents.map((doc, index) => (
                  <a
                    key={index}
                    href={doc.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 p-3 bg-white rounded-lg border border-zinc-200 hover:border-blue-300 transition-colors"
                  >
                    <FileText size={18} className="text-blue-600" />
                    <span className="text-sm truncate">{doc.name}</span>
                  </a>
                ))}
              </div>
            </div>
          )}
          
          {/* Dates */}
          <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
            {shipment.estimatedPickupDate && (
              <div className="bg-white rounded-lg p-3 border border-zinc-200">
                <div className="text-xs text-zinc-500">Планове забирання</div>
                <div className="text-sm font-medium mt-1">
                  {new Date(shipment.estimatedPickupDate).toLocaleDateString('uk-UA')}
                </div>
              </div>
            )}
            {shipment.estimatedDepartureDate && (
              <div className="bg-white rounded-lg p-3 border border-zinc-200">
                <div className="text-xs text-zinc-500">Планове відправлення</div>
                <div className="text-sm font-medium mt-1">
                  {new Date(shipment.estimatedDepartureDate).toLocaleDateString('uk-UA')}
                </div>
              </div>
            )}
            {shipment.estimatedArrivalDate && (
              <div className="bg-white rounded-lg p-3 border border-zinc-200">
                <div className="text-xs text-zinc-500">Планове прибуття</div>
                <div className="text-sm font-medium mt-1">
                  {new Date(shipment.estimatedArrivalDate).toLocaleDateString('uk-UA')}
                </div>
              </div>
            )}
            {shipment.estimatedDeliveryDate && (
              <div className="bg-white rounded-lg p-3 border border-zinc-200">
                <div className="text-xs text-zinc-500">Планова доставка</div>
                <div className="text-sm font-medium mt-1">
                  {new Date(shipment.estimatedDeliveryDate).toLocaleDateString('uk-UA')}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const ShippingPage = () => {
  const [shipments, setShipments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  
  // Real-time notifications via WebSocket
  const { 
    isConnected, 
    statusChanged, 
    etaChanged, 
    lastUpdate,
    subscribe,
    clearUpdate 
  } = useShipmentNotifications();

  const getCustomerId = () => {
    const path = window.location.pathname;
    const match = path.match(/\/cabinet\/([^/]+)/);
    return match?.[1] || localStorage.getItem('customerId');
  };

  const fetchShipments = useCallback(async () => {
    try {
      const customerId = getCustomerId();
      const response = await axios.get(`${API_URL}/api/shipping/me`, { params: { customerId } });
      setShipments(response.data || []);
      
      // Auto-expand first active shipment
      const active = response.data?.find(s => !['delivered', 'cancelled'].includes(s.status));
      if (active) {
        setExpandedId(active.id);
      }
    } catch (error) {
      console.error('Error fetching shipments:', error);
      toast.error('Помилка завантаження даних');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchShipments();
  }, [fetchShipments]);

  // Subscribe to all active shipments for real-time updates
  useEffect(() => {
    if (isConnected && shipments.length > 0) {
      shipments.forEach(shipment => {
        if (!['delivered', 'cancelled'].includes(shipment.status)) {
          subscribe(shipment.id);
        }
      });
    }
  }, [isConnected, shipments, subscribe]);

  // Handle real-time status changes
  useEffect(() => {
    if (statusChanged) {
      // Show toast notification
      toast.success(
        <div className="flex items-center gap-3">
          <Bell size={20} className="text-blue-500" />
          <div>
            <div className="font-medium">Статус доставки оновлено!</div>
            <div className="text-sm text-zinc-500">
              {statusChanged.vin}: {statusChanged.statusLabel}
            </div>
          </div>
        </div>,
        { duration: 6000 }
      );
      
      // Update local state
      setShipments(prev => prev.map(s => 
        s.id === statusChanged.shipmentId 
          ? { ...s, status: statusChanged.newStatus }
          : s
      ));
      
      // Refetch for full data
      fetchShipments();
      clearUpdate();
    }
  }, [statusChanged, fetchShipments, clearUpdate]);

  // Handle real-time ETA changes
  useEffect(() => {
    if (etaChanged) {
      // Show toast notification
      toast.info(
        <div className="flex items-center gap-3">
          <CalendarBlank size={20} className="text-amber-500" />
          <div>
            <div className="font-medium">Дата прибуття змінилась!</div>
            <div className="text-sm text-zinc-500">
              {etaChanged.vin}: {etaChanged.formattedEta}
            </div>
          </div>
        </div>,
        { duration: 6000 }
      );
      
      // Update local state
      setShipments(prev => prev.map(s => 
        s.id === etaChanged.shipmentId 
          ? { ...s, estimatedArrivalDate: etaChanged.newEta }
          : s
      ));
      
      clearUpdate();
    }
  }, [etaChanged, clearUpdate]);

  // Handle shipment arrived notification
  useEffect(() => {
    if (lastUpdate?.type === 'arrived') {
      toast.success(
        <div className="flex items-center gap-3">
          <Anchor size={20} className="text-emerald-500" />
          <div>
            <div className="font-medium">🎉 Ваше авто прибуло!</div>
            <div className="text-sm text-zinc-500">
              {lastUpdate.data.vehicleTitle}
            </div>
          </div>
        </div>,
        { duration: 10000 }
      );
      fetchShipments();
      clearUpdate();
    }
    
    if (lastUpdate?.type === 'ready') {
      toast.success(
        <div className="flex items-center gap-3">
          <CheckCircle size={20} className="text-emerald-500" />
          <div>
            <div className="font-medium">🚗 Авто готове до видачі!</div>
            <div className="text-sm text-zinc-500">
              {lastUpdate.data.vehicleTitle}
            </div>
          </div>
        </div>,
        { duration: 10000 }
      );
      fetchShipments();
      clearUpdate();
    }
  }, [lastUpdate, fetchShipments, clearUpdate]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const activeShipments = shipments.filter(s => !['delivered', 'cancelled'].includes(s.status));
  const completedShipments = shipments.filter(s => s.status === 'delivered');

  return (
    <div className="p-6 max-w-4xl mx-auto" data-testid="shipping-page">
      {/* Header with real-time connection status */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 mb-2">Доставка</h1>
            <p className="text-zinc-600">Відстежуйте статус ваших автомобілів</p>
          </div>
          
          {/* Real-time connection indicator */}
          <div 
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm ${
              isConnected 
                ? 'bg-emerald-100 text-emerald-700' 
                : 'bg-zinc-100 text-zinc-500'
            }`}
            data-testid="realtime-status"
          >
            {isConnected ? (
              <>
                <WifiHigh size={16} weight="fill" />
                <span>{t('common.realtime', 'Real-time')}</span>
              </>
            ) : (
              <>
                <WifiSlash size={16} />
                <span>{t('common.offline', 'Offline')}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <div className="bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl p-6 text-white">
          <div className="flex items-center gap-3 mb-4">
            <Truck size={28} />
            <span className="text-lg font-semibold">В дорозі</span>
          </div>
          <div className="text-4xl font-bold">{activeShipments.length}</div>
          <div className="text-blue-100 text-sm mt-1">активних доставок</div>
        </div>
        
        <div className="bg-white rounded-2xl border border-zinc-200 p-6">
          <div className="flex items-center gap-3 mb-4">
            <CheckCircle size={28} className="text-emerald-500" />
            <span className="text-lg font-semibold text-zinc-900">Доставлено</span>
          </div>
          <div className="text-4xl font-bold text-zinc-900">{completedShipments.length}</div>
          <div className="text-zinc-500 text-sm mt-1">завершених доставок</div>
        </div>
      </div>

      {/* Active Shipments */}
      {activeShipments.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-zinc-900 mb-4">В процесі</h2>
          <div className="space-y-4">
            {activeShipments.map(shipment => (
              <ShipmentCard 
                key={shipment.id} 
                shipment={shipment}
                expanded={expandedId === shipment.id}
                onToggle={() => setExpandedId(expandedId === shipment.id ? null : shipment.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Completed Shipments */}
      {completedShipments.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 mb-4">Доставлені</h2>
          <div className="space-y-4">
            {completedShipments.map(shipment => (
              <ShipmentCard 
                key={shipment.id} 
                shipment={shipment}
                expanded={expandedId === shipment.id}
                onToggle={() => setExpandedId(expandedId === shipment.id ? null : shipment.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {shipments.length === 0 && (
        <div className="text-center py-12 bg-zinc-50 rounded-xl">
          <Truck size={48} className="text-zinc-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-zinc-900 mb-2">Немає доставок</h3>
          <p className="text-zinc-600">Ваші доставки з'являться тут</p>
        </div>
      )}
    </div>
  );
};

export default ShippingPage;
