import { emailRegEx, phoneRegEx } from '@logto/core-kit';
import { z } from 'zod';

/**
 * Max length accepted for a user-supplied email address. A valid address is at most 254 chars
 * (RFC 5321); the cap is defense-in-depth for downstream address parsing in email connectors.
 */
export const emailIdentifierMaxLength = 256;
/** Max length accepted for a user-supplied phone number (E.164 allows at most 15 digits). */
export const phoneIdentifierMaxLength = 32;

export const emailIdentifierGuard = z.string().max(emailIdentifierMaxLength).regex(emailRegEx);
export const phoneIdentifierGuard = z.string().max(phoneIdentifierMaxLength).regex(phoneRegEx);
const codeGuard = z.string().min(1);

// Used when requesting Logto to send a verification code to email or phone
export const requestVerificationCodePayloadGuard = z.union([
  z.object({ email: emailIdentifierGuard }),
  z.object({ phone: phoneIdentifierGuard }),
]);

export type RequestVerificationCodePayload = z.infer<typeof requestVerificationCodePayloadGuard>;

export const emailVerificationCodePayloadGuard = z.object({
  email: emailIdentifierGuard,
  verificationCode: codeGuard,
});
export type EmailVerificationCodePayload = z.infer<typeof emailVerificationCodePayloadGuard>;

export const phoneVerificationCodePayloadGuard = z.object({
  phone: phoneIdentifierGuard,
  verificationCode: codeGuard,
});
export type PhoneVerificationCodePayload = z.infer<typeof phoneVerificationCodePayloadGuard>;

// Used when requesting Logto to verify the validity of a verification code
export const verifyVerificationCodePayloadGuard = z.union([
  emailVerificationCodePayloadGuard,
  phoneVerificationCodePayloadGuard,
]);

export type VerifyVerificationCodePayload =
  | EmailVerificationCodePayload
  | PhoneVerificationCodePayload;
