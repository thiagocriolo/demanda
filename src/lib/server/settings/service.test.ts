import { describe, expect, it } from "vitest";
import * as errors from "./errors";
import * as personal from "./personal-service";
import * as service from "./service";
import * as snapshot from "./snapshot-service";
import * as workspace from "./workspace-service";

describe("settings service facade", () => {
  it("preserva as implementações e classes públicas canônicas", () => {
    expect(service.SettingsConflictError).toBe(errors.SettingsConflictError);
    expect(service.SettingsRelationsInvalidError).toBe(
      errors.SettingsRelationsInvalidError,
    );
    expect(service.SettingsVersionConflictError).toBe(
      errors.SettingsVersionConflictError,
    );
    expect(service.getUserSettings).toBe(personal.getUserSettings);
    expect(service.updateUserSettings).toBe(personal.updateUserSettings);
    expect(service.getWorkspaceSettings).toBe(workspace.getWorkspaceSettings);
    expect(service.updateWorkspaceSettings).toBe(
      workspace.updateWorkspaceSettings,
    );
    expect(service.getSettingsSnapshot).toBe(snapshot.getSettingsSnapshot);
    expect(service.importSettingsSnapshot).toBe(
      snapshot.importSettingsSnapshot,
    );
  });
});
