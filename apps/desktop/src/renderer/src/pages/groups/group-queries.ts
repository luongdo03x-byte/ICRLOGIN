import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { icrClient } from '../../api/icr-client.js';

export const groupsQueryKey = ['groups'] as const;

export function useGroupsQuery() {
  return useQuery({ queryKey: groupsQueryKey, queryFn: icrClient.groups.list });
}

export function useCreateGroup() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => icrClient.groups.create({ name }),
    onSuccess: async () => { await client.invalidateQueries({ queryKey: groupsQueryKey }); }
  });
}

export function useRenameGroup() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => icrClient.groups.update(id, { name }),
    onSuccess: async () => { await client.invalidateQueries({ queryKey: groupsQueryKey }); }
  });
}

export function useDeleteGroup() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => icrClient.groups.delete(id),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: groupsQueryKey }),
        client.invalidateQueries({ queryKey: ['profiles'] })
      ]);
    }
  });
}
