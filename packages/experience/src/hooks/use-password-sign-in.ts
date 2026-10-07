import {
  InteractionEvent,
  SignInIdentifier,
  type PasswordVerificationPayload,
} from '@logto/schemas';
import { conditional } from '@silverhand/essentials';
import { useCallback, useMemo, useState, useContext } from 'react';
import { useTranslation } from 'react-i18next';

import CaptchaContext from '@/Providers/CaptchaContextProvider/CaptchaContext';
import UserInteractionContext from '@/Providers/UserInteractionContextProvider/UserInteractionContext';
import {
  continueSignInWithPasswordIdentifier,
  signInWithPasswordIdentifier,
} from '@/apis/experience';
import type { PasswordVerificationResponse } from '@/apis/experience/const';
import useApi from '@/hooks/use-api';
import useCheckSingleSignOn from '@/hooks/use-check-single-sign-on';
import type { ErrorHandlers } from '@/hooks/use-error-handler';
import useErrorHandler from '@/hooks/use-error-handler';
import useNavigateWithPreservedSearchParams from '@/hooks/use-navigate-with-preserved-search-params';
import { useForgotPasswordSettings } from '@/hooks/use-sie';

import { useConfirmModal } from './use-confirm-modal';
import useGlobalRedirectTo from './use-global-redirect-to';
import useSubmitInteractionErrorHandler from './use-submit-interaction-error-handler';

const usePasswordSignIn = () => {
  const [errorMessage, setErrorMessage] = useState<string>();
  const { onSubmit: checkSingleSignOn } = useCheckSingleSignOn();
  const redirectTo = useGlobalRedirectTo();
  const { executeCaptcha } = useContext(CaptchaContext);

  const { t } = useTranslation();
  const { show } = useConfirmModal();
  const navigate = useNavigateWithPreservedSearchParams();
  const { isForgotPasswordEnabled } = useForgotPasswordSettings();

  const { identifierInputValue, setForgotPasswordIdentifierInputValue } =
    useContext(UserInteractionContext);

  const clearErrorMessage = useCallback(() => {
    setErrorMessage('');
  }, []);

  const handleError = useErrorHandler();
  const asyncSignIn = useApi(signInWithPasswordIdentifier);
  const asyncContinueSignIn = useApi(continueSignInWithPasswordIdentifier);
  const preSignInErrorHandler = useSubmitInteractionErrorHandler(InteractionEvent.SignIn);

  const handleRedirectToForgotPassword = useCallback(() => {
    if (identifierInputValue) {
      setForgotPasswordIdentifierInputValue(identifierInputValue);
    }

    navigate({ pathname: '/forgot-password' }, { replace: true });
  }, [identifierInputValue, navigate, setForgotPasswordIdentifierInputValue]);

  const errorHandlers: ErrorHandlers = useMemo(
    () => ({
      'session.invalid_credentials': (error) => {
        setErrorMessage(error.message);
      },
      ...conditional(
        isForgotPasswordEnabled && {
          'password.expired': () => {
            show({
              type: 'alert',
              ModalContent: t('description.password_expired'),
              cancelText: 'description.password_expiration_reset',
              shouldCloseOnEsc: false,
              shouldCloseOnOverlayClick: false,
              onCancel: () => {
                handleRedirectToForgotPassword();
              },
            });
          },
        }
      ),
      ...preSignInErrorHandler,
    }),
    [handleRedirectToForgotPassword, isForgotPasswordEnabled, preSignInErrorHandler, show, t]
  );

  const continueSignIn = useCallback(
    async (verificationId: string) => {
      const [error, result] = await asyncContinueSignIn(verificationId);

      if (error) {
        await handleError(error, preSignInErrorHandler);

        return;
      }

      if (result?.redirectTo) {
        await redirectTo(result.redirectTo);
      }
    },
    [asyncContinueSignIn, handleError, redirectTo, preSignInErrorHandler]
  );

  const handlePasswordVerificationResponse = useCallback(
    async (response: PasswordVerificationResponse) => {
      const { verificationId, reminder } = response;

      // No reminder metadata: plain upstream flow — continue sign-in immediately.
      // Also skip the modal when forgot password is unavailable, since the reset
      // action could not be offered anyway.
      if (!reminder || !isForgotPasswordEnabled) {
        await continueSignIn(verificationId);

        return;
      }

      show({
        ModalContent: t('description.password_expiration_reminder', {
          days: reminder.daysUntilExpiration,
        }),
        confirmText: 'description.password_expiration_reset',
        cancelText: 'description.password_expiration_reminder_skip',
        onConfirm: () => {
          handleRedirectToForgotPassword();
        },
        onCancel: async () => {
          await continueSignIn(verificationId);
        },
      });
    },
    [continueSignIn, handleRedirectToForgotPassword, isForgotPasswordEnabled, show, t]
  );

  const onSubmit = useCallback(
    async (payload: PasswordVerificationPayload) => {
      const { identifier } = payload;
      const captchaToken = await executeCaptcha();

      // Check if the email is registered with any SSO connectors. If the email is registered with any SSO connectors, we should not proceed to the next step
      if (identifier.type === SignInIdentifier.Email) {
        const result = await checkSingleSignOn(identifier.value);

        if (result) {
          return;
        }
      }

      const [error, result] = await asyncSignIn(payload, captchaToken);

      if (error) {
        await handleError(error, errorHandlers);

        return;
      }

      if (!result) {
        return;
      }

      await handlePasswordVerificationResponse(result);
    },
    [
      asyncSignIn,
      checkSingleSignOn,
      errorHandlers,
      executeCaptcha,
      handlePasswordVerificationResponse,
      handleError,
    ]
  );

  return {
    errorMessage,
    clearErrorMessage,
    onSubmit,
  };
};

export default usePasswordSignIn;
