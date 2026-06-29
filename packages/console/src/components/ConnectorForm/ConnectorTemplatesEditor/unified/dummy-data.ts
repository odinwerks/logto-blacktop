import type { DummyPayload } from './types';

/**
 * The hardcoded dummy runtime payload for the unified template preview (per task spec §6). The
 * preview resolves `{{code}}`, `{{email}}`, and `{{phone}}` against these values so an admin can
 * see how a sent message renders without triggering a real send. No UI to edit this — it is fixed
 * per the spec.
 */
export const dummyPayload: DummyPayload = Object.freeze({
  code: '000000',
  email: 'user@example.com',
  phone: '+1234567890',
});
