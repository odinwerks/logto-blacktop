import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

import LoadingLayer from '@/shared/components/LoadingLayer';
import { isValidConsoleCallbackLink, storeCallbackLink } from '@/utils/social-connectors';
import { isValidNativeCallbackLink, isValidWebRedirectUri } from '@/utils/url-scheme';

/**
 * Unauthenticated bounce page used by the Console "link social account" flow: it stores the
 * post-OAuth callback link for the given connector, then navigates to the connector's
 * authorization URI. `/callback/:connectorId` later relays `code` + `state` to the stored link.
 *
 * Every input is validated at this plant boundary so that an arbitrary `code` + `state` relay
 * destination cannot be planted: `callback` must be a native deep link or the Console-owned
 * `/handle-social` URL, and `redirectTo` must be an `http(s)` web URL. A caller-supplied `state`
 * is never persisted — state storage is only written by the sign-in flow itself.
 */
const Springboard = () => {
  const [searchParameters] = useSearchParams();

  useEffect(() => {
    const connectorId = searchParameters.get('connectorId');
    const callback = searchParameters.get('callback');
    const redirectTo = searchParameters.get('redirectTo');

    if (
      callback &&
      connectorId &&
      (isValidNativeCallbackLink(callback) || isValidConsoleCallbackLink(callback))
    ) {
      storeCallbackLink(connectorId, callback);
    }

    if (redirectTo && isValidWebRedirectUri(redirectTo)) {
      window.location.assign(redirectTo);
    }
  }, [searchParameters]);

  return <LoadingLayer />;
};

export default Springboard;
