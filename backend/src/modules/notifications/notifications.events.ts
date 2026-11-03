import { EventEmitter } from 'node:events';
import type { NotificationView } from './notifications.types.js';
export const notificationEvents = new EventEmitter<{ created: [NotificationView, string] }>();
