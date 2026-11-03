import { EventEmitter } from 'node:events';
import type { MessageView } from './messaging.types.js';
export const messagingEvents = new EventEmitter<{
  message: [MessageView, readonly string[]];
  read: [{ conversationId: string }, readonly string[]];
}>();
