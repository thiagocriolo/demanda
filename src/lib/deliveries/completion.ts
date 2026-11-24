export const DELIVERY_COMPLETED_STATUS = "conclusao";
export const TASK_COMPLETED_STATUS = "concluida";

export function areAllDeliveryTasksCompleted(
  taskStatuses: readonly string[],
): boolean {
  return (
    taskStatuses.length > 0 &&
    taskStatuses.every((status) => status === TASK_COMPLETED_STATUS)
  );
}

/**
 * Automatically moves a delivery to `conclusao` when an update transitions its
 * tasks from incomplete to all completed without an explicit manual status change.
 * Manual status changes (including moving to `conclusao` with pending tasks or
 * moving away from `conclusao` with completed tasks) are always respected.
 */
export function resolveDeliveryStatusAfterTaskUpdate({
  previousStatus,
  requestedStatus,
  previousTaskStatuses,
  nextTaskStatuses,
}: {
  previousStatus: string;
  requestedStatus: string;
  previousTaskStatuses: readonly string[];
  nextTaskStatuses: readonly string[];
}): string {
  const becameAllCompleted =
    areAllDeliveryTasksCompleted(nextTaskStatuses) &&
    !areAllDeliveryTasksCompleted(previousTaskStatuses);

  if (
    becameAllCompleted &&
    requestedStatus === previousStatus &&
    requestedStatus !== DELIVERY_COMPLETED_STATUS
  ) {
    return DELIVERY_COMPLETED_STATUS;
  }

  return requestedStatus;
}
