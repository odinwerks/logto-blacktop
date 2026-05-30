import { Theme } from '@logto/schemas';
import { useContext, useEffect } from 'react';
import { Navigate } from 'react-router-dom';

import AppLoading from '@/components/AppLoading';
import { AppThemeContext } from '@/contexts/AppThemeProvider';

import useUserOnboardingData from './hooks/use-user-onboarding-data';

export function OnboardingApp() {
  const { setThemeOverride } = useContext(AppThemeContext);

  useEffect(() => {
    setThemeOverride(Theme.Light);

    return () => {
      setThemeOverride(undefined);
    };
  }, [setThemeOverride]);

  const {
    isLoading,
    data: { isOnboardingDone },
  } = useUserOnboardingData();

  if (isLoading) {
    return <AppLoading />;
  }

  return <Navigate replace to="/" />;
}
