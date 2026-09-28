import { useMemo, useState } from 'react';
import type { Group } from '@icrlogin/shared';
import { DELETE_GROUP_CONFIRMATION, validateGroupName } from './group-form-model.js';
import { useCreateGroup, useDeleteGroup, useGroupsQuery, useRenameGroup } from './group-queries.js';

export function GroupsPage() {
  const groups = useGroupsQuery();
  const createGroup = useCreateGroup();
  const renameGroup = useRenameGroup();
  const deleteGroup = useDeleteGroup();
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<Group | null>(null);
  const [error, setError] = useState<string | null>(null);

  const existingNames = useMemo(() => groups.data?.map((group) => group.name) ?? [], [groups.data]);

  async function submitCreate() {
    const validation = validateGroupName(name, existingNames);
    if (!validation.ok) { setError(validation.message); return; }
    setError(null);
    await createGroup.mutateAsync(validation.value);
    setName('');
  }

  async function submitRename() {
    if (!editing) return;
    const validation = validateGroupName(
      editing.name,
      existingNames.filter((candidate) => candidate.toLocaleLowerCase() !== editing.name.trim().toLocaleLowerCase())
    );
    if (!validation.ok) { setError(validation.message); return; }
    setError(null);
    await renameGroup.mutateAsync({ id: editing.id, name: validation.value });
    setEditing(null);
  }

  async function confirmDelete(group: Group) {
    if (!window.confirm(`${DELETE_GROUP_CONFIRMATION}\n\n${group.name} (${group.profileCount} profiles)`)) return;
    await deleteGroup.mutateAsync(group.id);
  }

  if (groups.isError) return <div className="error-panel">Unable to load groups.</div>;

  return <div className="page-frame">
    <header className="page-header">
      <div><p className="eyebrow">ORGANIZE PROFILES</p><h1>Groups</h1><p className="page-subtitle">Create groups and keep profiles organized without changing profile data.</p></div>
    </header>
    <section className="table-card">
      <div className="toolbar">
        <input aria-label="New group name" placeholder="New group name" value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void submitCreate(); }} />
        <button className="btn primary" disabled={createGroup.isPending} onClick={() => void submitCreate()}>Create group</button>
      </div>
      {error ? <p className="form-error">{error}</p> : null}
      {groups.isLoading ? <div className="table-loading">Loading groups…</div> : groups.data?.length ? <table className="data-table">
        <thead><tr><th>Name</th><th>Profiles</th><th>Updated</th><th className="actions-col">Actions</th></tr></thead>
        <tbody>{groups.data.map((group) => <tr key={group.id}>
          <td>{editing?.id === group.id ? <input aria-label={`Rename ${group.name}`} value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} /> : <strong>{group.name}</strong>}</td>
          <td>{group.profileCount}</td>
          <td className="muted">{new Date(group.updatedAt).toLocaleString()}</td>
          <td><div className="row-actions">
            {editing?.id === group.id ? <><button className="icon-btn" onClick={() => void submitRename()}>Save</button><button className="icon-btn" onClick={() => setEditing(null)}>Cancel</button></> : <button className="icon-btn" onClick={() => { setError(null); setEditing(group); }}>Rename</button>}
            <button className="icon-btn danger-soft" disabled={deleteGroup.isPending} onClick={() => void confirmDelete(group)}>Delete</button>
          </div></td>
        </tr>)}</tbody>
      </table> : <div className="table-empty">No groups yet. Profiles without a group remain in Ungrouped.</div>}
    </section>
  </div>;
}
