/**
 * Ergonomic re-export of the useNotification hook.
 *
 * Allows imports like:
 *   import { useNotification } from '@/hooks/useNotification';
 * instead of reaching into the components tree.
 */
export { useNotification } from '../components/notifications/NotificationProvider';
