import { condArray } from '@silverhand/essentials';
import { useMemo } from 'react';
import { Navigate, type RouteObject } from 'react-router-dom';
import { safeLazy } from 'react-safe-lazy';

import { TenantSettingsTabs } from '@/consts';
import { shouldShowOssTenantMembersTab } from '@/pages/OssTenantSettings/utils';

const OssTenantSettings = safeLazy(async () => import('@/pages/OssTenantSettings'));
const OssTenantMembers = safeLazy(async () => import('@/pages/OssTenantSettings/Members'));
const OidcConfigs = safeLazy(async () => import('@/components/OidcConfigs'));

const useOssTenantSettings = (): RouteObject =>
  useMemo(() => {
    const shouldShowMembersTab = shouldShowOssTenantMembersTab({ isCloud: false });

    return {
      path: 'tenant-settings',
      element: <OssTenantSettings />,
      children: [
        {
          index: true,
          element: <Navigate replace to={TenantSettingsTabs.OidcConfigs} />,
        },
        {
          path: TenantSettingsTabs.OidcConfigs,
          element: <OidcConfigs />,
        },
        ...condArray(
          shouldShowMembersTab && [
            {
              path: TenantSettingsTabs.Members,
              element: <OssTenantMembers />,
            },
          ]
        ),
      ],
    };
  }, []);

export const useTenantSettings = useOssTenantSettings;
