import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  cors: { 
    origin: '*',
    credentials: true,
  },
  namespace: '/notifications',
})
export class NotificationsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NotificationsGateway.name);

  handleConnection(client: Socket) {
    const userId = client.handshake.auth?.userId || client.handshake.query?.userId;
    const role = client.handshake.auth?.role || client.handshake.query?.role;

    this.logger.log(`Client connected: ${client.id}, userId: ${userId}, role: ${role}`);

    if (userId) {
      client.join(`user:${userId}`);
      this.logger.log(`Client ${client.id} joined room user:${userId}`);
    }

    if (role) {
      client.join(`role:${role}`);
      this.logger.log(`Client ${client.id} joined room role:${role}`);
    }

    // Join all-users room for broadcast
    client.join('all-users');
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('join-room')
  handleJoinRoom(client: Socket, payload: { room: string }) {
    client.join(payload.room);
    this.logger.log(`Client ${client.id} joined room ${payload.room}`);
    return { success: true, room: payload.room };
  }

  @SubscribeMessage('leave-room')
  handleLeaveRoom(client: Socket, payload: { room: string }) {
    client.leave(payload.room);
    this.logger.log(`Client ${client.id} left room ${payload.room}`);
    return { success: true, room: payload.room };
  }

  /**
   * Emit notification to specific user
   */
  emitToUser(userId: string, payload: any) {
    this.logger.log(`Emitting to user:${userId}`);
    this.server.to(`user:${userId}`).emit('notification', payload);
  }

  /**
   * Emit notification to all users with specific role
   */
  emitToRole(role: string, payload: any) {
    this.logger.log(`Emitting to role:${role}`);
    this.server.to(`role:${role}`).emit('notification', payload);
  }

  /**
   * Emit notification to all connected clients
   */
  emitToAll(payload: any) {
    this.logger.log('Emitting to all users');
    this.server.to('all-users').emit('notification', payload);
  }

  /**
   * Emit sound trigger event
   */
  emitSound(userId: string, soundKey: string) {
    this.logger.log(`Emitting sound ${soundKey} to user:${userId}`);
    this.server.to(`user:${userId}`).emit('play-sound', { soundKey });
  }

  /**
   * Emit sound to role
   */
  emitSoundToRole(role: string, soundKey: string) {
    this.logger.log(`Emitting sound ${soundKey} to role:${role}`);
    this.server.to(`role:${role}`).emit('play-sound', { soundKey });
  }

  /**
   * Get connected clients count
   */
  getConnectedClientsCount(): number {
    return this.server?.sockets?.sockets?.size || 0;
  }

  /**
   * Emit custom event to user
   */
  emitEventToUser(userId: string, event: string, payload: any) {
    this.logger.log(`Emitting ${event} to user:${userId}`);
    this.server.to(`user:${userId}`).emit(event, payload);
  }

  /**
   * Emit shipment status change to user
   */
  emitShipmentStatusChanged(userId: string, payload: any) {
    this.emitEventToUser(userId, 'shipment:status_changed', payload);
  }

  /**
   * Emit ETA change to user
   */
  emitEtaChanged(userId: string, payload: any) {
    this.emitEventToUser(userId, 'shipment:eta_changed', payload);
  }

  /**
   * Emit shipment arrived to user
   */
  emitShipmentArrived(userId: string, payload: any) {
    this.emitEventToUser(userId, 'shipment:arrived', payload);
  }
}
