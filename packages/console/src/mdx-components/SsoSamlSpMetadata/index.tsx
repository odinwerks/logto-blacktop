import { conditionalString } from '@silverhand/essentials';
import { useContext, useMemo } from 'react';
import { z } from 'zod';

import { SsoConnectorContext } from '@/contexts/SsoConnectorContextProvider';
import CopyToClipboard from '@/ds-components/CopyToClipboard';
import FormField from '@/ds-components/FormField';
import useDomainSelection from '@/hooks/use-domain-selection';
import { applyDomain } from '@/utils/url';

import styles from './index.module.scss';

// Basic SAML SP config metadata, @see `packages/core/sso/src/types/saml`
const samlServiceProviderMetadataGuard = z.object({
  entityId: z.string().min(1),
  assertionConsumerServiceUrl: z.string().min(1),
});

// SAML provider config, @see `packages/core/sso/src/SamlSsoConnector`
const samlProviderConfigGuard = z.object({
  serviceProvider: samlServiceProviderMetadataGuard,
});

function SsoSamlSpMetadata() {
  const { ssoConnector } = useContext(SsoConnectorContext);
  const [selectedDomain] = useDomainSelection();

  const serviceProviderMetadata = useMemo(() => {
    if (!ssoConnector) {
      return;
    }

    const { providerConfig } = ssoConnector;

    const result = samlProviderConfigGuard.safeParse(providerConfig);

    if (!result.success) {
      return;
    }
    return result.data.serviceProvider;
  }, [ssoConnector]);

  if (!ssoConnector) {
    return null;
  }

  return (
    <div>
      <FormField
        title="enterprise_sso.basic_info.saml.audience_uri_field_name"
        className={styles.inputField}
      >
        <CopyToClipboard
          displayType="block"
          variant="border"
          value={conditionalString(
            serviceProviderMetadata?.entityId &&
              applyDomain(serviceProviderMetadata.entityId, selectedDomain)
          )}
        />
      </FormField>
      <FormField
        title="enterprise_sso.basic_info.saml.acs_url_field_name"
        className={styles.inputField}
      >
        <CopyToClipboard
          displayType="block"
          variant="border"
          value={conditionalString(
            serviceProviderMetadata?.assertionConsumerServiceUrl &&
              applyDomain(serviceProviderMetadata.assertionConsumerServiceUrl, selectedDomain)
          )}
        />
      </FormField>
    </div>
  );
}

export default SsoSamlSpMetadata;
