import { useEffect, useRef, useState } from 'react';
import {
  AppState,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  formatTaskTime,
  getLocalDateKey,
  getNextLocalMidnight,
  getTasksForToday,
  type TodayPlan,
  type TodayTask,
} from './today-plan';

interface TodayPlanScreenProps {
  plan: TodayPlan;
  notificationMessage?: string | null;
  taskToOpen: TodayTask | null;
  onTaskOpened: () => void;
  onNewBrainDump: () => void;
}

function getTaskKey(task: TodayTask, tasks: TodayTask[]): string {
  return task.id === undefined
    ? `task-${tasks.indexOf(task)}`
    : `id-${typeof task.id}-${task.id}`;
}

function TaskRow({
  task,
  time,
  completed,
  onOpen,
  onToggle,
}: {
  task: TodayTask;
  time?: string;
  completed: boolean;
  onOpen: () => void;
  onToggle: () => void;
}) {
  return (
    <View style={styles.taskCard}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityLabel={task.action_item}
        accessibilityState={{ checked: completed }}
        onPress={onToggle}
        style={({ pressed }) => [
          styles.completionToggle,
          completed && styles.completionToggleChecked,
          pressed && styles.pressed,
        ]}
      >
        {completed ? <Text style={styles.checkmark}>✓</Text> : null}
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${task.action_item}, task details`}
        accessibilityHint="Opens the task description and quick actions"
        onPress={onOpen}
        style={({ pressed }) => [
          styles.taskContent,
          pressed && styles.contentPressed,
        ]}
      >
        <Text
          style={[
            styles.taskActionItem,
            completed && styles.taskActionItemCompleted,
          ]}
        >
          {task.action_item}
        </Text>
        {time ? (
          <View style={styles.targetTimeBadge}>
            <Text style={styles.targetTimeLabel}>Target time</Text>
            <Text style={styles.targetTime}>{time}</Text>
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}

export function TodayPlanScreen({
  plan,
  notificationMessage,
  taskToOpen,
  onTaskOpened,
  onNewBrainDump,
}: TodayPlanScreenProps) {
  const [tasks, setTasks] = useState(plan.tasks);
  const [completedTasks, setCompletedTasks] = useState<Record<string, boolean>>(
    {},
  );
  const [selectedTask, setSelectedTask] = useState<TodayTask | null>(null);
  const [todayDateKey, setTodayDateKey] = useState(() =>
    getLocalDateKey(new Date()),
  );
  const todayDateKeyRef = useRef(todayDateKey);
  const activeTask = taskToOpen ?? selectedTask;
  const { timed, anytime } = getTasksForToday(tasks);
  const dateLabel = new Date(`${todayDateKey}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  useEffect(() => {
    let rolloverTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleNextRollover = () => {
      if (rolloverTimer !== null) {
        clearTimeout(rolloverTimer);
      }
      const now = new Date();
      const nextMidnight = getNextLocalMidnight(now);
      rolloverTimer = setTimeout(
        checkForDateRollover,
        nextMidnight.getTime() - now.getTime() + 50,
      );
    };

    const checkForDateRollover = () => {
      const currentDateKey = getLocalDateKey(new Date());
      if (currentDateKey !== todayDateKeyRef.current) {
        todayDateKeyRef.current = currentDateKey;
        setTodayDateKey(currentDateKey);
        setTasks([]);
        setCompletedTasks({});
        setSelectedTask(null);
        onTaskOpened();
      }
      scheduleNextRollover();
    };

    scheduleNextRollover();
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        checkForDateRollover();
      }
    });

    return () => {
      if (rolloverTimer !== null) {
        clearTimeout(rolloverTimer);
      }
      appStateSubscription.remove();
    };
  }, [onTaskOpened]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>YOUR DAILY PLAN</Text>
          <Text style={styles.title}>Today</Text>
          <Text style={styles.dateLabel}>{dateLabel}</Text>
        </View>

        {tasks.length === 0 ? (
          <Text style={styles.freshDayMessage}>
            A fresh day. Nothing from yesterday carries over.
          </Text>
        ) : null}
        {notificationMessage ? (
          <Text accessibilityRole="status" style={styles.notificationMessage}>
            {notificationMessage}
          </Text>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Today’s timeline</Text>
          {timed.length ? (
            timed.map((task) => {
              const key = getTaskKey(task, tasks);
              return (
                <TaskRow
                  key={key}
                  task={task}
                  time={formatTaskTime(task.scheduled_at)}
                  completed={completedTasks[key] ?? false}
                  onOpen={() => setSelectedTask(task)}
                  onToggle={() => {
                    setCompletedTasks((current) => ({
                      ...current,
                      [key]: !current[key],
                    }));
                  }}
                />
              );
            })
          ) : (
            <Text style={styles.emptyMessage}>
              No timed plans today. That’s okay.
            </Text>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Anytime Today</Text>
          {anytime.length ? (
            anytime.map((task) => {
              const key = getTaskKey(task, tasks);
              return (
                <TaskRow
                  key={key}
                  task={task}
                  completed={completedTasks[key] ?? false}
                  onOpen={() => setSelectedTask(task)}
                  onToggle={() => {
                    setCompletedTasks((current) => ({
                      ...current,
                      [key]: !current[key],
                    }));
                  }}
                />
              );
            })
          ) : (
            <Text style={styles.emptyMessage}>
              Nothing else to fit into the day.
            </Text>
          )}
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={onNewBrainDump}
          style={({ pressed }) => [
            styles.newBrainDumpButton,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.newBrainDumpText}>Start a new brain dump</Text>
        </Pressable>
      </ScrollView>

      <Modal
        animationType="slide"
        onRequestClose={() => {
          setSelectedTask(null);
          onTaskOpened();
        }}
        transparent
        visible={activeTask !== null}
      >
        <View style={styles.sheetOverlay}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close task details"
            onPress={() => {
              setSelectedTask(null);
              onTaskOpened();
            }}
            style={styles.sheetBackdrop}
          />
          {activeTask ? (
            <View
              accessibilityViewIsModal
              style={styles.detailSheet}
            >
              <View style={styles.sheetHandle} />
              <ScrollView
                contentContainerStyle={styles.sheetContent}
                showsVerticalScrollIndicator={false}
              >
                <Text style={styles.sheetEyebrow}>TASK DETAILS</Text>
                <Text style={styles.sheetTitle}>
                  {activeTask.action_item}
                </Text>
                {activeTask.scheduled_at ? (
                  <View style={styles.targetTimeBadge}>
                    <Text style={styles.targetTimeLabel}>Target time</Text>
                    <Text style={styles.targetTime}>
                      {formatTaskTime(activeTask.scheduled_at)}
                    </Text>
                  </View>
                ) : null}
                <Text style={styles.descriptionLabel}>Details</Text>
                <Text style={styles.descriptionText}>
                  {activeTask.description?.trim() ||
                    'No extra details for this task.'}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    completedTasks[getTaskKey(activeTask, tasks)]
                      ? 'Mark task incomplete'
                      : 'Mark task complete'
                  }
                  onPress={() => {
                    const key = getTaskKey(activeTask, tasks);
                    setCompletedTasks((current) => ({
                      ...current,
                      [key]: !current[key],
                    }));
                  }}
                  style={({ pressed }) => [
                    styles.completeAction,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.completeActionText}>
                    {completedTasks[getTaskKey(activeTask, tasks)]
                      ? 'Mark incomplete'
                      : 'Mark complete'}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Delete task"
                  onPress={() => {
                    setTasks((current) =>
                      current.filter(
                        (task) =>
                            activeTask.id === undefined
                              ? task !== activeTask
                              : task.id === undefined ||
                                String(task.id) !== String(activeTask.id),
                      ),
                    );
                    setSelectedTask(null);
                    onTaskOpened();
                  }}
                  style={({ pressed }) => [
                    styles.deleteAction,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.deleteActionText}>Delete task</Text>
                </Pressable>
              </ScrollView>
            </View>
          ) : null}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F6F4EF',
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 22,
    paddingTop: 28,
    paddingBottom: 32,
  },
  header: {
    marginBottom: 28,
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
    fontSize: 34,
    fontWeight: '700',
    lineHeight: 40,
  },
  dateLabel: {
    color: '#696879',
    fontSize: 15,
    marginTop: 5,
  },
  freshDayMessage: {
    backgroundColor: '#EFEDFA',
    borderRadius: 14,
    color: '#5E5B70',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 24,
    padding: 16,
  },
  notificationMessage: {
    color: '#5E5B70',
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 18,
  },
  section: {
    marginBottom: 26,
  },
  sectionTitle: {
    color: '#242337',
    fontSize: 19,
    fontWeight: '700',
    marginBottom: 12,
  },
  taskCard: {
    alignItems: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderColor: '#E8E5EF',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    marginBottom: 10,
    padding: 15,
  },
  completionToggle: {
    alignItems: 'center',
    borderColor: '#B9B5C9',
    borderRadius: 11,
    borderWidth: 1.5,
    height: 23,
    justifyContent: 'center',
    marginRight: 13,
    marginTop: 1,
    width: 23,
  },
  completionToggleChecked: {
    backgroundColor: '#6558C8',
    borderColor: '#6558C8',
  },
  checkmark: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 18,
  },
  taskContent: {
    flex: 1,
  },
  taskActionItem: {
    color: '#302F40',
    fontSize: 17,
    fontWeight: '600',
    lineHeight: 23,
  },
  taskActionItemCompleted: {
    color: '#797786',
    textDecorationLine: 'line-through',
  },
  targetTimeBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#F1EFF8',
    borderRadius: 9,
    flexDirection: 'row',
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  targetTimeLabel: {
    color: '#696879',
    fontSize: 12,
    marginRight: 6,
  },
  targetTime: {
    color: '#514A82',
    fontSize: 12,
    fontWeight: '600',
  },
  emptyMessage: {
    backgroundColor: '#EFEDFA',
    borderRadius: 14,
    color: '#5E5B70',
    fontSize: 14,
    lineHeight: 20,
    padding: 16,
  },
  newBrainDumpButton: {
    alignItems: 'center',
    borderColor: '#D8D4E5',
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: 'center',
    marginTop: 4,
    minHeight: 52,
  },
  newBrainDumpText: {
    color: '#4D4B5C',
    fontSize: 15,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.75,
  },
  contentPressed: {
    opacity: 0.72,
  },
  sheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(36, 35, 55, 0.32)',
  },
  detailSheet: {
    backgroundColor: '#F6F4EF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '82%',
    minHeight: 320,
    paddingTop: 12,
    paddingBottom: 24,
  },
  sheetHandle: {
    alignSelf: 'center',
    backgroundColor: '#D5D2DC',
    borderRadius: 3,
    height: 5,
    marginBottom: 20,
    width: 42,
  },
  sheetContent: {
    paddingHorizontal: 22,
    paddingBottom: 12,
  },
  sheetEyebrow: {
    color: '#6558C8',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.3,
    marginBottom: 8,
  },
  sheetTitle: {
    color: '#242337',
    fontSize: 25,
    fontWeight: '700',
    lineHeight: 32,
  },
  descriptionLabel: {
    color: '#4D4B5C',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 24,
    marginBottom: 8,
  },
  descriptionText: {
    color: '#4D4B5C',
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 24,
  },
  completeAction: {
    alignItems: 'center',
    backgroundColor: '#6558C8',
    borderRadius: 14,
    justifyContent: 'center',
    minHeight: 52,
    marginBottom: 10,
  },
  completeActionText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  deleteAction: {
    alignItems: 'center',
    borderColor: '#D8D4E5',
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 50,
  },
  deleteActionText: {
    color: '#5E5B70',
    fontSize: 15,
    fontWeight: '600',
  },
});
