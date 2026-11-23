import { getAuthToken } from './auth-token';

export const TIME_ZONE_HEADER = 'X-Time-Zone';

export type ApiMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface ApiRequestOptions<TBody = undefined> {
  method?: ApiMethod;
  body?: TBody;
  headers?: HeadersInit;
  signal?: AbortSignal;
  skipAuth?: boolean;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly responseBody: string,
  ) {
    super(
      responseBody
        ? `API request failed (${status}): ${responseBody}`
        : `API request failed with status ${status}`,
    );
    this.name = 'ApiError';
  }
}

function getApiBaseUrl(): URL {
  const configuredUrl = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (!configuredUrl) {
    throw new Error('Set EXPO_PUBLIC_API_URL to the base URL of the Rails API.');
  }

  const baseUrl = new URL(configuredUrl);
  if (baseUrl.protocol !== 'http:' && baseUrl.protocol !== 'https:') {
    throw new Error('EXPO_PUBLIC_API_URL must use HTTP or HTTPS.');
  }

  if (!baseUrl.pathname.endsWith('/')) {
    baseUrl.pathname += '/';
  }

  return baseUrl;
}

export const apiClient = {
  async request<TResponse, TBody = undefined>(
    path: string,
    options: ApiRequestOptions<TBody> = {},
  ): Promise<TResponse> {
    const url = new URL(path.replace(/^\/+/, ''), getApiBaseUrl());
    const headers = new Headers(options.headers);
    headers.set('Accept', 'application/json');
    headers.set(TIME_ZONE_HEADER, Intl.DateTimeFormat().resolvedOptions().timeZone);

    if (!options.skipAuth) {
      const token = await getAuthToken();
      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
      }
    }

    let body: string | undefined;
    if (options.body !== undefined) {
      body = JSON.stringify(options.body);
      if (body === undefined) {
        throw new TypeError('API request body must be JSON serializable.');
      }
      headers.set('Content-Type', 'application/json');
    }

    const response = await fetch(url, {
      method: options.method ?? 'GET',
      headers,
      body,
      signal: options.signal,
    });

    if (!response.ok) {
      throw new ApiError(response.status, await response.text());
    }

    if (response.status === 204) {
      return undefined as TResponse;
    }

    return (await response.json()) as TResponse;
  },
};
