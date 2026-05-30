import { useContext, useMemo } from 'react';

import { AppDataContext } from '@/contexts/AppDataProvider';

const useAvailableDomains = () => {
  const { tenantEndpoint } = useContext(AppDataContext);

  return useMemo(() => {
    const defaultDomain = tenantEndpoint?.host;

    return defaultDomain ? [defaultDomain] : [];
  }, [tenantEndpoint]);
};

export default useAvailableDomains;
