import { TemplateType } from '@logto/connector-kit';
import { SignInIdentifier } from '@logto/schemas';
import { pickDefault } from '@logto/shared/esm';

import koaEmailI18n from '#src/middleware/koa-email-i18n.js';
import type { ManagementApiRouter } from '#src/routes/types.js';
import type Libraries from '#src/tenants/Libraries.js';
import type Queries from '#src/tenants/Queries.js';
import type TenantContext from '#src/tenants/TenantContext.js';
import { MockTenant, type Partial2 } from '#src/test-utils/tenant.js';
import { createRequester } from '#src/utils/test-utils.js';

const { jest } = import.meta;

// Georgian (`ka`) is not a built-in Logto language and is not configured as a custom language
// in these tests, so an unsupported body `locale` falls back to the request-context locale.
const findAllCustomLanguageTags = jest.fn(async (): Promise<string[]> => []);
const findDefaultSignInExperience = jest.fn(async () => ({
  languageInfo: { autoDetect: false, fallbackLanguage: 'en' },
}));
const findUserById = jest.fn(async () => ({
  id: 'foo',
  // Differs from the requested phone so the identifier is treated as new (no client id needed).
  primaryPhone: '9999999999',
  primaryEmail: 'other@example.com',
}));
const insertVerificationRecord = jest.fn(async () => ({ expiresAt: Date.now() + 60_000 }));

const createPasscode = jest.fn(async () => ({
  id: 'passcode-id',
  code: '000000',
  phone: '8613123456789',
  type: TemplateType.BindNewIdentifier,
}));
const sendPasscode = jest.fn(async () => ({}));

// The mock functions below return partial shapes covering only the fields the route reads.
// They are cast through `unknown` so the loose jest return types satisfy `Partial2<Queries>` /
// `Partial2<Libraries>` without having to construct full entity fixtures.
const mockedQueries = {
  users: { findUserById },
  verificationRecords: { insert: insertVerificationRecord },
  customPhrases: { findAllCustomLanguageTags },
  signInExperiences: { findDefaultSignInExperience },
} as unknown as Partial2<Queries>;

const mockedLibraries = {
  passcodes: { createPasscode, sendPasscode },
} as unknown as Partial2<Libraries>;

const tenantContext = new MockTenant(undefined, mockedQueries, undefined, mockedLibraries);

const verificationRoutes = await pickDefault(import('./index.js'));

// The verification routes are mounted on the authenticated (user) router in production. We reuse
// the real `koaEmailI18n` middleware so `ctx.emailI18n` is populated exactly as in production —
// it resolves to the fallback `en` here (no `?lang=` query, cookie, or `Accept-Language` header).
const verificationRequest = createRequester({
  authedRoutes: [
    verificationRoutes as unknown as (router: ManagementApiRouter, tenant: TenantContext) => void,
  ],
  middlewares: [koaEmailI18n(tenantContext.queries)],
  tenantContext,
});

const phoneIdentifier = (value = '8613123456789') => ({ type: SignInIdentifier.Phone, value });

afterEach(() => {
  jest.clearAllMocks();
});

describe('POST /verifications/verification-code locale handling', () => {
  it('passes a supported body `locale` through to the connector payload', async () => {
    const response = await verificationRequest
      .post('/verifications/verification-code')
      .send({ identifier: phoneIdentifier(), locale: 'fr' });

    expect(response.status).toEqual(201);
    expect(sendPasscode).toHaveBeenCalledTimes(1);
    expect(sendPasscode).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ locale: 'fr' })
    );
  });

  it('normalizes a region body `locale` to its supported base tag (fr-CA -> fr)', async () => {
    const response = await verificationRequest
      .post('/verifications/verification-code')
      .send({ identifier: phoneIdentifier(), locale: 'fr-CA' });

    expect(response.status).toEqual(201);
    expect(sendPasscode).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ locale: 'fr' })
    );
  });

  it('keeps an exact custom-language tag (ka-GE stays ka-GE when configured)', async () => {
    // `ka-GE` is not a built-in language, but the tenant configured it as a custom language,
    // so it resolves exactly instead of falling back to the request-context locale. The
    // middleware and the route each call the query once, so queue the value twice.
    findAllCustomLanguageTags.mockResolvedValueOnce(['ka-GE']).mockResolvedValueOnce(['ka-GE']);

    const response = await verificationRequest
      .post('/verifications/verification-code')
      .send({ identifier: phoneIdentifier(), locale: 'ka-GE' });

    expect(response.status).toEqual(201);
    expect(sendPasscode).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ locale: 'ka-GE' })
    );
  });

  it('falls back to the request-context locale when no body `locale` is provided', async () => {
    const response = await verificationRequest
      .post('/verifications/verification-code')
      .send({ identifier: phoneIdentifier() });

    expect(response.status).toEqual(201);
    // No body `locale` -> `ctx.emailI18n` (resolved by `koaEmailI18n` to the fallback `en`) is used.
    expect(sendPasscode).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ locale: 'en' })
    );
  });

  it('falls back to the request-context locale when the body `locale` is unsupported', async () => {
    // `ka` and `xyz` are neither built-in nor configured custom languages, so the request-context
    // locale (resolved to `en` here) is kept instead of passing the tag through verbatim.
    for (const locale of ['ka', 'xyz']) {
      // eslint-disable-next-line no-await-in-loop
      const response = await verificationRequest
        .post('/verifications/verification-code')
        .send({ identifier: phoneIdentifier(), locale });

      expect(response.status).toEqual(201);
      expect(sendPasscode).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ locale: 'en' })
      );
    }
  });
});
