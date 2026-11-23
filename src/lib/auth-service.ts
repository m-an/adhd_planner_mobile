import { apiClient } from './api-client';
import { clearAuthToken, getAuthToken, storeAuthToken } from './auth-token';
import {
  registerPushToken,
  unregisterPushToken,
  type PushTokenRegistrationResult,
} from './push-token-service';

export interface LoginCredentials {
  email: string;
  password: string;
}

interface LoginResponse<TUser> {
  token: string;
  user: TUser;
}

export interface AuthenticatedSession<TUser> {
  user: TUser;
  pushTokenRegistration: PushTokenRegistrationResult;
}

export async function signIn<TUser = unknown>(
  credentials: LoginCredentials,
): Promise<AuthenticatedSession<TUser>> {
  const response = await apiClient.request<LoginResponse<TUser>, LoginCredentials>(
    '/auth/login',
    {
      method: 'POST',
      body: credentials,
      skipAuth: true,
    },
  );

  if (!response.token?.trim() || response.user == null) {
    throw new Error('The Rails login response must include a JWT token and user.');
  }

  await storeAuthToken(response.token);
  const pushTokenRegistration = await registerPushToken(false);

  return { user: response.user, pushTokenRegistration };
}

export async function restoreSession(): Promise<PushTokenRegistrationResult | null> {
  const token = await getAuthToken();
  if (!token) {
    return null;
  }

  return registerPushToken(false);
}

export async function signOut(): Promise<void> {
  let pushTokenCleanupError: unknown;
  try {
    if (await getAuthToken()) {
      await unregisterPushToken();
    }
  } catch (error) {
    pushTokenCleanupError = error;
  } finally {
    await clearAuthToken();
  }

  if (pushTokenCleanupError) {
    throw new Error('Signed out locally, but the Rails push token could not be cleared.', {
      cause: pushTokenCleanupError,
    });
  }
}
