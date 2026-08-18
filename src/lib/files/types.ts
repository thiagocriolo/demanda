export type StoredFilePurpose = "profile_avatar" | "attachment";
export type StoredFileStatus =
  "pending" | "processing" | "ready" | "failed" | "deleting";

export type StoredFileSummary = {
  id: string;
  purpose: StoredFilePurpose;
  status: StoredFileStatus;
  originalName: string;
  mimeType: string;
  byteSize: number;
  width: number | null;
  height: number | null;
  url: string;
  createdAt: string;
};

export type StoredFileUploadResponse = { file: StoredFileSummary };

export type StorageUsageResponse = {
  storageUsedBytes: number;
  storageReservedBytes: number;
  storageLimitBytes: number | null;
};
