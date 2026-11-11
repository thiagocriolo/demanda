import {
  ProjectApiError,
  archiveProject,
  createProject,
  createProjectFromService,
  deleteProject,
  entityValuesToProjectFromServiceInput,
  entityValuesToProjectInput,
  getProject,
  projectToEntityRecord,
  updateProject,
} from "../../projects/client";
import type { EntityPersistenceAdapter } from "./types";

export const projectEntityAdapter: EntityPersistenceAdapter = {
  async load(id) {
    return projectToEntityRecord(await getProject(id));
  },

  async save({ mode, values, current }) {
    const project =
      mode === "edit" && current
        ? await updateProject(
            current.id,
            entityValuesToProjectInput(values, current),
          )
        : values.sourceServiceId
          ? await createProjectFromService(
              entityValuesToProjectFromServiceInput(values, current),
            )
          : await createProject(entityValuesToProjectInput(values, current));
    return projectToEntityRecord(project);
  },

  async archive(id) {
    await archiveProject(id);
  },

  async delete(id) {
    await deleteProject(id);
  },

  isApiError(cause) {
    return cause instanceof ProjectApiError;
  },
};
