import { useEffect, useState } from 'react';

type Health = { status: 'ok'; dataRoot: string; runningRuntimeCount: number };

type IcrWindow = Window & { icr: { health(): Promise<Health> } };

export function App() {
  const [health, setHealth] = useState<Health | null>(null);
  useEffect(() => {
    void (window as unknown as IcrWindow).icr.health().then(setHealth);
  }, []);
  return (
    <main>
      <h1>ICRLogin</h1>
      <p>{health ? `Core ${health.status}` : 'Starting core…'}</p>
      <p>Data: {health?.dataRoot ?? '…'}</p>
      <p>Running profiles: {health?.runningRuntimeCount ?? 0}</p>
    </main>
  );
}
