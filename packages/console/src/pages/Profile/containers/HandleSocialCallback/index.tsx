import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';

import AppLoading from '@/components/AppLoading';
import { adminTenantEndpoint, meApi, storageKeys } from '@/consts';
import { useStaticApi } from '@/hooks/use-api';
import { useConfirmModal } from '@/hooks/use-confirm-modal';

import { handleError } from '../../utils';

function HandleSocialCallback() {
  const { search } = useLocation();
  const { t } = useTranslation(undefined, { keyPrefix: 'admin_console' });
  const { show: showModal } = useConfirmModal();
  const api = useStaticApi({
    prefixUrl: adminTenantEndpoint,
    resourceIndicator: meApi.indicator,
    hideErrorToast: true,
  });

  useEffect(() => {
    (async () => {
      const connectorId = sessionStorage.getItem(storageKeys.linkingSocialConnector);
      sessionStorage.removeItem(storageKeys.linkingSocialConnector);
      const expectedState = sessionStorage.getItem(storageKeys.linkingSocialState);
      sessionStorage.removeItem(storageKeys.linkingSocialState);

      if (connectorId) {
        const queries = new URLSearchParams(search);

        // The OAuth `state` must match the one generated when the link flow was started;
        // otherwise the callback params must not be posted to `link-identity`.
        if (!expectedState || queries.get('state') !== expectedState) {
          await showModal({
            ModalContent: t('errors.unexpected_error'),
            type: 'alert',
            cancelButtonText: 'general.got_it',
          });
          window.close();

          return;
        }

        queries.set(
          'redirectUri',
          new URL(`/callback/${connectorId}`, new URL(adminTenantEndpoint)).toString()
        );
        const connectorData = Object.fromEntries(queries);

        try {
          await api.post('me/social/link-identity', { json: { connectorId, connectorData } });

          window.close();
        } catch (error: unknown) {
          void handleError(error, async (code, message) => {
            if (code === 'user.identity_already_in_use') {
              await showModal({
                ModalContent: message,
                type: 'alert',
                cancelButtonText: 'general.got_it',
              });
              window.close();

              return true;
            }
          });
        }
      }
    })();
  }, [api, search, showModal, t]);

  return <AppLoading />;
}

export default HandleSocialCallback;
