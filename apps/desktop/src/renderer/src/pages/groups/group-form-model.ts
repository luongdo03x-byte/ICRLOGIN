export const DELETE_GROUP_CONFIRMATION = 'Delete this group? Profiles in it will move to Ungrouped.';

export type GroupNameValidation =
  | { ok: true; value: string }
  | { ok: false; message: string };

export function validateGroupName(name: string, existingNames: readonly string[]): GroupNameValidation {
  const value = name.trim();
  if (!value) return { ok: false, message: 'Group name is required' };
  if (value.length > 100) return { ok: false, message: 'Group name must be 100 characters or fewer' };
  const normalized = value.toLocaleLowerCase();
  if (existingNames.some((candidate) => candidate.trim().toLocaleLowerCase() === normalized)) {
    return { ok: false, message: 'A group with this name already exists' };
  }
  return { ok: true, value };
}

export function groupNamesExcept(groups: readonly { id: string; name: string }[], excludedId: string): string[] {
  return groups.filter((group) => group.id !== excludedId).map((group) => group.name);
}
