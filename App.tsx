import { useCallback, useEffect, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';
import * as Notifications from 'expo-notifications';
import { apiClient } from './src/lib/api-client';
import { restoreSession } from './src/lib/auth-service';
import {
  parseTaskReminder,
  parseTodayPlan,
  type TodayPlan,
  type TodayTask,
} from './src/features/today/today-plan';
import { VoiceCaptureScreen } from './src/features/voice-capture/voice-capture-screen';

function getTaskReminder(data: unknown): TodayTask | null {
  try {
    return parseTaskReminder(data);
  } catch (error) {
    console.warn('Ignoring malformed task reminder notification:', error);
    return null;
  }
}

Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const isTaskReminder =
      getTaskReminder(notification.request.content.data) !== null;

    return {
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: isTaskReminder,
      shouldShowList: isTaskReminder,
    };
  },
});

export default function App() {
  const [pendingReminder, setPendingReminder] = useState<TodayTask | null>(null);
  const lastResponseRef = useRef<{ identifier: string; timestamp: number } | null>(
    null,
  );
  const handleNotificationResponse = useCallback(
    (response: Notifications.NotificationResponse) => {
      const identifier = response.notification.request.identifier;
      const previousResponse = lastResponseRef.current;
      const now = Date.now();
      if (
        previousResponse?.identifier === identifier &&
        now - previousResponse.timestamp < 1500
      ) {
        return;
      }
      lastResponseRef.current = { identifier, timestamp: now };

      const task = getTaskReminder(response.notification.request.content.data);
      if (task) {
        setPendingReminder(task);
      }

      void Notifications.clearLastNotificationResponseAsync().catch(
        (error: unknown) => {
          console.warn('Could not clear the handled notification response:', error);
        },
      );
    },
    [],
  );
  const handleReminderOpened = useCallback(() => {
    setPendingReminder(null);
  }, []);

  useEffect(() => {
    const responseSubscription =
      Notifications.addNotificationResponseReceivedListener(
        handleNotificationResponse,
      );

    void Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (response) {
          handleNotificationResponse(response);
        }
      })
      .catch((error: unknown) => {
        console.error('Could not read the initial notification response:', error);
      });

    return () => {
      responseSubscription.remove();
    };
  }, [handleNotificationResponse]);

  const organizePlan = async (transcript: string) => {
    const response = await apiClient.request<unknown, { transcript: string }>(
      '/plans',
      {
        method: 'POST',
        body: { transcript },
      },
    );
    return parseTodayPlan(response);
  };

  useEffect(() => {
    void restoreSession()
      .then((result) => {
        if (result && result.status !== 'registered') {
          console.warn('Push-token registration was not completed:', result);
        }
      })
      .catch((error: unknown) => {
        console.error('Failed to restore the saved authentication token:', error);
      });
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar style="auto" />
      <VoiceCaptureScreen
        onOrganize={organizePlan}
        onReminderOpened={handleReminderOpened}
        pendingReminder={pendingReminder}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F6F4EF',
  },
});
