import { describe, expect, it } from "vitest";
import * as aggregate from "./project-aggregate";
import * as commands from "./project-commands";
import * as fromService from "./project-from-service";
import * as readModel from "./project-read-model";

describe("project aggregate facade", () => {
  it("preserves the read model exports", () => {
    expect(aggregate.listWorkspaceProjects).toBe(
      readModel.listWorkspaceProjects,
    );
    expect(aggregate.getWorkspaceProject).toBe(readModel.getWorkspaceProject);
    expect(aggregate.getWorkspaceProjectOptions).toBe(
      readModel.getWorkspaceProjectOptions,
    );
  });

  it("preserves the command exports", () => {
    expect(aggregate.createWorkspaceProject).toBe(
      commands.createWorkspaceProject,
    );
    expect(aggregate.updateWorkspaceProject).toBe(
      commands.updateWorkspaceProject,
    );
    expect(aggregate.archiveWorkspaceProject).toBe(
      commands.archiveWorkspaceProject,
    );
  });

  it("preserves the service installation export", () => {
    expect(aggregate.createWorkspaceProjectFromService).toBe(
      fromService.createWorkspaceProjectFromService,
    );
  });
});
