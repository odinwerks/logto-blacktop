import { describe, expect, it } from 'vitest';

import { SignInIdentifier } from '../foundations/index.js';

import {
  oneTimeTokenVerificationVerifyPayloadGuard,
  verificationCodeIdentifierGuard,
} from './interactions.js';
import {
  emailIdentifierMaxLength,
  phoneIdentifierMaxLength,
  requestVerificationCodePayloadGuard,
  verifyVerificationCodePayloadGuard,
} from './verification-code.js';

// The shape that made nodemailer's address parser stall for ~27 s (about 650 KB).
const pathologicalEmail = 'a' + '@b(c)'.repeat(130_000) + '.io';
const emailOfLength = (length: number) => 'a'.repeat(length - '@logto.io'.length) + '@logto.io';

describe('email and phone identifier length caps', () => {
  it('accepts an email address at the cap and rejects one past it', () => {
    expect(
      requestVerificationCodePayloadGuard.safeParse({
        email: emailOfLength(emailIdentifierMaxLength),
      }).success
    ).toBe(true);
    expect(
      requestVerificationCodePayloadGuard.safeParse({
        email: emailOfLength(emailIdentifierMaxLength + 1),
      }).success
    ).toBe(false);
  });

  it('rejects the pathological long address in every email guard', () => {
    expect(
      requestVerificationCodePayloadGuard.safeParse({ email: pathologicalEmail }).success
    ).toBe(false);
    expect(
      verifyVerificationCodePayloadGuard.safeParse({
        email: pathologicalEmail,
        verificationCode: '123456',
      }).success
    ).toBe(false);
    expect(
      verificationCodeIdentifierGuard.safeParse({
        type: SignInIdentifier.Email,
        value: pathologicalEmail,
      }).success
    ).toBe(false);
    expect(
      oneTimeTokenVerificationVerifyPayloadGuard.safeParse({
        identifier: { type: SignInIdentifier.Email, value: pathologicalEmail },
        token: 'token',
      }).success
    ).toBe(false);
  });

  it('accepts a phone number at the cap and rejects one past it', () => {
    const atCap = '1'.repeat(phoneIdentifierMaxLength);
    const pastCap = '1'.repeat(phoneIdentifierMaxLength + 1);

    expect(requestVerificationCodePayloadGuard.safeParse({ phone: atCap }).success).toBe(true);
    expect(requestVerificationCodePayloadGuard.safeParse({ phone: pastCap }).success).toBe(false);
    expect(
      verificationCodeIdentifierGuard.safeParse({ type: SignInIdentifier.Phone, value: atCap })
        .success
    ).toBe(true);
    expect(
      verificationCodeIdentifierGuard.safeParse({ type: SignInIdentifier.Phone, value: pastCap })
        .success
    ).toBe(false);
    expect(
      verifyVerificationCodePayloadGuard.safeParse({ phone: pastCap, verificationCode: '123456' })
        .success
    ).toBe(false);
  });
});
