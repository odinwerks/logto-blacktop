import { GoogleConnector } from '@logto/connector-kit';
import type { ExperienceSocialConnector } from '@logto/schemas';
import { ConnectorPlatform, experienceSocialStatePrefix } from '@logto/schemas';
import { trySafe } from '@silverhand/essentials';
import { getCookie } from 'tiny-cookie';

import { SearchParameters } from '@/types';
import { generateRandomString } from '@/utils';
import { getLogtoNativeSdk, isNativeWebview } from '@/utils/native-sdk';
import { isValidWebRedirectUri } from '@/utils/url-scheme';

/**
 * Social Connector State Utility Methods
 */

const storageStateKeyPrefix = 'social_auth_state';

/**
 * Generate a random OAuth `state` for social and SSO sign-in.
 *
 * The random part is base64url-encoded, whose alphabet overlaps with the Account Center state
 * prefix. The Experience prefix keeps the two namespaces disjoint so that Logto Core can route
 * the shared `/callback/:connectorId` URI by the `state` prefix without ambiguity.
 */
export const generateState = () => `${experienceSocialStatePrefix}${generateRandomString()}`;

export const storeState = (state: string, connectorId: string) => {
  sessionStorage.setItem(`${storageStateKeyPrefix}:${connectorId}`, state);
};

const deleteState = (connectorId: string) => {
  const storageKey = `${storageStateKeyPrefix}:${connectorId}`;
  sessionStorage.removeItem(storageKey);
};

export type StateValidationResult = 'match' | 'missing' | 'mismatch';

/**
 * Validate the state parameter from the social connector callback.
 * Returns a tri-state result distinguishing "session lost" from "state mismatch".
 *
 * Callers must guard against `undefined` state before calling this function.
 *
 * @param state - The state parameter from the callback URL (must be defined).
 * @param connectorId - The connector id used to look up the stored state.
 * @returns `'match'` if valid, `'missing'` if session lost, `'mismatch'` if tampered.
 */
export const validateState = (state: string, connectorId: string): StateValidationResult => {
  const storageKey = `${storageStateKeyPrefix}:${connectorId}`;
  const stateStorage = sessionStorage.getItem(storageKey);
  deleteState(connectorId);

  if (stateStorage === null) {
    return 'missing';
  }

  return stateStorage === state ? 'match' : 'mismatch';
};

const validateGoogleOneTapCsrfToken = (csrfToken?: string): boolean =>
  Boolean(csrfToken && getCookie(GoogleConnector.oneTapParams.csrfToken) === csrfToken);

/**
 * Validate a Google One Tap credential (both external and experience-built-in).
 *
 * - External credentials (from host website): already verified by Google, always valid.
 * - Experience built-in: validates the CSRF cookie token.
 *
 * @returns A discriminated result — `{ valid: true }` or `{ valid: false, error }`.
 */
export const validateGoogleOneTapCredential = ({
  isExternalCredential,
  params,
}: {
  isExternalCredential: boolean;
  params: Record<string, string>;
}): { valid: true } | { valid: false; error: 'invalid_connector_auth' } => {
  // External Google One Tap — credential already verified by Google
  if (isExternalCredential) {
    return { valid: true };
  }

  // Experience built-in Google One Tap — validate CSRF cookie token
  const csrfToken = params[GoogleConnector.oneTapParams.csrfToken];

  if (!validateGoogleOneTapCsrfToken(csrfToken)) {
    return { valid: false, error: 'invalid_connector_auth' };
  }

  return { valid: true };
};

/**
 * Native Social Redirect Utility Methods
 */
export const storageCallbackLinkKeyPrefix = 'social_callback_data';

export const buildSocialLandingUri = (path: string, redirectTo: string) => {
  const { origin } = window.location;
  const url = new URL(`${origin}${path}`);
  url.searchParams.set(SearchParameters.RedirectTo, redirectTo);

  const callbackLink = getLogtoNativeSdk()?.callbackLink;

  if (callbackLink) {
    url.searchParams.set(SearchParameters.NativeCallbackLink, callbackLink);
  }

  return url;
};

export const storeCallbackLink = (connectorId: string, callbackLink: string) => {
  sessionStorage.setItem(`${storageCallbackLinkKeyPrefix}:${connectorId}`, callbackLink);
};

export const getCallbackLinkFromStorage = (connectorId: string) => {
  return sessionStorage.getItem(`${storageCallbackLinkKeyPrefix}:${connectorId}`);
};

export const removeCallbackLinkFromStorage = (connectorId: string) => {
  sessionStorage.removeItem(`${storageCallbackLinkKeyPrefix}:${connectorId}`);
};

/**
 * Whether the value is the admin Console "link social account" web callback,
 * `<console origin>/handle-social`.
 *
 * `/springboard` plants this link so that the social callback can relay the OAuth response to
 * Console. Only `http(s)` URLs on the Console origin are trusted: the same origin as this app
 * for OSS deployments, or the `cloud.*` counterpart of the `auth.*` endpoint on Logto Cloud
 * (mirroring `adminTenantEndpoint`'s `cloud.` -> `auth.` mapping in Console), plus any loopback
 * port for local development where Console (Vite) and Experience are served separately. An
 * arbitrary attacker-supplied URL is rejected, so the relay cannot leak `code` + `state`.
 */
export const isValidConsoleCallbackLink = (link: string): boolean => {
  const url = trySafe(() => new URL(link));

  if (!url || url.pathname !== '/handle-social' || !isValidWebRedirectUri(link)) {
    return false;
  }

  const { origin, hostname } = window.location;

  if (url.origin === origin || url.origin === origin.replace('://auth.', '://cloud.')) {
    return true;
  }

  return (
    url.hostname === hostname &&
    (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]')
  );
};

/**
 * Social Connectors Filter Utility Methods
 */
export const filterSocialConnectors = (socialConnectors?: ExperienceSocialConnector[]) => {
  if (!socialConnectors) {
    return [];
  }

  const connectorMap = new Map<string, ExperienceSocialConnector>();

  /**
   * Browser Environment
   * Accepts both web and universal platform connectors.
   * Insert universal connectors only if there is no web platform connector provided with the same target.
   * Web platform has higher priority.
   **/

  if (!isNativeWebview()) {
    for (const connector of socialConnectors) {
      const { platform, target } = connector;

      if (platform === ConnectorPlatform.Native) {
        continue;
      }

      if (platform === ConnectorPlatform.Web || !connectorMap.get(target)) {
        connectorMap.set(target, connector);
        continue;
      }
    }

    return Array.from(connectorMap.values());
  }

  /**
   * Native Webview Environment
   * Accepts both native and universal platform connectors.
   * Native platform has higher priority.
   **/

  const { supportedConnector, getPostMessage, callbackLink } = getLogtoNativeSdk() ?? {};

  if (!getPostMessage) {
    // Invalid Native SDK bridge injections, not able to sign in with any social connectors.
    return [];
  }

  for (const connector of socialConnectors) {
    const { platform, target } = connector;

    if (platform === ConnectorPlatform.Web) {
      continue;
    }

    // Native SupportedConnector Settings is required
    if (!supportedConnector) {
      continue;
    }

    // Native supported nativeTargets flag is required
    if (
      platform === ConnectorPlatform.Native &&
      supportedConnector.nativeTargets.includes(target)
    ) {
      connectorMap.set(target, connector);
      continue;
    }

    /**
     *  Native supportedConnector.universal flag is required
     *  Native callback link settings is required
     *  Only if there is no native platform connector provided with the same target.
     **/
    if (
      platform === ConnectorPlatform.Universal &&
      supportedConnector.universal &&
      callbackLink &&
      !connectorMap.get(target)
    ) {
      connectorMap.set(target, connector);
      continue;
    }
  }

  return Array.from(connectorMap.values());
};

/**
 * Social Connectors Filter Utility Methods used in preview mode only
 */
export const filterPreviewSocialConnectors = (
  platform: ConnectorPlatform.Native | ConnectorPlatform.Web,
  socialConnectors?: ExperienceSocialConnector[]
) => {
  if (!socialConnectors) {
    return [];
  }

  const connectorMap = new Map<string, ExperienceSocialConnector>();

  /**
   * Browser Environment
   * Accepts both web and universal platform connectors.
   * Insert universal connectors only if there is no web platform connector provided with the same target.
   * Web platform has higher priority.
   **/

  if (platform === ConnectorPlatform.Web) {
    for (const connector of socialConnectors) {
      const { platform, target } = connector;

      if (platform === ConnectorPlatform.Native) {
        continue;
      }

      if (platform === ConnectorPlatform.Web || !connectorMap.get(target)) {
        connectorMap.set(target, connector);
        continue;
      }
    }

    return Array.from(connectorMap.values());
  }

  /**
   * Native Webview Environment
   * Accepts both native and universal platform connectors.
   * Insert universal connectors only if there is no native platform connector provided with the same target.
   * Native platform has higher priority.
   **/

  for (const connector of socialConnectors) {
    const { platform, target } = connector;

    if (platform === ConnectorPlatform.Web) {
      continue;
    }

    if (platform === ConnectorPlatform.Native || !connectorMap.get(target)) {
      connectorMap.set(target, connector);
      continue;
    }
  }

  return Array.from(connectorMap.values());
};

export const isAppleConnector = (target?: string) => target === 'apple';
