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

export function useDownloadBrowser() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (version: string) => icrClient.browsers.download(version),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: browsersAvailableKey }),
        client.invalidateQueries({ queryKey: browsersInstalledKey })
      ]);
    }
  });
}
