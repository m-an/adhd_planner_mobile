This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md

1. Project Overview & Domain Mission

This repository is the React Native (Expo + TypeScript) mobile client for a voice-first day planner built specifically for individuals with ADHD.

The application is engineered to eliminate executive dysfunction, task initiation friction, and visual overwhelm:

Morning Brain-Dump: The user wakes up, taps record, and speaks their unstructured plans for today only (e.g., "I need to vacuum the apartment, wash the floors, and call Dr. Smith by 3 PM").

Resilient Multi-Chunk Dictation: Because native OS speech-to-text cuts off after brief pauses, the UI lets users pause, think, tap to resume appending speech chunks, and optionally tweak the transcript before submitting.

Instant AI Structuring: The app sends the concatenated transcript to the Ruby on Rails backend (POST /api/v1/plans), which uses gpt-4o-mini to return clean, structured tasks within ~1–2 seconds.

Minimalist 24-Hour Schedule: The home screen displays only today's tasks as calm, low-density cards showing a 2–4 word action_item and a soft Target time. Tapping a card opens a bottom sheet with expanded details (description).

Low-Friction Reminders & Midnight Reset: Push notifications surface only the short action_item at the task's target time. At midnight local time, unfinished tasks clear automatically so the user wakes up to a guilt-free clean slate.

2. Tech Stack & Core Libraries

Framework: React Native with Expo (TypeScript, strict: true)

Native Build Strategy: Expo Prebuild / Custom Dev Client (expo-dev-client) — required for native speech recognition and exact alarm permissions

Navigation: Expo Router (app/ directory) or React Navigation (Native Stack)

State & Data Fetching: TanStack Query (React Query) + lightweight local state (Zustand or React Context)

Secure Storage: expo-secure-store (for JWT auth tokens)

Voice Capture (MVP): expo-speech-recognition (or @react-native-voice/voice)

Voice Capture (Post-MVP Prep): expo-av (for recording .m4a audio clips)

Push Notifications: expo-notifications (FCM on Android, APNs on iOS)

Dates & Timezones: date-fns + device IANA timezone via Intl.DateTimeFormat().resolvedOptions().timeZone

Testing & Linting: Jest, React Native Testing Library (@testing-library/react-native), ESLint, Prettier

3. Non-Negotiable Neurodivergent UX Guardrails

AI coding agents must enforce these design and behavioral rules across every screen, component, and copy string:

Minimalist Main Timeline (Anti-Task Paralysis):

Each task card on the main "Today" screen must only display:

Completion checkbox

The 2–4 word action_item

A subtle Target time badge (if due_at is present)

Never render description text directly on the main schedule list. Multi-step details must remain hidden inside the tap-to-expand Task Detail bottom sheet.

Anti-Demand Avoidance Terminology & Styling:

Never use the words "deadline", "overdue", "late", "urgent", or "failed" anywhere in the UI.

Always label timestamps as "Target time" (e.g., "Target time: 3:00 PM").

Avoid aggressive red alert badges or punitive styling when a target time passes; keep visual indicators calm and neutral.

Protect Fragile Working Memory (Zero Interruptions):

During voice recording and the ~1–2 second POST /api/v1/plans processing state, never display screen-blocking ads, pop-up modals, upsell prompts, or jarring animations.

Never discard user input on network errors: If POST /api/v1/plans fails or returns HTTP 503, preserve the user's dictated transcript in the input draft and show a calm retry button.

Single 24-Hour Scope & Midnight Rollover:

Do not build multi-day calendars, backlog folders, or future date pickers in the MVP. The schedule strictly represents today.

Listen to app foreground events (AppState) and local midnight timers to refetch GET /api/v1/tasks when the calendar date changes, ensuring yesterday's unresolved items disappear cleanly.

Contextual (Just-in-Time) OS Permissions:

Never request Microphone or Push Notification permissions on initial app launch.

Request Microphone permission only when the user taps the Record button for the first time.

Request Push Notification permission only immediately after the user successfully generates their first daily plan.

4. Architecture: Decoupled Voice Capture (MVP vs. Post-MVP)

UI components must never import native speech or audio libraries directly. All voice capture must go through a single service abstraction (src/services/voice/VoiceCaptureService.ts) implementing a shared adapter interface:

export interface VoiceCaptureAdapter {
  requestPermissions(): Promise<boolean>;
  startListening(onPartialResult: (text: string) => void, onFinalResult: (text: string) => void): Promise<void>;
  stopListening(): Promise<void>;
  cancel(): Promise<void>;
}


Phase 1 — MVP (NativeSpeechAdapter):

Uses OS speech-to-text (expo-speech-recognition) at zero transcription API cost.

Multi-Segment Append UX: Native dictation automatically stops after ~1–2 seconds of silence. When a segment finishes, append the finalized text to the user's running draft transcript (separated by a space) and keep the mic button ready for one-tap continuation until the user taps "Organize My Day".

Submits { transcript } to POST /api/v1/plans.

Phase 2 — Post-MVP (AudioRecorderAdapter):

Uses expo-av to record compressed .m4a audio without silence cutoffs.

Uploads the audio file via multipart/form-data to POST /api/v1/audio_plans (processed on Rails via gpt-4o-mini-transcribe).

5. Native Permissions & Platform Config (app.json / app.config.ts)

Ensure all required native permission keys are configured in Expo config so npx expo prebuild generates valid native manifests:

iOS (ios.infoPlist):

NSMicrophoneUsageDescription: "Allow microphone access so you can speak your daily plan out loud."

NSSpeechRecognitionUsageDescription: "Allow speech recognition to turn your voice brain-dump into a calm daily schedule."

Android (android.permissions):

android.permission.RECORD_AUDIO

android.permission.POST_NOTIFICATIONS (Android 13+)

android.permission.SCHEDULE_EXACT_ALARM (for timely task reminders)

6. API Contract & Data Models (api/v1)

All authenticated requests must include:

Authorization: Bearer <jwt_token> (retrieved from expo-secure-store)

X-Timezone: <IANA_timezone> (e.g., "Europe/Kyiv", "America/New_York")

TypeScript Domain Types (src/types/models.ts)

export type TaskStatus = "pending" | "completed" | "unresolved";

export interface User {
  id: number;
  email: string;
  time_zone: string;
  platform: "ios" | "android" | null;
}

export interface Task {
  id: number;
  raw_transcript: string;
  action_item: string;       // Strictly 2–4 words
  description: string | null; // Shown only in expandable detail sheet
  due_at: string | null;      // ISO-8601 UTC timestamp
  status: TaskStatus;
  created_at: string;
}


Endpoints

POST /api/v1/auth/register & POST /api/v1/auth/login -> { token: string, user: User }

PATCH /api/v1/users/me -> Updates { time_zone, push_token, platform }. Call automatically on login/app boot whenever the device timezone or Expo push token changes.

GET /api/v1/tasks -> Fetches today's tasks for the user's local 24-hour window. Sort timed tasks (due_at !== null) chronologically at the top, followed by untimed tasks (due_at === null) under an "Anytime Today" section.

POST /api/v1/plans -> Body: { transcript: string }. Returns HTTP 201 with { tasks: Task[] }.

PATCH /api/v1/tasks/:id -> Body: Partial { status, action_item, description, due_at }. Use optimistic UI updates when toggling status: "completed".

DELETE /api/v1/tasks/:id -> Deletes the task with optimistic UI removal.

7. Push Notifications & Deep Linking

Configure Notifications.setNotificationHandler so foreground alerts display cleanly without jarring full-screen takeover.

Push payloads from the Rails Sidekiq worker contain { title: task.action_item, data: { taskId: number } }.

Register a notification response listener (Notifications.addNotificationResponseReceivedListener) that navigates to the Today screen and automatically opens the Task Detail bottom sheet for data.taskId.

8. Recommended Directory Structure

src/
├── api/                 # Typed HTTP client, auth interceptors, endpoint wrappers
├── components/
│   ├── schedule/        # TaskCard, AnytimeSection, EmptyMorningState
│   ├── voice/           # RecordButton, TranscriptDraftBox, ProcessingOverlay
│   └── sheets/          # TaskDetailBottomSheet
├── hooks/               # useTasks, useCreatePlan, useMidnightRollover, usePushSetup
├── navigation/          # Root navigator & deep-link config
├── screens/             # TodayScreen, AuthScreen
├── services/
│   ├── voice/           # VoiceCaptureAdapter, NativeSpeechAdapter, AudioRecorderAdapter
│   └── notifications/   # Permission prompts, push token registration, tap handlers
├── theme/               # Calm color palette, typography, spacing tokens
└── types/               # Shared TypeScript interfaces


9. Coding Conventions & Agent Checklist

Strict TypeScript: Never use any. Type all API responses, navigation params, and native event callbacks explicitly.

Optimistic UI: Toggling task completion (PATCH /api/v1/tasks/:id) must update the checkbox immediately in UI state and roll back smoothly if the network request fails.

Accessibility & Touch Targets: Maintain minimum 48x48pt touch targets on checkboxes, task cards, and the primary Record button to minimize motor/cognitive friction.

Testing: Write unit tests for NativeSpeechAdapter segment appending, timezone formatting helpers, and TaskCard / TaskDetailBottomSheet rendering rules (verifying description is hidden on the card and "deadline" / "overdue" never appear in rendered text).
