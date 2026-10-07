import type { UserProfileResponse } from '@logto/schemas';

import { createAuthenticatedKy } from './base-ky';

export const uploadAccountAvatar = async (
  accessToken: string,
  file: File,
  options?: { signal?: AbortSignal }
) => {
  const formData = new FormData();
  formData.append('file', file);

  // Fork's avatar route: stores under a deterministic user-assets key, updates
  // `user.avatar`, and returns the account-center-filtered profile (whose
  // `avatar` field is the uploaded asset URL).
  const profile = await createAuthenticatedKy(accessToken)
    .post('/api/my-account/avatar', {
      body: formData,
      signal: options?.signal,
    })
    .json<Partial<UserProfileResponse>>();

  return { url: profile.avatar ?? '' };
};
