import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { icrClient } from '../../api/icr-client.js';

export const proxiesQueryKey = ['proxies'] as const;

export function useProxiesQuery() {
  return useQuery({ queryKey: proxiesQueryKey, queryFn: icrClient.proxies.list });
}

export function useCreateProxy() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof icrClient.proxies.create>[0]) => icrClient.proxies.create(input),
    onSuccess: async () => { await client.invalidateQueries({ queryKey: proxiesQueryKey }); }
  });
}

export function useUpdateProxy() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Parameters<typeof icrClient.proxies.update>[1] }) => icrClient.proxies.update(id, input),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: proxiesQueryKey }),
        client.invalidateQueries({ queryKey: ['profiles'] })
      ]);
    }
  });
}

export function useDeleteProxy() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => icrClient.proxies.delete(id),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: proxiesQueryKey }),
        client.invalidateQueries({ queryKey: ['profiles'] })
      ]);
    }
  });
}
