import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  VoiceCaptureServiceError,
  voiceCaptureService,
  type VoiceCaptureEvent,
} from '../../services/voice-capture';
import { TodayPlanScreen } from '../today/today-plan-screen';
import type { TodayPlan, TodayTask } from '../today/today-plan';
import { registerPushTokenAfterFirstPlan } from '../../lib/push-token-service';

type CaptureStatus = 'idle' | 'starting' | 'recording' | 'stopping';

interface VoiceCaptureScreenProps {
  onOrganize?: (transcript: string) => Promise<TodayPlan>;
  onReminderOpened?: () => void;
  pendingReminder?: TodayTask | null;
}

function appendSegment(draft: string, segment: string): string {
  const nextSegment = segment.trim();
  if (!nextSegment) {
    return draft;
  }

  return draft.trim()
    ? `${draft.trimEnd()} ${nextSegment}`
    : nextSegment;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof VoiceCaptureServiceError) {
    return error.message;
  }
  return error instanceof Error ? error.message : 'Voice capture could not start.';
}

export function VoiceCaptureScreen({
  onOrganize,
  onReminderOpened,
  pendingReminder,
}: VoiceCaptureScreenProps) {
  const [draft, setDraft] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [captureStatus, setCaptureStatus] = useState<CaptureStatus>('idle');
  const [statusMessage, setStatusMessage] = useState(
    'Tap Start dictating whenever you are ready.',
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [organizeMessage, setOrganizeMessage] = useState<string | null>(null);
  const [isOrganizing, setIsOrganizing] = useState(false);
  const [todayPlan, setTodayPlan] = useState<TodayPlan | null>(null);
  const [
    shouldRequestNotificationPermission,
    setShouldRequestNotificationPermission,
  ] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState<string | null>(
    null,
  );
  const notificationPromptStarted = useRef(false);
  const handleReminderOpened = useCallback(() => {
    onReminderOpened?.();
  }, [onReminderOpened]);

  useEffect(() => {
    if (
      !todayPlan ||
      !shouldRequestNotificationPermission ||
      notificationPromptStarted.current
    ) {
      return;
    }

    notificationPromptStarted.current = true;
    setShouldRequestNotificationPermission(false);
    let isMounted = true;
    void registerPushTokenAfterFirstPlan()
      .then((result) => {
        if (!isMounted) {
          return;
        }

        switch (result.status) {
          case 'registered':
            setNotificationMessage(
              'Notifications are enabled for future plan reminders.',
            );
            break;
          case 'permission-denied':
            setNotificationMessage(
              'No problem—your plan is ready without notifications.',
            );
            break;
          case 'missing-project-id':
            setNotificationMessage(
              'Notification access is set. Push delivery needs an Expo project ID.',
            );
            break;
          case 'error':
            setNotificationMessage(
              'Your plan is ready, but notification setup did not finish.',
            );
            break;
          case 'unsupported-platform':
          case 'already-requested':
            break;
        }
      })
      .catch((error: unknown) => {
        console.error(
          'Failed to request notification permission after the first plan:',
          error,
        );
        if (isMounted) {
          setNotificationMessage(
            'Your plan is ready, but notification permission could not be checked.',
          );
        }
      });

    return () => {
      isMounted = false;
    };
  }, [shouldRequestNotificationPermission, todayPlan]);

  const isAvailable = voiceCaptureService.isAvailable();
  const isBusy =
    captureStatus === 'starting' ||
    captureStatus === 'recording' ||
    captureStatus === 'stopping';

  const handleVoiceEvent = (
    event: VoiceCaptureEvent,
    segmentState: { text: string; hasFinalResult: boolean },
  ) => {
    if (event.type === 'started') {
      setCaptureStatus('recording');
      setStatusMessage('Listening. Pause anytime; your draft is kept.');
      return;
    }

    if (event.type === 'transcript') {
      if (segmentState.hasFinalResult || !event.text.trim()) {
        return;
      }

      if (event.isFinal) {
        segmentState.hasFinalResult = true;
        segmentState.text = '';
        setDraft((currentDraft) => appendSegment(currentDraft, event.text));
        setInterimTranscript('');
      } else {
        segmentState.text = event.text;
        setInterimTranscript(event.text);
      }
      return;
    }

    if (event.type === 'ended') {
      if (!segmentState.hasFinalResult) {
        setDraft((currentDraft) => appendSegment(currentDraft, segmentState.text));
      }
      segmentState.text = '';
      setInterimTranscript('');
      setCaptureStatus('idle');
      setStatusMessage(
        'Dictation paused. Tap Resume to append another chunk, or edit your draft.',
      );
      return;
    }

    if (event.type === 'error') {
      if (!segmentState.hasFinalResult) {
        setDraft((currentDraft) => appendSegment(currentDraft, segmentState.text));
      }
      segmentState.text = '';
      setInterimTranscript('');
      setCaptureStatus('idle');
      setErrorMessage(event.message);
    }
  };

  const startCapture = async () => {
    const segmentState = { text: '', hasFinalResult: false };
    setErrorMessage(null);
    setOrganizeMessage(null);
    setCaptureStatus('starting');
    setStatusMessage('Starting on-device dictation...');

    try {
      await voiceCaptureService.start((event) => {
        handleVoiceEvent(event, segmentState);
      });
    } catch (error) {
      setCaptureStatus('idle');
      setInterimTranscript('');
      setErrorMessage(getErrorMessage(error));
      setStatusMessage('Dictation paused. Your existing draft is safe.');
    }
  };

  const pauseCapture = async () => {
    setCaptureStatus('stopping');
    setStatusMessage('Finishing this chunk...');

    try {
      await voiceCaptureService.stop();
    } catch (error) {
      setCaptureStatus('idle');
      setErrorMessage(getErrorMessage(error));
    }
  };

  const handleCapturePress = () => {
    if (captureStatus === 'recording') {
      void pauseCapture();
    } else if (captureStatus === 'idle') {
      void startCapture();
    }
  };

  const handleOrganize = async () => {
    const transcript = draft.trim();
    if (!transcript || isBusy || isOrganizing) {
      return;
    }

    setOrganizeMessage(null);
    if (!onOrganize) {
      setOrganizeMessage('Your draft is ready. Planner organization is not connected yet.');
      return;
    }

    setIsOrganizing(true);
    try {
      const plan = await onOrganize(transcript);
      setTodayPlan(plan);
      setShouldRequestNotificationPermission(true);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsOrganizing(false);
    }
  };

  const captureButtonLabel =
    captureStatus === 'recording'
      ? 'Pause and keep draft'
      : captureStatus === 'starting'
        ? 'Starting...'
        : captureStatus === 'stopping'
          ? 'Finishing chunk...'
          : draft.trim()
            ? 'Resume dictation'
            : 'Start dictating';

  if (todayPlan || pendingReminder) {
    return (
      <TodayPlanScreen
        plan={todayPlan ?? { tasks: [] }}
        notificationMessage={notificationMessage}
        onTaskOpened={handleReminderOpened}
        onNewBrainDump={() => {
          setTodayPlan(null);
          setShouldRequestNotificationPermission(false);
          setNotificationMessage(null);
          setDraft('');
          setInterimTranscript('');
          setOrganizeMessage(null);
          setErrorMessage(null);
        }}
        taskToOpen={pendingReminder ?? null}
      />
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoider}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Text style={styles.eyebrow}>ADHD PLANNER</Text>
            <Text style={styles.title}>Get it out of your head.</Text>
            <Text style={styles.subtitle}>
              Speak in short bursts. Your words stay in one editable draft,
              even when dictation pauses.
            </Text>
          </View>

          <View style={styles.captureCard}>
            <View style={styles.captureHeader}>
              <View style={styles.statusDotContainer}>
                <View
                  style={[
                    styles.statusDot,
                    captureStatus === 'recording' && styles.statusDotLive,
                  ]}
                />
              </View>
              <Text style={styles.captureLabel}>
                {captureStatus === 'recording' ? 'LISTENING' : 'VOICE CAPTURE'}
              </Text>
              <Text style={styles.localBadge}>ON DEVICE</Text>
            </View>

            <Text style={styles.statusMessage}>
              {!isAvailable
                ? 'On-device speech recognition is unavailable. Download an offline speech model or use a supported device.'
                : statusMessage}
            </Text>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={captureButtonLabel}
              accessibilityState={{
                disabled: !isAvailable || captureStatus === 'starting' || captureStatus === 'stopping',
              }}
              disabled={
                !isAvailable ||
                captureStatus === 'starting' ||
                captureStatus === 'stopping'
              }
              onPress={handleCapturePress}
              style={({ pressed }) => [
                styles.captureButton,
                captureStatus === 'recording' && styles.pauseButton,
                pressed && styles.pressed,
                !isAvailable && styles.disabledButton,
              ]}
            >
              <Text style={styles.captureButtonText}>{captureButtonLabel}</Text>
            </Pressable>
          </View>

          <View style={styles.transcriptSection}>
            <View style={styles.transcriptHeading}>
              <Text style={styles.sectionTitle}>Transcript draft</Text>
              <Text style={styles.editHint}>Tap to edit</Text>
            </View>
            <TextInput
              accessibilityLabel="Editable transcript draft"
              multiline
              onChangeText={(text) => {
                setDraft(text);
                setOrganizeMessage(null);
              }}
              placeholder="Your transcript will appear here. You can type or edit it anytime."
              placeholderTextColor="#9493A1"
              scrollEnabled
              style={styles.transcriptInput}
              textAlignVertical="top"
              value={draft}
            />
            {interimTranscript ? (
              <View style={styles.interimPanel}>
                <Text style={styles.interimLabel}>ADDING TO DRAFT</Text>
                <Text style={styles.interimText}>{interimTranscript}</Text>
              </View>
            ) : null}
          </View>

          {errorMessage ? (
            <Text accessibilityRole="alert" style={styles.errorMessage}>
              {errorMessage}
            </Text>
          ) : null}
          {organizeMessage ? (
            <Text accessibilityRole="status" style={styles.organizeMessage}>
              {organizeMessage}
            </Text>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              isOrganizing ? 'Organizing your day' : 'Organize My Day'
            }
            accessibilityState={{
              disabled: !draft.trim() || isBusy || isOrganizing,
              busy: isOrganizing,
            }}
            disabled={!draft.trim() || isBusy || isOrganizing}
            onPress={() => void handleOrganize()}
            style={({ pressed }) => [
              styles.organizeButton,
              (!draft.trim() || isBusy || isOrganizing) && styles.disabledButton,
              pressed && styles.pressed,
            ]}
          >
            <View style={styles.organizeButtonContent}>
              {isOrganizing ? (
                <ActivityIndicator
                  accessibilityLabel="Organizing your day"
                  color="#FFFFFF"
                  size="small"
                />
              ) : null}
              <Text style={styles.organizeButtonText}>
                {isOrganizing ? 'Organizing your day...' : 'Organize My Day'}
              </Text>
            </View>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F6F4EF',
  },
  keyboardAvoider: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 32,
  },
  header: {
    marginBottom: 24,
  },
  eyebrow: {
    color: '#6558C8',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.6,
    marginBottom: 10,
  },
  title: {
    color: '#242337',
    fontSize: 30,
    fontWeight: '700',
    lineHeight: 36,
    marginBottom: 8,
  },
  subtitle: {
    color: '#696879',
    fontSize: 15,
    lineHeight: 22,
  },
  captureCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E8E5EF',
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 24,
    padding: 18,
  },
  captureHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: 14,
  },
  statusDotContainer: {
    alignItems: 'center',
    height: 12,
    justifyContent: 'center',
    marginRight: 8,
    width: 12,
  },
  statusDot: {
    backgroundColor: '#A8A5B5',
    borderRadius: 5,
    height: 8,
    width: 8,
  },
  statusDotLive: {
    backgroundColor: '#D95D66',
  },
  captureLabel: {
    color: '#4D4B5C',
    flex: 1,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.1,
  },
  localBadge: {
    backgroundColor: '#EFF8F1',
    borderRadius: 8,
    color: '#2F7041',
    fontSize: 10,
    fontWeight: '700',
    overflow: 'hidden',
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  statusMessage: {
    color: '#696879',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  captureButton: {
    alignItems: 'center',
    backgroundColor: '#6558C8',
    borderRadius: 14,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: 18,
  },
  pauseButton: {
    backgroundColor: '#D95D66',
  },
  captureButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.82,
  },
  disabledButton: {
    opacity: 0.45,
  },
  transcriptSection: {
    marginBottom: 18,
  },
  transcriptHeading: {
    alignItems: 'baseline',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionTitle: {
    color: '#242337',
    fontSize: 18,
    fontWeight: '700',
  },
  editHint: {
    color: '#777587',
    fontSize: 12,
  },
  transcriptInput: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E3E0EA',
    borderRadius: 16,
    borderWidth: 1,
    color: '#242337',
    fontSize: 16,
    lineHeight: 24,
    minHeight: 190,
    padding: 16,
  },
  interimPanel: {
    backgroundColor: '#EFEDFA',
    borderRadius: 12,
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  interimLabel: {
    color: '#6558C8',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 5,
  },
  interimText: {
    color: '#3B365F',
    fontSize: 15,
    lineHeight: 21,
  },
  errorMessage: {
    color: '#A3313A',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 14,
  },
  organizeMessage: {
    color: '#4D4B5C',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  organizeButton: {
    alignItems: 'center',
    backgroundColor: '#242337',
    borderRadius: 14,
    justifyContent: 'center',
    minHeight: 56,
    marginTop: 4,
    paddingHorizontal: 20,
  },
  organizeButtonContent: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  organizeButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
