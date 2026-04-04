/**
 * BIBI Cars - OnSystemEvent Decorator
 * Marks methods as event handlers
 */

export const EVENT_HANDLER_METADATA = 'EVENT_HANDLER_METADATA';

export function OnSystemEvent(eventType: string) {
  return (target: any, key: string, descriptor: PropertyDescriptor) => {
    Reflect.defineMetadata(EVENT_HANDLER_METADATA, eventType, descriptor.value);
    return descriptor;
  };
}
