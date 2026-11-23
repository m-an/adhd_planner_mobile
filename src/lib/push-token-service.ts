import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { apiClient } from './api-client';

const FIRST_PLAN_NOTIFICATION_PERMISSION_KEY =
  'adhd-planner.first-plan-notification-permission-requested';

export type PushTokenRegistrationResult =
  | { status: 'registered' }
  | { status: 'permission-denied' }
  | { status: 'missing-project-id' }
  | { status: 'unsupported-platform' }
  | { status: 'error'; message: string };

export type FirstPlanNotificationResult =
  | PushTokenRegistrationResult
  | { status: 'already-requested' };

interface PushTokenPayload {
  expo_push_token: string;
  push_platform: 'ios' | 'android';
}

interface ClearPushTokenPayload {
  expo_push_token: null;
  push_platform: 'ios' | 'android';
}

function getProjectId(): string | undefined {
  return Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
}

export async function registerPushToken(
  requestPermission: boolean,
): Promise<PushTokenRegistrationResult> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    return { status: 'unsupported-platform' };
  }

  try {
    let permissions = await Notifications.getPermissionsAsync();
    if (!permissions.granted && requestPermission) {
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: AndroidImportance.DEFAULT,
        });
      }
      permissions = await Notifications.requestPermissionsAsync();
    }
    if (!permissions.granted) {
      return { status: 'permission-denied' };
    }

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: AndroidImportance.DEFAULT,
      });
    }

    const projectId = getProjectId();
    if (!projectId) {
      return { status: 'missing-project-id' };
    }

    const expoPushToken = await Notifications.getExpoPushTokenAsync({ projectId });
    const payload: PushTokenPayload = {
      expo_push_token: expoPushToken.data,
      push_platform: Platform.OS,
    };

    await apiClient.request<void, PushTokenPayload>('/users/me', {
      method: 'PATCH',
      body: payload,
    });

    return { status: 'registered' };
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function registerPushTokenAfterFirstPlan(): Promise<FirstPlanNotificationResult> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    return { status: 'unsupported-platform' };
  }

  const alreadyRequested = await SecureStore.getItemAsync(
    FIRST_PLAN_NOTIFICATION_PERMISSION_KEY,
  );
  if (alreadyRequested === 'true') {
    return { status: 'already-requested' };
  }

  await SecureStore.setItemAsync(
    FIRST_PLAN_NOTIFICATION_PERMISSION_KEY,
    'true',
  );
  return registerPushToken(true);
}

export async function unregisterPushToken(): Promise<void> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    return;
  }

  await apiClient.request<void, ClearPushTokenPayload>('/users/me', {
    method: 'PATCH',
    body: {
      expo_push_token: null,
      push_platform: Platform.OS,
    },
  });
}
