export interface TodayTask {
  id?: number | string;
  action_item: string;
  description?: string | null;
  scheduled_at: string | null;
}

export interface TodayPlan {
  tasks: TodayTask[];
}

export interface TimedTodayTask extends TodayTask {
  scheduled_at: string;
}

export function parseTaskReminder(value: unknown): TodayTask | null {
  if (!isRecord(value) || value.type !== 'task_reminder') {
    return null;
  }

  const taskId = value.task_id;
  const actionItem =
    typeof value.action_item === 'string' ? value.action_item.trim() : '';
  const description = value.description;
  const scheduledAt = value.scheduled_at;
  const actionItemWordCount = actionItem ? actionItem.split(/\s+/).length : 0;

  if (
    (typeof taskId !== 'string' && typeof taskId !== 'number') ||
    (typeof taskId === 'string' && !taskId.trim()) ||
    (typeof taskId === 'number' && !Number.isFinite(taskId)) ||
    !actionItem ||
    actionItemWordCount < 2 ||
    actionItemWordCount > 4 ||
    (description !== undefined &&
      description !== null &&
      typeof description !== 'string') ||
    (scheduledAt !== undefined &&
      scheduledAt !== null &&
      typeof scheduledAt !== 'string') ||
    (typeof scheduledAt === 'string' && Number.isNaN(Date.parse(scheduledAt)))
  ) {
    throw new Error('The task reminder contains invalid task details.');
  }

  return {
    id: taskId,
    action_item: actionItem,
    ...(typeof description === 'string' ? { description } : {}),
    scheduled_at: typeof scheduledAt === 'string' ? scheduledAt : null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseTodayPlan(value: unknown): TodayPlan {
  if (!isRecord(value) || !Array.isArray(value.tasks)) {
    throw new Error('The plan response must include a tasks array.');
  }

  return {
    tasks: value.tasks.map((task, index) => {
      if (
        !isRecord(task) ||
        typeof task.action_item !== 'string' ||
        task.action_item.trim().split(/\s+/).length < 2 ||
        task.action_item.trim().split(/\s+/).length > 4 ||
        (task.description !== undefined &&
          task.description !== null &&
          typeof task.description !== 'string') ||
        (task.scheduled_at !== null && typeof task.scheduled_at !== 'string') ||
        (task.id !== undefined &&
          typeof task.id !== 'string' &&
          typeof task.id !== 'number')
      ) {
        throw new Error(`The plan response includes an invalid task at position ${index + 1}.`);
      }

      if (
        typeof task.scheduled_at === 'string' &&
        Number.isNaN(Date.parse(task.scheduled_at))
      ) {
        throw new Error(
          `Task "${task.action_item}" has an invalid scheduled_at value.`,
        );
      }

      return {
        ...(task.id === undefined ? {} : { id: task.id }),
        action_item: task.action_item.trim(),
        ...(typeof task.description === 'string'
          ? { description: task.description }
          : {}),
        scheduled_at: task.scheduled_at,
      };
    }),
  };
}

export function getLocalDateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function getNextLocalMidnight(now: Date): Date {
  return new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
  );
}

export function getTasksForToday(tasks: TodayTask[], now = new Date()): {
  timed: TimedTodayTask[];
  anytime: TodayTask[];
} {
  const todayKey = getLocalDateKey(now);
  const timed = tasks
    .map((task, index) => ({ task, index, date: task.scheduled_at ? new Date(task.scheduled_at) : null }))
    .filter(
      (
        item,
      ): item is {
        task: TimedTodayTask;
        index: number;
        date: Date;
      } => item.date !== null && getLocalDateKey(item.date) === todayKey,
    )
    .sort(
      (left, right) =>
        left.date.getTime() - right.date.getTime() || left.index - right.index,
    )
    .map(({ task }) => task);
  const anytime = tasks.filter((task) => task.scheduled_at === null);

  return { timed, anytime };
}

export function formatTaskTime(scheduledAt: string): string {
  return new Date(scheduledAt).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}
