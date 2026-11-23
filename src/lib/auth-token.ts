import * as SecureStore from 'expo-secure-store';

const AUTH_TOKEN_KEY = 'auth.jwt';

export async function getAuthToken(): Promise<string | null> {
  return SecureStore.getItemAsync(AUTH_TOKEN_KEY);
}

export async function storeAuthToken(token: string): Promise<void> {
  if (!token.trim()) {
    throw new Error('Cannot store an empty authentication token.');
  }

  await SecureStore.setItemAsync(AUTH_TOKEN_KEY, token);
}

export async function clearAuthToken(): Promise<void> {
  await SecureStore.deleteItemAsync(AUTH_TOKEN_KEY);
}
