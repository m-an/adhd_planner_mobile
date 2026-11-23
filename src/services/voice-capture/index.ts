import { NativeSpeechCaptureService } from './native-speech-capture-service';
import type { VoiceCaptureService } from './voice-capture-service';

export type {
  VoiceCaptureEvent,
  VoiceCaptureOptions,
  VoiceCapturePermissionStatus,
  VoiceCaptureService,
} from './voice-capture-service';
export { VoiceCaptureServiceError } from './voice-capture-service';

export const voiceCaptureService: VoiceCaptureService = new NativeSpeechCaptureService();
