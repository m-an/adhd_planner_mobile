import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import type {
  VoiceCaptureEvent,
  VoiceCaptureOptions,
  VoiceCapturePermissionStatus,
  VoiceCaptureService,
} from './voice-capture-service';
import { VoiceCaptureServiceError } from './voice-capture-service';

type NativeSubscription = { remove: () => void };

export class NativeSpeechCaptureService implements VoiceCaptureService {
  private active = false;
  private eventListener: ((event: VoiceCaptureEvent) => void) | null = null;
  private eventSubscriptions: NativeSubscription[] = [];

  isAvailable(): boolean {
    return (
      ExpoSpeechRecognitionModule.isRecognitionAvailable() &&
      ExpoSpeechRecognitionModule.supportsOnDeviceRecognition()
    );
  }

  async requestPermissions(): Promise<VoiceCapturePermissionStatus> {
    const result =
      await ExpoSpeechRecognitionModule.requestMicrophonePermissionsAsync();
    return {
      granted: result.granted,
      canAskAgain: result.canAskAgain,
    };
  }

  async start(
    onEvent: (event: VoiceCaptureEvent) => void,
    options: VoiceCaptureOptions = {},
  ): Promise<void> {
    if (this.active) {
      throw new VoiceCaptureServiceError(
        'already-active',
        'Voice capture is already in progress.',
      );
    }
    if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
      throw new VoiceCaptureServiceError(
        'not-available',
        'Speech recognition is not available on this device.',
      );
    }
    if (!ExpoSpeechRecognitionModule.supportsOnDeviceRecognition()) {
      throw new VoiceCaptureServiceError(
        'on-device-not-available',
        'On-device speech recognition is unavailable. Download an offline speech model or use a supported device.',
      );
    }

    const permission = await this.requestPermissions();
    if (!permission.granted) {
      throw new VoiceCaptureServiceError(
        'permission-denied',
        permission.canAskAgain
          ? 'Microphone permission is required for voice input.'
          : 'Enable microphone permission in device settings to use voice input.',
      );
    }

    this.eventListener = onEvent;
    this.attachEventListeners();
    this.active = true;

    try {
      ExpoSpeechRecognitionModule.start({
        ...(options.language ? { lang: options.language } : {}),
        interimResults: options.interimResults ?? true,
        continuous: false,
        maxAlternatives: 1,
        addsPunctuation: true,
        requiresOnDeviceRecognition: true,
      });
    } catch (error) {
      this.cleanup();
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (this.active) {
      ExpoSpeechRecognitionModule.stop();
    }
  }

  async cancel(): Promise<void> {
    if (this.active) {
      this.cleanup();
      ExpoSpeechRecognitionModule.abort();
    }
  }

  private attachEventListeners(): void {
    this.eventSubscriptions = [
      ExpoSpeechRecognitionModule.addListener('start', () => {
        this.emit({ type: 'started' });
      }),
      ExpoSpeechRecognitionModule.addListener('result', (event) => {
        const result = event.results[0];
        if (!result) {
          return;
        }

        this.emit({
          type: 'transcript',
          text: result.transcript,
          isFinal: event.isFinal,
          ...(result.confidence >= 0 ? { confidence: result.confidence } : {}),
        });
      }),
      ExpoSpeechRecognitionModule.addListener('error', (event) => {
        const listener = this.eventListener;
        this.cleanup();
        listener?.({
          type: 'error',
          code: event.error,
          message: event.message,
        });
      }),
      ExpoSpeechRecognitionModule.addListener('end', () => {
        const listener = this.eventListener;
        this.cleanup();
        listener?.({ type: 'ended' });
      }),
    ];
  }

  private emit(event: VoiceCaptureEvent): void {
    this.eventListener?.(event);
  }

  private cleanup(): void {
    this.active = false;
    this.eventListener = null;
    for (const subscription of this.eventSubscriptions) {
      subscription.remove();
    }
    this.eventSubscriptions = [];
  }
}
