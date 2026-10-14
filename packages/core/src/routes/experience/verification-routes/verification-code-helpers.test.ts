/* eslint-disable max-lines -- sendCode locale/rate-guard and verifyCode audit scenarios share extensive mocks. */
import {
  defaultMessageRateLimitPolicy,
  InteractionEvent,
  MfaFactor,
  type Sentinel,
  SentinelActivityAction,
  SentinelDecision,
  SignInIdentifier,
  VerificationType,
} from '@logto/schemas';

import RequestError from '#src/errors/RequestError/index.js';
import type Libraries from '#src/tenants/Libraries.js';
import type Queries from '#src/tenants/Queries.js';
import { sensitiveDataMask } from '#src/utils/sensitive-data.js';

import type { EmailCodeVerification } from '../classes/verifications/code-verification.js';
import type { ExperienceInteractionRouterContext } from '../types.js';

type MockExperienceInteraction = {
  interactionEvent: InteractionEvent;
  identifiedUserId?: string;
  setVerificationRecord: jest.MockedFunction<() => Promise<void>>;
  save: jest.MockedFunction<() => Promise<void>>;
  signInExperienceValidator: {
    guardEmailBlocklist: jest.MockedFunction<() => Promise<void>>;
    isRegistrationDisabled: jest.MockedFunction<() => Promise<boolean>>;
  };
};

const { jest } = import.meta;

async function resolveVoid(): Promise<void> {
  await Promise.resolve();
}

const { sendCode, verifyCode, getMfaIdentifier } = await import('./verification-code-helpers.js');

// Provide a permissive activity store so the message rate guard allows sends by default.
const mockSentinelActivities = {
  countActivities: jest.fn().mockResolvedValue(0),
  insertActivity: jest.fn().mockImplementation(resolveVoid),
};

// `buildMessageRateGuard` reads the per-tenant override; default to none so the system policy applies.
const mockLogtoConfigs = {
  getMessageRateLimitOverride: jest.fn().mockResolvedValue(null),
};

// Hoisted so individual tests can queue a one-off language list via `mockResolvedValueOnce`.
const mockFindAllCustomLanguageTags = jest.fn().mockResolvedValue([]);

describe('sendCode parameter passing', () => {
  // To make a void callable function/method
  const mockSendVerificationCode = jest.fn().mockImplementation(resolveVoid);

  const mockCodeVerification = {
    id: 'helper-test-verification-id',
    sendVerificationCode: mockSendVerificationCode,
  } as unknown as EmailCodeVerification;

  const mockExperienceInteraction: MockExperienceInteraction = {
    interactionEvent: InteractionEvent.SignIn,
    setVerificationRecord: jest.fn().mockImplementation(resolveVoid),
    save: jest.fn().mockImplementation(resolveVoid),
    signInExperienceValidator: {
      guardEmailBlocklist: jest.fn().mockImplementation(resolveVoid),
      // Default: registration is enabled, so delivery is never suppressed for sign-in.
      isRegistrationDisabled: jest.fn().mockResolvedValue(false),
    },
  };

  const mockBuildVerificationCodeContext = jest.fn().mockImplementation(resolveVoid);
  const mockPasscodeLibrary = {
    buildVerificationCodeContext: mockBuildVerificationCodeContext,
  };

  const mockQueries = {
    sentinelActivities: mockSentinelActivities,
    logtoConfigs: mockLogtoConfigs,
    users: {
      hasUserWithEmail: jest.fn().mockResolvedValue(true),
      hasUserWithNormalizedPhone: jest.fn().mockResolvedValue(true),
    },
    customPhrases: {
      findAllCustomLanguageTags: mockFindAllCustomLanguageTags,
    },
    signInExperiences: {
      findDefaultSignInExperience: jest.fn().mockResolvedValue({
        languageInfo: { autoDetect: false, fallbackLanguage: 'en' },
      }),
    },
  } as unknown as Queries;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSendVerificationCode.mockImplementation(resolveVoid);
    mockExperienceInteraction.save.mockImplementation(resolveVoid);
    mockBuildVerificationCodeContext.mockResolvedValue({});
    // Restore the default: registration is enabled, so sign-in delivery is not suppressed.
    mockExperienceInteraction.signInExperienceValidator.isRegistrationDisabled.mockResolvedValue(
      false
    );
  });

  it('should pass ctx.request.ip to sendVerificationCode', async () => {
    const SAMPLE_IP = '192.168.1.225';

    const ctx = {
      request: { ip: SAMPLE_IP },
      createLog: jest.fn(() => ({ append: jest.fn().mockImplementation(resolveVoid) })),
      experienceInteraction: mockExperienceInteraction,
      emailI18n: { locale: 'jp' },
    };

    // Only verify the ip parameter so use never to ignore others at here to bypass type check
    const libraries = { passcodes: mockPasscodeLibrary } as unknown as Partial<Libraries>;
    await sendCode({
      identifier: { type: SignInIdentifier.Phone, value: '+8613123456789' },
      createVerificationRecord: () => mockCodeVerification,
      libraries: libraries as unknown as Libraries,
      queries: mockQueries,
      ctx: ctx as unknown as ExperienceInteractionRouterContext,
    });

    expect(mockSendVerificationCode).toHaveBeenCalledWith(
      expect.objectContaining({
        ip: SAMPLE_IP,
      }),
      expect.objectContaining({
        skipDelivery: false,
      })
    );
  });

  it('should pass ctx.emailI18n.locale (resolved from ?lang=) to sendVerificationCode payload', async () => {
    // Simulates the email-i18n middleware having resolved `?lang=ka` to `locale: 'ka'`.
    const ctx = {
      request: { ip: '127.0.0.1' },
      createLog: jest.fn(() => ({ append: jest.fn().mockImplementation(resolveVoid) })),
      experienceInteraction: mockExperienceInteraction,
      emailI18n: { locale: 'ka' },
    };

    const libraries = { passcodes: mockPasscodeLibrary } as unknown as Partial<Libraries>;
    await sendCode({
      identifier: { type: SignInIdentifier.Email, value: 'test@example.com' },
      interactionEvent: InteractionEvent.SignIn,
      createVerificationRecord: () => mockCodeVerification,
      libraries: libraries as unknown as Libraries,
      queries: mockQueries,
      ctx: ctx as unknown as ExperienceInteractionRouterContext,
    });

    expect(mockSendVerificationCode).toHaveBeenCalledWith(
      expect.objectContaining({ locale: 'ka' }),
      expect.objectContaining({ skipDelivery: false })
    );
  });

  it('should normalize a supported region-tagged body locale to its base tag (fr-CA -> fr)', async () => {
    const ctx = {
      request: { ip: '127.0.0.1' },
      query: {},
      createLog: jest.fn(() => ({ append: jest.fn().mockImplementation(resolveVoid) })),
      experienceInteraction: mockExperienceInteraction,
      emailI18n: { locale: 'en' },
    };

    const libraries = { passcodes: mockPasscodeLibrary } as unknown as Partial<Libraries>;
    await sendCode({
      identifier: { type: SignInIdentifier.Email, value: 'test@example.com' },
      interactionEvent: InteractionEvent.SignIn,
      locale: 'fr-CA',
      createVerificationRecord: () => mockCodeVerification,
      libraries: libraries as unknown as Libraries,
      queries: mockQueries,
      ctx: ctx as unknown as ExperienceInteractionRouterContext,
    });

    expect(mockSendVerificationCode).toHaveBeenCalledWith(
      expect.objectContaining({ locale: 'fr' }),
      expect.objectContaining({ skipDelivery: false })
    );
  });

  it('should pass the body locale through when it is a supported base tag', async () => {
    const ctx = {
      request: { ip: '127.0.0.1' },
      query: {},
      createLog: jest.fn(() => ({ append: jest.fn().mockImplementation(resolveVoid) })),
      experienceInteraction: mockExperienceInteraction,
      emailI18n: { locale: 'en' },
    };

    const libraries = { passcodes: mockPasscodeLibrary } as unknown as Partial<Libraries>;
    await sendCode({
      identifier: { type: SignInIdentifier.Email, value: 'test@example.com' },
      interactionEvent: InteractionEvent.SignIn,
      locale: 'de',
      createVerificationRecord: () => mockCodeVerification,
      libraries: libraries as unknown as Libraries,
      queries: mockQueries,
      ctx: ctx as unknown as ExperienceInteractionRouterContext,
    });

    expect(mockSendVerificationCode).toHaveBeenCalledWith(
      expect.objectContaining({ locale: 'de' }),
      expect.objectContaining({ skipDelivery: false })
    );
  });

  it('should keep an exact custom-language tag (ka-GE stays ka-GE when configured)', async () => {
    // `ka-GE` is not a built-in language, but the tenant configured it as a custom language,
    // so it resolves exactly instead of falling back to the request-context locale.
    mockFindAllCustomLanguageTags.mockResolvedValueOnce(['ka-GE']);

    const ctx = {
      request: { ip: '127.0.0.1' },
      query: {},
      createLog: jest.fn(() => ({ append: jest.fn().mockImplementation(resolveVoid) })),
      experienceInteraction: mockExperienceInteraction,
      emailI18n: { locale: 'en' },
    };

    const libraries = { passcodes: mockPasscodeLibrary } as unknown as Partial<Libraries>;
    await sendCode({
      identifier: { type: SignInIdentifier.Email, value: 'test@example.com' },
      interactionEvent: InteractionEvent.SignIn,
      locale: 'ka-GE',
      createVerificationRecord: () => mockCodeVerification,
      libraries: libraries as unknown as Libraries,
      queries: mockQueries,
      ctx: ctx as unknown as ExperienceInteractionRouterContext,
    });

    expect(mockSendVerificationCode).toHaveBeenCalledWith(
      expect.objectContaining({ locale: 'ka-GE' }),
      expect.objectContaining({ skipDelivery: false })
    );
  });

  it('should override ctx.emailI18n.locale only with a supported body locale', async () => {
    const ctx = {
      request: { ip: '127.0.0.1' },
      query: {},
      createLog: jest.fn(() => ({ append: jest.fn().mockImplementation(resolveVoid) })),
      experienceInteraction: mockExperienceInteraction,
      emailI18n: { locale: 'ja' },
    };

    const libraries = { passcodes: mockPasscodeLibrary } as unknown as Partial<Libraries>;
    await sendCode({
      identifier: { type: SignInIdentifier.Email, value: 'test@example.com' },
      interactionEvent: InteractionEvent.SignIn,
      locale: 'fr',
      createVerificationRecord: () => mockCodeVerification,
      libraries: libraries as unknown as Libraries,
      queries: mockQueries,
      ctx: ctx as unknown as ExperienceInteractionRouterContext,
    });

    expect(mockSendVerificationCode).toHaveBeenCalledWith(
      expect.objectContaining({ locale: 'fr' }),
      expect.objectContaining({ skipDelivery: false })
    );
  });

  it('should keep the request-context locale when the body locale is not supported', async () => {
    const ctx = {
      request: { ip: '127.0.0.1' },
      query: {},
      createLog: jest.fn(() => ({ append: jest.fn().mockImplementation(resolveVoid) })),
      experienceInteraction: mockExperienceInteraction,
      emailI18n: { locale: 'ja' },
    };

    const libraries = { passcodes: mockPasscodeLibrary } as unknown as Partial<Libraries>;
    await sendCode({
      identifier: { type: SignInIdentifier.Email, value: 'test@example.com' },
      interactionEvent: InteractionEvent.SignIn,
      // `ka` is neither a built-in nor a configured custom language.
      locale: 'ka',
      createVerificationRecord: () => mockCodeVerification,
      libraries: libraries as unknown as Libraries,
      queries: mockQueries,
      ctx: ctx as unknown as ExperienceInteractionRouterContext,
    });

    expect(mockSendVerificationCode).toHaveBeenCalledWith(
      expect.objectContaining({ locale: 'ja' }),
      expect.objectContaining({ skipDelivery: false })
    );
  });

  it('should normalize the body locale in MFA-style calls (no interactionEvent)', async () => {
    const ctx = {
      request: { ip: '127.0.0.1' },
      query: {},
      createLog: jest.fn(() => ({ append: jest.fn().mockImplementation(resolveVoid) })),
      experienceInteraction: mockExperienceInteraction,
      emailI18n: { locale: 'en' },
    };

    const libraries = { passcodes: mockPasscodeLibrary } as unknown as Partial<Libraries>;
    await sendCode({
      identifier: { type: SignInIdentifier.Email, value: 'test@example.com' },
      // MFA flows do not pass interactionEvent
      locale: 'pt-BR',
      createVerificationRecord: () => mockCodeVerification,
      libraries: libraries as unknown as Libraries,
      queries: mockQueries,
      ctx: ctx as unknown as ExperienceInteractionRouterContext,
    });

    expect(mockSendVerificationCode).toHaveBeenCalledWith(
      expect.objectContaining({ locale: 'pt-BR' }),
      expect.objectContaining({ skipDelivery: false })
    );
  });

  it('should keep the request-context locale for an unsupported body locale in MFA-style calls', async () => {
    const ctx = {
      request: { ip: '127.0.0.1' },
      query: {},
      createLog: jest.fn(() => ({ append: jest.fn().mockImplementation(resolveVoid) })),
      experienceInteraction: mockExperienceInteraction,
      emailI18n: { locale: 'en' },
    };

    const libraries = { passcodes: mockPasscodeLibrary } as unknown as Partial<Libraries>;
    await sendCode({
      identifier: { type: SignInIdentifier.Phone, value: '+8613123456789' },
      // MFA flows do not pass interactionEvent
      locale: 'xyz',
      createVerificationRecord: () => mockCodeVerification,
      libraries: libraries as unknown as Libraries,
      queries: mockQueries,
      ctx: ctx as unknown as ExperienceInteractionRouterContext,
    });

    expect(mockSendVerificationCode).toHaveBeenCalledWith(
      expect.objectContaining({ locale: 'en' }),
      expect.objectContaining({ skipDelivery: false })
    );
  });

  it('should skip delivery for forgot-password with non-existing email user', async () => {
    const mockQueriesNoUser = {
      sentinelActivities: mockSentinelActivities,
      logtoConfigs: mockLogtoConfigs,
      users: {
        hasUserWithEmail: jest.fn().mockResolvedValue(false),
        hasUserWithNormalizedPhone: jest.fn().mockResolvedValue(false),
      },
    } as unknown as Queries;

    const ctx = {
      request: { ip: '127.0.0.1' },
      createLog: jest.fn(() => ({ append: jest.fn().mockImplementation(resolveVoid) })),
      experienceInteraction: {
        ...mockExperienceInteraction,
        interactionEvent: InteractionEvent.ForgotPassword,
      },
      emailI18n: {},
    };

    const libraries = { passcodes: mockPasscodeLibrary } as unknown as Partial<Libraries>;
    await sendCode({
      identifier: { type: SignInIdentifier.Email, value: 'nonexistent@example.com' },
      interactionEvent: InteractionEvent.ForgotPassword,
      createVerificationRecord: () => mockCodeVerification,
      libraries: libraries as unknown as Libraries,
      queries: mockQueriesNoUser,
      ctx: ctx as unknown as ExperienceInteractionRouterContext,
    });

    expect(mockQueriesNoUser.users.hasUserWithEmail).toHaveBeenCalledWith(
      'nonexistent@example.com'
    );
    expect(mockBuildVerificationCodeContext).not.toHaveBeenCalled();
    expect(mockSendVerificationCode).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ skipDelivery: true })
    );
    // The suppressed send still passes through the rate guard so it counts toward the cap.
    expect(mockSentinelActivities.countActivities).toHaveBeenCalled();
  });

  it('should not skip delivery for forgot-password with existing user', async () => {
    const mockQueriesWithUser = {
      sentinelActivities: mockSentinelActivities,
      logtoConfigs: mockLogtoConfigs,
      users: {
        hasUserWithEmail: jest.fn().mockResolvedValue(true),
        hasUserWithNormalizedPhone: jest.fn().mockResolvedValue(true),
      },
    } as unknown as Queries;

    const ctx = {
      request: { ip: '127.0.0.1' },
      createLog: jest.fn(() => ({ append: jest.fn().mockImplementation(resolveVoid) })),
      experienceInteraction: {
        ...mockExperienceInteraction,
        interactionEvent: InteractionEvent.ForgotPassword,
      },
      emailI18n: {},
    };

    const libraries = { passcodes: mockPasscodeLibrary } as unknown as Partial<Libraries>;
    await sendCode({
      identifier: { type: SignInIdentifier.Phone, value: '+8613123456789' },
      interactionEvent: InteractionEvent.ForgotPassword,
      createVerificationRecord: () => mockCodeVerification,
      libraries: libraries as unknown as Libraries,
      queries: mockQueriesWithUser,
      ctx: ctx as unknown as ExperienceInteractionRouterContext,
    });

    expect(mockQueriesWithUser.users.hasUserWithNormalizedPhone).toHaveBeenCalledWith(
      '+8613123456789'
    );
    expect(mockSendVerificationCode).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ skipDelivery: false })
    );
  });

  it('should not check user existence for non-ForgotPassword events', async () => {
    const mockQueriesTracking = {
      sentinelActivities: mockSentinelActivities,
      logtoConfigs: mockLogtoConfigs,
      users: {
        hasUserWithEmail: jest.fn().mockResolvedValue(false),
        hasUserWithNormalizedPhone: jest.fn().mockResolvedValue(false),
      },
    } as unknown as Queries;

    const ctx = {
      request: { ip: '127.0.0.1' },
      createLog: jest.fn(() => ({ append: jest.fn().mockImplementation(resolveVoid) })),
      experienceInteraction: mockExperienceInteraction,
      emailI18n: {},
    };

    const libraries = { passcodes: mockPasscodeLibrary } as unknown as Partial<Libraries>;
    await sendCode({
      identifier: { type: SignInIdentifier.Email, value: 'test@example.com' },
      interactionEvent: InteractionEvent.SignIn,
      createVerificationRecord: () => mockCodeVerification,
      libraries: libraries as unknown as Libraries,
      queries: mockQueriesTracking,
      ctx: ctx as unknown as ExperienceInteractionRouterContext,
    });

    expect(mockQueriesTracking.users.hasUserWithEmail).not.toHaveBeenCalled();
    expect(mockSendVerificationCode).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ skipDelivery: false })
    );
  });

  it('rejects with 429 and does not send when the recipient is over the rate-limit cap', async () => {
    // Simulate the per-recipient cap being reached for the default policy.
    mockSentinelActivities.countActivities.mockResolvedValueOnce(
      defaultMessageRateLimitPolicy.maxSendsPerRecipient
    );

    const ctx = {
      request: { ip: '127.0.0.1' },
      createLog: jest.fn(() => ({ append: jest.fn().mockImplementation(resolveVoid) })),
      appendExceptionHookContext: jest.fn(),
      experienceInteraction: mockExperienceInteraction,
      emailI18n: {},
    };
    const libraries = { passcodes: mockPasscodeLibrary } as unknown as Partial<Libraries>;

    await expect(
      sendCode({
        identifier: { type: SignInIdentifier.Email, value: 'spammed@example.com' },
        interactionEvent: InteractionEvent.SignIn,
        createVerificationRecord: () => mockCodeVerification,
        libraries: libraries as unknown as Libraries,
        queries: mockQueries,
        ctx: ctx as unknown as ExperienceInteractionRouterContext,
      })
    ).rejects.toMatchObject({ code: 'request.message_rate_limited', status: 429 });

    expect(mockSendVerificationCode).not.toHaveBeenCalled();
    // The throttle emits the `Message.RateLimited` exception hook for webhook delivery.
    expect(ctx.appendExceptionHookContext).toHaveBeenCalledWith('Message.RateLimited', {
      action: SentinelActivityAction.VerificationCodeSend,
      recipient: 'spammed@example.com',
    });
  });

  const buildUnknownUserQueries = () =>
    ({
      sentinelActivities: mockSentinelActivities,
      logtoConfigs: mockLogtoConfigs,
      users: {
        hasUserWithEmail: jest.fn().mockResolvedValue(false),
        hasUserWithNormalizedPhone: jest.fn().mockResolvedValue(false),
      },
    }) as unknown as Queries;

  it('rejects with 429 for a suppressed send over the cap, so suppression cannot be enumerated', async () => {
    // Forgot-password to an unknown user suppresses delivery, but the send must still be rate-limited:
    // hitting the cap here proves an unregistered recipient is throttled exactly like a registered one.
    mockSentinelActivities.countActivities.mockResolvedValueOnce(
      defaultMessageRateLimitPolicy.maxSendsPerRecipient
    );

    const ctx = {
      request: { ip: '127.0.0.1' },
      createLog: jest.fn(() => ({ append: jest.fn().mockImplementation(resolveVoid) })),
      appendExceptionHookContext: jest.fn(),
      experienceInteraction: {
        ...mockExperienceInteraction,
        interactionEvent: InteractionEvent.ForgotPassword,
      },
      emailI18n: {},
    };
    const libraries = { passcodes: mockPasscodeLibrary } as unknown as Partial<Libraries>;

    await expect(
      sendCode({
        identifier: { type: SignInIdentifier.Email, value: 'unknown@example.com' },
        interactionEvent: InteractionEvent.ForgotPassword,
        createVerificationRecord: () => mockCodeVerification,
        libraries: libraries as unknown as Libraries,
        queries: buildUnknownUserQueries(),
        ctx: ctx as unknown as ExperienceInteractionRouterContext,
      })
    ).rejects.toMatchObject({ code: 'request.message_rate_limited', status: 429 });

    // The guard rejects before the (suppressed) send runs, and the throttle still emits the hook.
    expect(mockSendVerificationCode).not.toHaveBeenCalled();
    expect(ctx.appendExceptionHookContext).toHaveBeenCalledWith('Message.RateLimited', {
      action: SentinelActivityAction.VerificationCodeSend,
      recipient: 'unknown@example.com',
    });
  });

  it('masks the submitted code in the audit log payload', async () => {
    const append = jest.fn().mockImplementation(resolveVoid);
    const codeVerificationRecord = {
      id: 'verification-id',
      identifier: { type: SignInIdentifier.Email, value: 'test@example.com' },
      verify: jest.fn().mockImplementation(resolveVoid),
    };
    const ctx = {
      request: { ip: '127.0.0.1' },
      i18n: { languages: ['en'] },
      createLog: jest.fn(() => ({ append })),
      appendExceptionHookContext: jest.fn(),
      experienceInteraction: {
        interactionEvent: InteractionEvent.SignIn,
        getVerificationRecordByTypeAndId: jest.fn(() => codeVerificationRecord),
        save: jest.fn().mockImplementation(resolveVoid),
      },
    };
    const sentinel = {
      reportActivity: jest.fn(async () => [SentinelDecision.Allowed, Date.now() + 60_000] as const),
    };

    await verifyCode({
      verificationId: 'verification-id',
      code: '123456',
      identifier: { type: SignInIdentifier.Email, value: 'test@example.com' },
      verificationType: VerificationType.EmailVerificationCode,
      sentinel: sentinel as unknown as Sentinel,
      queries: mockQueries,
      ctx: ctx as unknown as ExperienceInteractionRouterContext,
    });

    expect(append).toHaveBeenCalledWith({
      payload: {
        identifier: { type: SignInIdentifier.Email, value: 'test@example.com' },
        verificationId: 'verification-id',
        code: sensitiveDataMask,
      },
    });
    expect(ctx.experienceInteraction.save).toHaveBeenCalled();
  });

  const buildSignInCtx = (
    experienceInteraction: MockExperienceInteraction = mockExperienceInteraction
  ) => ({
    request: { ip: '127.0.0.1' },
    createLog: jest.fn(() => ({ append: jest.fn().mockImplementation(resolveVoid) })),
    appendExceptionHookContext: jest.fn(),
    experienceInteraction,
    emailI18n: {},
  });

  it('skips delivery for sign-in to an unknown recipient when registration is disabled', async () => {
    mockExperienceInteraction.signInExperienceValidator.isRegistrationDisabled.mockResolvedValueOnce(
      true
    );
    const ctx = buildSignInCtx();
    const libraries = { passcodes: mockPasscodeLibrary } as unknown as Partial<Libraries>;

    await sendCode({
      identifier: { type: SignInIdentifier.Email, value: 'stranger@example.com' },
      interactionEvent: InteractionEvent.SignIn,
      createVerificationRecord: () => mockCodeVerification,
      libraries: libraries as unknown as Libraries,
      queries: buildUnknownUserQueries(),
      ctx: ctx as unknown as ExperienceInteractionRouterContext,
    });

    // The passcode record is still created and nothing is delivered, but the rate guard still runs:
    // a suppressed send must consume the recipient's quota so registration status cannot be probed.
    expect(mockSendVerificationCode).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ skipDelivery: true })
    );
    expect(mockSentinelActivities.countActivities).toHaveBeenCalled();
  });

  it('delivers for sign-in to an unknown recipient when registration is enabled', async () => {
    mockExperienceInteraction.signInExperienceValidator.isRegistrationDisabled.mockResolvedValueOnce(
      false
    );
    const ctx = buildSignInCtx();
    const libraries = { passcodes: mockPasscodeLibrary } as unknown as Partial<Libraries>;

    await sendCode({
      identifier: { type: SignInIdentifier.Email, value: 'newcomer@example.com' },
      interactionEvent: InteractionEvent.SignIn,
      createVerificationRecord: () => mockCodeVerification,
      libraries: libraries as unknown as Libraries,
      queries: buildUnknownUserQueries(),
      ctx: ctx as unknown as ExperienceInteractionRouterContext,
    });

    expect(mockSendVerificationCode).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ skipDelivery: false })
    );
  });

  it('delivers for sign-in binding when a user is already identified, even with registration disabled', async () => {
    // Binding a new MFA identifier: identified session, unknown recipient, registration disabled.
    mockExperienceInteraction.signInExperienceValidator.isRegistrationDisabled.mockResolvedValueOnce(
      true
    );
    const identifiedInteraction: MockExperienceInteraction = {
      ...mockExperienceInteraction,
      identifiedUserId: 'identified-user-id',
    };
    const ctx = buildSignInCtx(identifiedInteraction);
    const libraries = { passcodes: mockPasscodeLibrary } as unknown as Partial<Libraries>;

    await sendCode({
      identifier: { type: SignInIdentifier.Email, value: 'binding@example.com' },
      interactionEvent: InteractionEvent.SignIn,
      createVerificationRecord: () => mockCodeVerification,
      libraries: libraries as unknown as Libraries,
      queries: buildUnknownUserQueries(),
      ctx: ctx as unknown as ExperienceInteractionRouterContext,
    });

    expect(mockSendVerificationCode).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ skipDelivery: false })
    );
    // The identified-session guard short-circuits before consulting the registration mode.
    expect(
      mockExperienceInteraction.signInExperienceValidator.isRegistrationDisabled
    ).not.toHaveBeenCalled();
  });
});

describe('getMfaIdentifier', () => {
  const findUserById = jest
    .fn()
    .mockResolvedValue({ primaryEmail: 'foo@example.com', primaryPhone: '+11234567890' });
  const queries = { users: { findUserById } } as unknown as Queries;

  beforeEach(() => {
    findUserById.mockClear();
  });

  const buildInteraction = (factors: MfaFactor[]) =>
    ({
      identifiedUserId: 'identified-user-id',
      subjectUserId: 'identified-user-id',
      signInExperienceValidator: { getMfaSettings: jest.fn().mockResolvedValue({ factors }) },
    }) as unknown as Parameters<typeof getMfaIdentifier>[0]['experienceInteraction'];

  it('resolves the primary contact of the identified user when the factor is enabled', async () => {
    await expect(
      getMfaIdentifier({
        identifierType: SignInIdentifier.Email,
        experienceInteraction: buildInteraction([MfaFactor.EmailVerificationCode]),
        queries,
      })
    ).resolves.toEqual({ type: SignInIdentifier.Email, value: 'foo@example.com' });
  });

  it.each([
    [SignInIdentifier.Email, [MfaFactor.PhoneVerificationCode]],
    [SignInIdentifier.Phone, [MfaFactor.EmailVerificationCode]],
    [SignInIdentifier.Email, []],
  ] as const)(
    'refuses a %s code when the sign-in experience does not enable that factor',
    async (identifierType, factors) => {
      await expect(
        getMfaIdentifier({
          identifierType,
          experienceInteraction: buildInteraction([...factors]),
          queries,
        })
      ).rejects.toMatchError(
        new RequestError({ code: 'session.mfa.mfa_factor_not_enabled', status: 400 })
      );
      expect(findUserById).not.toHaveBeenCalled();
    }
  );

  it('refuses a code before any user is identified', async () => {
    await expect(
      getMfaIdentifier({
        identifierType: SignInIdentifier.Email,
        experienceInteraction: {
          identifiedUserId: undefined,
        } as unknown as Parameters<typeof getMfaIdentifier>[0]['experienceInteraction'],
        queries,
      })
    ).rejects.toMatchError(new RequestError({ code: 'session.identifier_not_found', status: 400 }));
  });
});
/* eslint-enable max-lines */
