import { UserScope } from '@logto/core-kit';
import { LogtoProvider, Prompt, useLogto } from '@logto/react';
import {
  adminConsoleApplicationId,
  defaultTenantId,
  PredefinedScope,
} from '@logto/schemas';
import { useContext, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';

import 'overlayscrollbars/overlayscrollbars.css';
import './scss/normalized.scss';
import './scss/overlayscrollbars.scss';
// eslint-disable-next-line import/no-unassigned-import
import '@fontsource/roboto-mono';
// eslint-disable-next-line import/no-unassigned-import
import 'react-color-palette/css';

import 'react-day-picker/dist/style.css';

import AppLoading from '@/components/AppLoading';
import { isCloud } from '@/consts/env';
import { getManagementApi, meApi } from '@/consts/resources';
import { ConsoleRoutes } from '@/containers/ConsoleRoutes';

import { GlobalScripts } from './components/Conversion';
import { adminTenantEndpoint, mainTitle } from './consts';
import ErrorBoundary from './containers/ErrorBoundary';
import LogtoErrorBoundary from './containers/LogtoErrorBoundary';
import AppConfirmModalProvider from './contexts/AppConfirmModalProvider';
import AppDataProvider, { AppDataContext } from './contexts/AppDataProvider';
import { AppThemeProvider } from './contexts/AppThemeProvider';
import TenantsProvider from './contexts/TenantsProvider';
import Toast from './ds-components/Toast';
import useCurrentUser from './hooks/use-current-user';
import initI18n from './i18n/init';

void initI18n();

/**
 * The main entry of the project. It provides two fundamental context providers:
 *
 * - `RouterProvider`: the sole router provider of the project.
 * - `TenantsProvider`: manages the tenants data, requires the `RouterProvider` to
 * get the current tenant ID from the URL.
 */
function App() {
  const router = createBrowserRouter([
    {
      path: '*',
      element: (
        <TenantsProvider>
          <Providers />
        </TenantsProvider>
      ),
    },
  ]);

  return <RouterProvider router={router} />;
}

export default App;

/**
 * This component serves as a container for all the providers and boundary components.
 *
 * Since `TenantsContext` requires the `TenantsProvider` to be mounted, and the initialization
 * of `LogtoProvider` requires the `TenantsContext` to be available, we have to put them into
 * different components.
 */
function Providers() {
  // For Cloud, we use Management API proxy for accessing tenant data.
  // For OSS, we directly call the tenant API with the default tenant API resource.
  const resources = useMemo(
    () =>
      isCloud
        ? [meApi.indicator]
        : [getManagementApi(defaultTenantId).indicator, meApi.indicator],
    []
  );

  const scopes = useMemo(
    () => [
      UserScope.Profile,
      UserScope.Email,
      UserScope.Phone,
      UserScope.Identities,
      UserScope.CustomData,
      UserScope.Organizations,
      UserScope.OrganizationRoles,
      PredefinedScope.All,
    ],
    []
  );

  return (
    <LogtoProvider
      unstable_enableCache
      config={{
        endpoint: adminTenantEndpoint.href,
        appId: adminConsoleApplicationId,
        resources,
        scopes,
        prompt: [Prompt.Login, Prompt.Consent],
      }}
    >
      <AppThemeProvider>
        <Helmet titleTemplate={`%s - ${mainTitle}`} defaultTitle={mainTitle} />
        <Toast />
        <AppConfirmModalProvider>
          <ErrorBoundary>
            <LogtoErrorBoundary>
              <AppDataProvider>
                <GlobalScripts />
                <Content />
              </AppDataProvider>
            </LogtoErrorBoundary>
          </ErrorBoundary>
        </AppConfirmModalProvider>
      </AppThemeProvider>
    </LogtoProvider>
  );
}

function Content() {
  const { tenantEndpoint } = useContext(AppDataContext);
  const { isLoaded } = useCurrentUser();
  const { isAuthenticated } = useLogto();

  if (!tenantEndpoint || (isCloud && isAuthenticated && !isLoaded)) {
    return <AppLoading />;
  }

  return <ConsoleRoutes />;
}
