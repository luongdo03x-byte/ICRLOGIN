export class ProfileOperationLock {
  private readonly tails = new Map<string, Promise<void>>();

  async runExclusive<T>(profileId: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(profileId) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const tail = previous.catch(() => undefined).then(() => gate);
    this.tails.set(profileId, tail);

    await previous.catch(() => undefined);
    try {
      return await operation();
    } finally {
      release();
      if (this.tails.get(profileId) === tail) this.tails.delete(profileId);
    }
  }
}
