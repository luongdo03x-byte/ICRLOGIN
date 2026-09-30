import type { ExtensionRecord } from '@icrlogin/shared';

export interface ExtensionRow {
  id: string;
  name: string;
  version: string;
  sourceType: ExtensionRecord['sourceType'];
  enabled: boolean;
  profileCount: number;
  groupCount: number;
  assignmentCount: number;
  createdAt: string;
  updatedAt: string;
}

export function toExtensionRow(extension: ExtensionRecord): ExtensionRow {
  return {
    id: extension.id,
    name: extension.name,
    version: extension.version,
    sourceType: extension.sourceType,
    enabled: extension.enabled,
    profileCount: extension.profileCount,
    groupCount: extension.groupCount,
    assignmentCount: extension.profileCount + extension.groupCount,
    createdAt: extension.createdAt,
    updatedAt: extension.updatedAt
  };
}

export function extensionMutationDisabled(row: ExtensionRow, anyProfileRunning: boolean): boolean {
  return anyProfileRunning && row.assignmentCount > 0;
}

export function extensionAssignmentSummary(row: ExtensionRow): string {
  return `${row.profileCount} profiles · ${row.groupCount} groups`;
}
