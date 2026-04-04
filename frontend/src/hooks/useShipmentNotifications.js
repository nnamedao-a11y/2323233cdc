/**
 * useShipmentNotifications Hook
 * 
 * Real-time WebSocket connection for shipment updates
 * 
 * Usage:
 * const { isConnected, lastUpdate, subscribe } = useShipmentNotifications();
 * 
 * useEffect(() => {
 *   subscribe(shipmentId);
 * }, [shipmentId]);
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import io from 'socket.io-client';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';
const WS_URL = BACKEND_URL.replace(/^http/, 'ws');

export function useShipmentNotifications() {
  const [isConnected, setIsConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [statusChanged, setStatusChanged] = useState(null);
  const [etaChanged, setEtaChanged] = useState(null);
  const socketRef = useRef(null);

  // Initialize socket connection
  useEffect(() => {
    const token = localStorage.getItem('token');
    
    if (!token) {
      console.log('No token, skipping WebSocket connection');
      return;
    }

    const socket = io(`${BACKEND_URL}/notifications`, {
      query: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    });

    socket.on('connect', () => {
      console.log('WebSocket connected');
      setIsConnected(true);
    });

    socket.on('disconnect', () => {
      console.log('WebSocket disconnected');
      setIsConnected(false);
    });

    // Listen for shipment status changes
    socket.on('shipment:status_changed', (data) => {
      console.log('Status changed:', data);
      setStatusChanged(data);
      setLastUpdate({ type: 'status', data, timestamp: new Date() });
    });

    // Listen for ETA changes
    socket.on('shipment:eta_changed', (data) => {
      console.log('ETA changed:', data);
      setEtaChanged(data);
      setLastUpdate({ type: 'eta', data, timestamp: new Date() });
    });

    // Listen for shipment arrived
    socket.on('shipment:arrived', (data) => {
      console.log('Shipment arrived:', data);
      setLastUpdate({ type: 'arrived', data, timestamp: new Date() });
    });

    // Listen for ready for pickup
    socket.on('shipment:ready_for_pickup', (data) => {
      console.log('Ready for pickup:', data);
      setLastUpdate({ type: 'ready', data, timestamp: new Date() });
    });

    // Generic notification
    socket.on('notification', (data) => {
      console.log('Notification:', data);
      setLastUpdate({ type: 'notification', data, timestamp: new Date() });
    });

    socket.on('error', (error) => {
      console.error('WebSocket error:', error);
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
    };
  }, []);

  // Subscribe to specific shipment
  const subscribe = useCallback((shipmentId) => {
    if (socketRef.current && isConnected) {
      socketRef.current.emit('subscribe:shipment', { shipmentId });
      console.log('Subscribed to shipment:', shipmentId);
    }
  }, [isConnected]);

  // Clear last update
  const clearUpdate = useCallback(() => {
    setLastUpdate(null);
    setStatusChanged(null);
    setEtaChanged(null);
  }, []);

  return {
    isConnected,
    lastUpdate,
    statusChanged,
    etaChanged,
    subscribe,
    clearUpdate,
  };
}

export default useShipmentNotifications;
