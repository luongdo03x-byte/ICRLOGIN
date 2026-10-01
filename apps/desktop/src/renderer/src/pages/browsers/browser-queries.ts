import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { icrClient } from '../../api/icr-client.js';

export const browsersAvailableKey = ['browsers', 'available'] as const;
export const browsersInstalledKey = ['browsers', 'installed'] as const;

export function useAvailableBrowsers() {
  return useQuery({ queryKey: browsersAvailableKey, queryFn: icrClient.browsers.available, retry: 1 });
}

export function useInstalledBrowsers() {
  return useQuery({ queryKey: browsersInstalledKey, queryFn: icrClient.browsers.installed });
}

async function refreshBrowserQueries(client: ReturnType<typeof useQueryClient>): Promise<void> {
  await Promise.all([
    client.refetchQueries({ queryKey: browsersAvailableKey }),
    client.refetchQueries({ queryKey: browsersInstalledKey })
  ]);
}

export function useDownloadBrowser() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (version: string) => icrClient.browsers.download(version),
    onSuccess: async () => refreshBrowserQueries(client)
  });
}

export function useRemoveBrowser() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (version: string) => icrClient.browsers.remove(version),
    onSuccess: async () => refreshBrowserQueries(client)
  });
}

export function useRefreshBrowsers() {
  const client = useQueryClient();
  return () => refreshBrowserQueries(client);
}
