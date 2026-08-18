export const CRONOGRAMA_AUTO_SCHEDULE_REQUEST_EVENT =
  "demanda:cronograma-auto-schedule-request";
export const CRONOGRAMA_AUTO_SCHEDULE_STATE_EVENT =
  "demanda:cronograma-auto-schedule-state";

export type CronogramaAutoScheduleState = {
  ready: boolean;
  busy: boolean;
};

export function publishCronogramaAutoScheduleState(
  state: CronogramaAutoScheduleState,
): void {
  window.dispatchEvent(
    new CustomEvent<CronogramaAutoScheduleState>(
      CRONOGRAMA_AUTO_SCHEDULE_STATE_EVENT,
      { detail: state },
    ),
  );
}
