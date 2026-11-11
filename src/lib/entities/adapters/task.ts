import {
  TaskApiError,
  archiveTask,
  createTask,
  entityValuesToTaskCreateInput,
  getTask,
  taskToEntityRecord,
  taskVersionFromRecord,
  updateTaskFromEntityValues,
} from "../../tasks/client";
import type { EntityPersistenceAdapter } from "./types";

export const taskEntityAdapter: EntityPersistenceAdapter = {
  async load(id) {
    return taskToEntityRecord(await getTask(id));
  },

  async save({ mode, values, current }) {
    const task =
      mode === "edit" && current
        ? await updateTaskFromEntityValues(current.id, values, current)
        : await createTask(
            entityValuesToTaskCreateInput(values, current, {
              copy: mode === "create" && Boolean(current?.id),
            }),
          );
    return taskToEntityRecord(task);
  },

  async archive(id, current) {
    const version = current
      ? taskVersionFromRecord(current)
      : (await getTask(id)).version;
    await archiveTask(id, version);
  },

  isApiError(cause) {
    return cause instanceof TaskApiError;
  },
};
