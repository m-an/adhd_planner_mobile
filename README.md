# ADHD Planner Mobile

An Expo React Native app written in TypeScript. Expo Prebuild generates the
iOS and Android projects, and a custom development client includes native
speech and notification modules.

## Get started

```sh
npm install
npm run prebuild
npm run ios
# or
npm run android
```

Run `npm start` to start Metro in development-client mode. Expo Go does not
include this app's custom native modules. Re-run `npm run prebuild` after
changing native dependencies or app configuration; use
`npm run prebuild:clean` to regenerate the native projects from scratch.

The `expo-speech` and `expo-notifications` packages are installed and ready to
use from the app. Notification permission requests and delivery behavior
should be implemented by the feature that schedules notifications.

## Rails API

Copy `.env.example` to `.env` and set `EXPO_PUBLIC_API_URL` to the Rails API
base URL for your environment. The shared typed client in
`src/lib/api-client.ts` sends JSON requests and includes the device's IANA
timezone in the `X-Time-Zone` header on every request. The API can use this
header to set the request's Rails time zone.

```ts
import { apiClient } from './src/lib/api-client';

interface Task {
  id: number;
  title: string;
}

const tasks = await apiClient.request<Task[]>('/tasks');
```

`EXPO_PUBLIC_` variables are embedded in the app bundle, so only put
non-secret configuration such as the API base URL in this file.

## Authentication and push tokens

`src/lib/auth-service.ts` provides `signIn`, `restoreSession`, and `signOut`.
The Rails login endpoint is expected to be `POST /auth/login` and return
`{ "token": "<jwt>", "user": ... }`. The JWT is stored with `expo-secure-store`
and automatically sent as a Bearer token by the shared API client.

After sign-in, the app only syncs an Expo Push Token if notifications are
already allowed. The first successfully created daily plan triggers the
notification permission prompt, after the Today view appears. The permission
request is attempted only once on the device. If granted, the app registers
its Expo Push Token with `PATCH /users/me` using
`{ "expo_push_token": "...", "push_platform": "ios|android" }`. The endpoint
should update the authenticated Rails user's push-token fields; the same
endpoint should accept `expo_push_token: null` to clear it during sign-out.
`App.tsx` calls `restoreSession()` on startup to sync an already-authorized
user's token again without prompting for permission. iOS notifications are
configured through the `expo-notifications` plugin. Android Prebuild declares
`POST_NOTIFICATIONS` and `SCHEDULE_EXACT_ALARM`. The Android notification
channel is created before requesting notification permission. Exact-alarm
special access is declared for future exact-time reminders; the current app
does not schedule alarms yet. Registration outcomes (including denied
permission or missing project configuration) are returned explicitly.

Expo Push Tokens require an EAS project ID and valid APNs/FCM credentials.
Run `eas init` to associate the app with an Expo project before enabling push
registration. Align the documented Rails routes and response fields with the
backend if its API contract differs.

## Task reminder notifications

The app presents only validated `task_reminder` notifications in the
foreground, without sound or badge changes. Tapping a notification while the
app is active, backgrounded, or closed opens the task detail sheet. Sidekiq
pushes should use the short `action_item` as the notification title and omit
the body so the OS alert does not expose the full description. Include the
details in the data payload so the app can open the drawer without a separate
task-fetch endpoint:

```json
{
  "title": "Call clinic",
  "data": {
    "type": "task_reminder",
    "task_id": "task-123",
    "action_item": "Call clinic",
    "description": "Bring insurance card\nAsk about appointment options",
    "scheduled_at": "2026-11-18T09:00:00Z"
  }
}
```

`action_item` must contain 2–4 words. `description` and `scheduled_at` are
optional; the detail sheet shows a gentle fallback when no description is
provided. Background alert text is supplied by the push payload, so the Rails
Sidekiq job must follow this title/body contract.

## Voice capture

UI code can depend on the `VoiceCaptureService` interface exported from
`src/services/voice-capture`. The default `voiceCaptureService` uses native OS
on-device speech recognition for MVP and emits lifecycle, transcript, and
error events. It requires an offline speech model and fails instead of
falling back to network recognition, so transcription does not use a paid
speech API.

`VoiceCaptureScreen` keeps finalized speech chunks in one editable transcript.
When the OS recognizer ends after a pause, the draft is preserved and Resume
starts another chunk that appends to it. The optional `onOrganize` prop hands
the edited draft to the planner. The app posts `{ "transcript": "..." }` to
`POST /plans` relative to `EXPO_PUBLIC_API_URL` (the example base URL includes
`/api/v1`, so this calls `POST /api/v1/plans`). While the request runs, a small
inline indicator appears in the button and the draft remains visible; success
or an error is reported without a modal or screen transition.

Microphone permission is requested only when the user taps Start dictating.
The speech-recognition config plugin sets the iOS
`NSMicrophoneUsageDescription` and adds Android `RECORD_AUDIO` to the generated
manifest. On-device recognition requests microphone permission only; app
startup and capability checks do not request it. Re-run `npm run prebuild`
after changing these native permission settings.

On success, the app expects a plan response shaped as
`{ "tasks": [{ "id": 1, "action_item": "Call clinic", "description": "Bring insurance card\nAsk about appointment options", "scheduled_at": "2026-11-18T09:00:00Z" }, { "action_item": "Tidy desk", "description": null, "scheduled_at": null }] }`.
The app then shows a single-day Today view: timed tasks scheduled on the
device's local calendar day are sorted chronologically, and tasks with
`scheduled_at: null` appear under “Anytime Today.” Tasks scheduled outside
today are not shown. Each task card displays only its 2–4 word `action_item`,
a completion toggle, and—when scheduled—a soft “Target time” badge. Completion
toggles are local to the current Today view and are not synced to Rails yet.
Tapping a task opens a bottom detail sheet with its full description and quick
actions to mark it complete or delete it. These actions are also local to the
current plan view because no task-update or delete endpoint is defined yet.
Adjust the documented response fields if the Rails endpoint uses a different
contract.

The Today view has no week or month navigation. “Start a new brain dump”
returns to dictation and clears the previous draft.
At local midnight, the current plan and completion marks are cleared so
unresolved items do not carry into the new day. The date is also checked when
the app returns to the foreground, covering time spent suspended overnight.

It also defines an `audio-file` result for a future file-capture implementation;
screens can handle both result types without depending on the native module.

```ts
import { voiceCaptureService } from './src/services/voice-capture';

await voiceCaptureService.start((event) => {
  if (event.type === 'transcript') {
    updateTranscript(event.text, event.isFinal);
  }
});
```

Rebuild the custom development client after adding the speech-recognition
module or changing its permission text.
