export type AccessPath = (path: string) => Promise<unknown>;

export async function checkExecutableAvailable(path: string, accessPath: AccessPath): Promise<boolean> {
  try {
    await accessPath(path);
    return true;
  } catch {
    return false;
  }
}
