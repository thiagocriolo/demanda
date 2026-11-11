import { describe, expect, it } from "vitest";
import * as facade from "./service";
import * as catalog from "./service-catalog";
import * as aggregate from "./project-aggregate";
import * as errors from "./errors";

describe("projects service facade", () => {
  it("preserves the service catalog exports", () => {
    expect(facade.listWorkspaceServices).toBe(catalog.listWorkspaceServices);
    expect(facade.getWorkspaceService).toBe(catalog.getWorkspaceService);
    expect(facade.createWorkspaceService).toBe(catalog.createWorkspaceService);
    expect(facade.updateWorkspaceService).toBe(catalog.updateWorkspaceService);
    expect(facade.archiveWorkspaceService).toBe(
      catalog.archiveWorkspaceService,
    );
  });

  it("preserves the project aggregate exports", () => {
    expect(facade.listWorkspaceProjects).toBe(aggregate.listWorkspaceProjects);
    expect(facade.getWorkspaceProject).toBe(aggregate.getWorkspaceProject);
    expect(facade.createWorkspaceProject).toBe(
      aggregate.createWorkspaceProject,
    );
    expect(facade.updateWorkspaceProject).toBe(
      aggregate.updateWorkspaceProject,
    );
    expect(facade.archiveWorkspaceProject).toBe(
      aggregate.archiveWorkspaceProject,
    );
    expect(facade.createWorkspaceProjectFromService).toBe(
      aggregate.createWorkspaceProjectFromService,
    );
    expect(facade.getWorkspaceProjectOptions).toBe(
      aggregate.getWorkspaceProjectOptions,
    );
  });

  it("preserves the public error constructors", () => {
    expect(facade.ProjectNotFoundError).toBe(errors.ProjectNotFoundError);
    expect(facade.InstitutionalProjectProtectedError).toBe(
      errors.InstitutionalProjectProtectedError,
    );
    expect(facade.ServiceNotFoundError).toBe(errors.ServiceNotFoundError);
    expect(facade.ProjectRelationsInvalidError).toBe(
      errors.ProjectRelationsInvalidError,
    );
    expect(facade.ServiceRelationsInvalidError).toBe(
      errors.ServiceRelationsInvalidError,
    );
    expect(facade.ServiceNameConflictError).toBe(
      errors.ServiceNameConflictError,
    );
  });
});
