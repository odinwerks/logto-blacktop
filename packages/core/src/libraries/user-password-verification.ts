import { type User, UsersPasswordEncryptionMethod } from '@logto/schemas';
import { differenceInDays } from 'date-fns';
import { argon2Verify, bcryptVerify, md5, sha1, sha256 } from 'hash-wasm';

import RequestError from '#src/errors/RequestError/index.js';
import type Queries from '#src/tenants/Queries.js';
import assertThat from '#src/utils/assert-that.js';
import { legacyVerify } from '#src/utils/password.js';

/**
 * Precomputed Argon2i hash for decoy verification. Matches `encryptPassword` defaults
 * (see `packages/core/src/workers/tasks/argon2i.ts`: iterations=8, memorySize=8*1024,
 * parallelism=1). Derived from `logto-decoy-do-not-use` with a fixed salt; never
 * accepted as a valid password.
 */
export const decoyArgon2Hash =
  '$argon2i$v=19$m=8192,t=8,p=1$bG9ndG8tZGVjb3ktc2FsdA$mH8wiuxK7kCjJZJRxvXCN5BxUczufmGgV1stRYErj6w';

const invalidCredentialsError = () =>
  new RequestError({ code: 'session.invalid_credentials', status: 422 });

/** Hash methods that reject wrong passwords much faster than Argon2i. */
const fastPasswordEncryptionMethods = new Set<UsersPasswordEncryptionMethod>([
  UsersPasswordEncryptionMethod.MD5,
  UsersPasswordEncryptionMethod.SHA1,
  UsersPasswordEncryptionMethod.SHA256,
  UsersPasswordEncryptionMethod.Legacy,
]);

export const shouldRunDecoyOnFailure = (
  passwordEncryptionMethod?: UsersPasswordEncryptionMethod
): boolean =>
  passwordEncryptionMethod === undefined ||
  fastPasswordEncryptionMethods.has(passwordEncryptionMethod);

export const runDecoyArgon2Verify = async (password: string): Promise<void> => {
  await argon2Verify({ password, hash: decoyArgon2Hash });
};

export const rejectInvalidCredentials = async (
  password: string,
  passwordEncryptionMethod?: UsersPasswordEncryptionMethod
): Promise<never> => {
  if (shouldRunDecoyOnFailure(passwordEncryptionMethod)) {
    await runDecoyArgon2Verify(password);
  }

  throw invalidCredentialsError();
};

type VerifyPasswordParams = {
  password: string;
  passwordEncrypted: string;
  passwordEncryptionMethod: UsersPasswordEncryptionMethod;
};

export const isPasswordValid = async ({
  password,
  passwordEncrypted,
  passwordEncryptionMethod,
}: VerifyPasswordParams): Promise<boolean> => {
  switch (passwordEncryptionMethod) {
    case UsersPasswordEncryptionMethod.Argon2i:
    case UsersPasswordEncryptionMethod.Argon2id:
    case UsersPasswordEncryptionMethod.Argon2d: {
      return argon2Verify({ password, hash: passwordEncrypted });
    }
    case UsersPasswordEncryptionMethod.MD5: {
      return (await md5(password)) === passwordEncrypted;
    }
    case UsersPasswordEncryptionMethod.SHA1: {
      return (await sha1(password)) === passwordEncrypted;
    }
    case UsersPasswordEncryptionMethod.SHA256: {
      return (await sha256(password)) === passwordEncrypted;
    }
    case UsersPasswordEncryptionMethod.Bcrypt: {
      return bcryptVerify({ password, hash: passwordEncrypted });
    }
    case UsersPasswordEncryptionMethod.Legacy: {
      return legacyVerify(passwordEncrypted, password);
    }
  }
};

export type PasswordExpirationReminder = {
  daysUntilExpiration: number;
};

export type PasswordExpirationResult =
  | {
      kind: 'success';
      user: User;
    }
  | {
      kind: 'reminder';
      user: User;
      reminder: PasswordExpirationReminder;
    };

/**
 * Checks the password expiration policy after the password has already been verified.
 *
 * Shared by every password sign-in path so a policy change cannot be bypassed through one
 * router. Callers keep this outside sentinel guards so expired passwords do not count as
 * failed credential attempts.
 *
 * @throws RequestError with 422 status if the password is already expired.
 * @throws RequestError with 500 status if the expiration policy is misconfigured.
 */
export const verifyPasswordExpiration = async (
  queries: Queries,
  user: User
): Promise<PasswordExpirationResult> => {
  const { passwordExpiration } = await queries.signInExperiences.findDefaultSignInExperience();

  if (!passwordExpiration.enabled) {
    return {
      kind: 'success',
      user,
    };
  }

  assertThat(
    passwordExpiration.validPeriodDays !== undefined && passwordExpiration.validPeriodDays > 0,
    new RequestError({
      code: 'sign_in_experiences.password_expiration_invalid_period_days',
      status: 500,
    })
  );

  // validPeriodDays is guaranteed to be defined and > 0 by the assertThat above
  const { validPeriodDays } = passwordExpiration;
  const referenceDate = new Date(user.passwordUpdatedAt ?? user.createdAt);
  const passwordAgeInDays = differenceInDays(new Date(), referenceDate);

  const isPasswordExpired = user.isPasswordExpired || passwordAgeInDays >= validPeriodDays;

  assertThat(!isPasswordExpired, new RequestError({ code: 'password.expired', status: 422 }));

  const reminderPeriodDays = passwordExpiration.reminderPeriodDays ?? 0;
  const reminderDaysUntilExpiration = validPeriodDays - passwordAgeInDays;

  const isInReminderWindow =
    reminderPeriodDays > 0 && reminderDaysUntilExpiration <= reminderPeriodDays;

  if (!isInReminderWindow) {
    return {
      kind: 'success',
      user,
    };
  }

  return {
    kind: 'reminder',
    user,
    reminder: {
      daysUntilExpiration: reminderDaysUntilExpiration,
    },
  };
};
