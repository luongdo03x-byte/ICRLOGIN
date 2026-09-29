export class FixedWindowRateLimiter {
  private readonly buckets = new Map<string, { start: number; count: number }>();

  constructor(
    private readonly limit = 100,
    private readonly now: () => number = () => Date.now()
  ) {}

  allow(key: string): boolean {
    const current = this.now();
    let bucket = this.buckets.get(key);
    if (!bucket || current - bucket.start >= 1000) {
      bucket = { start: current, count: 0 };
      this.buckets.set(key, bucket);
    }
    bucket.count += 1;
    return bucket.count <= this.limit;
  }
}
