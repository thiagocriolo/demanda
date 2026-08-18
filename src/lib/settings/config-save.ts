export const CONFIG_SAVE_CONTEXT = Symbol("config-save");

export type ConfigSaveState = {
  active: boolean;
  dirty: boolean;
  saved: boolean;
  saving: boolean;
};

export type ConfigSaveRegistration = {
  setDirty: (dirty: boolean) => void;
  unregister: () => void;
};

export type ConfigSaveContext = {
  state: ConfigSaveState;
  register: (onsave: () => void | Promise<void>) => ConfigSaveRegistration;
  save: () => Promise<void>;
};
