export interface VoiceCaptureOptions {
  language?: string;
  interimResults?: boolean;
}

export interface VoiceCapturePermissionStatus {
  granted: boolean;
  canAskAgain: boolean;
}

export type VoiceCaptureEvent =
  | { type: 'started' }
  | { type: 'ended' }
  | {
      type: 'transcript';
      text: string;
      isFinal: boolean;
      confidence?: number;
    }
  | {
      type: 'audio-file';
      uri: string;
      mimeType?: string;
    }
  | {
      type: 'error';
      code: string;
      message: string;
    };

export interface VoiceCaptureService {
  isAvailable(): boolean;
  requestPermissions(): Promise<VoiceCapturePermissionStatus>;
  start(
    onEvent: (event: VoiceCaptureEvent) => void,
    options?: VoiceCaptureOptions,
  ): Promise<void>;
  stop(): Promise<void>;
  cancel(): Promise<void>;
}

export class VoiceCaptureServiceError extends Error {
  constructor(
    public readonly code:
      | 'not-available'
      | 'on-device-not-available'
      | 'permission-denied'
      | 'already-active',
    message: string,
  ) {
    super(message);
    this.name = 'VoiceCaptureServiceError';
  }
}
