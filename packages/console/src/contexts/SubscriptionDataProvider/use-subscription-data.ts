import { useMemo } from 'react';

import {
  defaultLogtoSku,
  defaultTenantResponse,
  defaultSubscriptionQuota,
  defaultSubscriptionUsage,
} from '@/consts';

import { type FullContext } from './types';

const useSubscriptionData: () => FullContext & { isLoading: boolean } = () => {
  return useMemo(
    () => ({
      isLoading: false,
      logtoSkus: [],
      currentSku: defaultLogtoSku,
      currentSubscription: defaultTenantResponse.subscription,
      onCurrentSubscriptionUpdated: () => {},
      mutateSubscriptionQuotaAndUsages: () => {},
      currentSubscriptionQuota: defaultSubscriptionQuota,
      currentSubscriptionBasicQuota: defaultSubscriptionQuota,
      currentSubscriptionUsage: defaultSubscriptionUsage,
      currentSubscriptionResourceScopeUsage: {},
      currentSubscriptionRoleScopeUsage: {},
      hasSurpassedSubscriptionQuotaLimit: () => false,
      hasReachedSubscriptionQuotaLimit: () => false,
    }),
    []
  );
};

export default useSubscriptionData;
