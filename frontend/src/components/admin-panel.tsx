import { useEffect, useMemo, useState } from 'react';

import {
  createCompany,
  createStreaming,
  createUser,
  deleteCompany,
  deleteStreaming,
  deleteUser,
  getAdminOverview,
  updateCompany,
  updateStreaming,
  updateUser,
  type CreateStreamingPayload,
  type CreateUserPayload,
  type UpdateStreamingPayload,
  type UpdateUserPayload,
} from '../admin/api';
import type {
  AdminOverview,
  PublicCompany,
  PublicStreaming,
  PublicUser,
  StreamingType,
  UserRole,
} from '../auth/types';

interface AdminPanelProps {
  token: string;
}

const adminTextCollator = new Intl.Collator('es', {
  numeric: true,
  sensitivity: 'base',
});

interface CompanyRowProps {
  token: string;
  company: PublicCompany;
  onRefresh: () => Promise<void>;
}

interface StreamingRowProps {
  token: string;
  streaming: PublicStreaming;
  companies: PublicCompany[];
  onRefresh: () => Promise<void>;
}

interface UserRowProps {
  token: string;
  user: PublicUser & { company: PublicCompany };
  companies: PublicCompany[];
  onRefresh: () => Promise<void>;
}

function toErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function compareText(left: string, right: string): number {
  return adminTextCollator.compare(left, right);
}

const streamingKeyCharacters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789._~';

function normalizeCompanySlug(companyName: string): string {
  const normalizedName = companyName.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  const slug = normalizedName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug || 'stream';
}

function randomStreamingSuffix(length: number): string {
  const randomValues = crypto.getRandomValues(new Uint8Array(length));

  return Array.from(randomValues, (value) => streamingKeyCharacters[value % streamingKeyCharacters.length]).join('');
}

function buildStreamingKey(companyName: string): string {
  return `${normalizeCompanySlug(companyName)}-${randomStreamingSuffix(5)}`;
}

function CompanyRow({ token, company, onRefresh }: CompanyRowProps): JSX.Element {
  const [name, setName] = useState(company.name);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(company.name);
  }, [company.name]);

  async function handleSave(): Promise<void> {
    setSaving(true);
    setError(null);

    try {
      await updateCompany(token, company.id, { name });
      await onRefresh();
    } catch (saveError) {
      setError(toErrorMessage(saveError, 'Unable to update company.'));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(): Promise<void> {
    setSaving(true);
    setError(null);

    try {
      await deleteCompany(token, company.id);
      await onRefresh();
    } catch (deleteError) {
      setError(toErrorMessage(deleteError, 'Unable to delete company.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className="entity-row">
      <div className="entity-row-head">
        <div>
          <span className="status-eyebrow">Company</span>
          <h4>{company.name}</h4>
          <p>{company.id}</p>
        </div>
        <div className="row-actions">
          <button className="secondary-button" type="button" onClick={() => void handleSave()} disabled={saving}>
            Save
          </button>
          <button className="danger-button" type="button" onClick={() => void handleDelete()} disabled={saving}>
            Delete
          </button>
        </div>
      </div>

      <label className="field compact">
        <span>Name</span>
        <input value={name} onChange={(event) => setName(event.target.value)} />
      </label>

      {error && <p className="error-banner">{error}</p>}
    </article>
  );
}

function StreamingRow({ token, streaming, companies, onRefresh }: StreamingRowProps): JSX.Element {
  const [name, setName] = useState(streaming.name);
  const [companyId, setCompanyId] = useState(streaming.companyId);
  const [type, setType] = useState<StreamingType>(streaming.type);
  const [ingestKey, setIngestKey] = useState(streaming.ingestKey);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(streaming.name);
    setCompanyId(streaming.companyId);
    setType(streaming.type);
    setIngestKey(streaming.ingestKey);
  }, [streaming.companyId, streaming.ingestKey, streaming.name, streaming.type]);

  const selectedCompanyName = companies.find((entry) => entry.id === companyId)?.name ?? companyId;

  async function handleSave(): Promise<void> {
    setSaving(true);
    setError(null);

    const trimmedIngestKey = ingestKey.trim();

    if (!trimmedIngestKey) {
      setError('Stream key is required.');
      setSaving(false);
      return;
    }

    try {
      const payload: UpdateStreamingPayload = { companyId, type, name };

      if (trimmedIngestKey !== streaming.ingestKey) {
        payload.ingestKey = trimmedIngestKey;
      }

      await updateStreaming(token, streaming.id, payload);
      await onRefresh();
    } catch (saveError) {
      setError(toErrorMessage(saveError, 'Unable to update streaming.'));
    } finally {
      setSaving(false);
    }
  }

  function handleGenerateKey(): void {
    setIngestKey(buildStreamingKey(selectedCompanyName));
  }

  async function handleDelete(): Promise<void> {
    setSaving(true);
    setError(null);

    try {
      await deleteStreaming(token, streaming.id);
      await onRefresh();
    } catch (deleteError) {
      setError(toErrorMessage(deleteError, 'Unable to delete streaming.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className="entity-row">
      <div className="entity-row-head">
        <div>
          <span className="status-eyebrow">Streaming</span>
          <h4>{streaming.name}</h4>
          <p>{streaming.type} · {selectedCompanyName}</p>
        </div>
        <div className="row-actions">
          <button className="secondary-button" type="button" onClick={() => void handleSave()} disabled={saving}>
            Save
          </button>
          <button className="danger-button" type="button" onClick={() => void handleDelete()} disabled={saving}>
            Delete
          </button>
        </div>
      </div>

      <div className="form-grid">
        <label className="field compact">
          <span>Name</span>
          <input value={name} onChange={(event) => setName(event.target.value)} />
        </label>

        <label className="field compact">
          <span>Type</span>
          <select value={type} onChange={(event) => setType(event.target.value as StreamingType)}>
            <option value="audio">Audio</option>
            <option value="video">Video</option>
          </select>
        </label>

        <label className="field compact">
          <span>Company</span>
          <select value={companyId} onChange={(event) => setCompanyId(event.target.value)}>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
        </label>

        <label className="field compact">
          <span>Stream key</span>
          <div className="field-inline-actions">
            <input value={ingestKey} onChange={(event) => setIngestKey(event.target.value)} />
            <button className="secondary-button streaming-inline-button" type="button" onClick={handleGenerateKey} disabled={saving}>
              Generate key
            </button>
          </div>
          <p className="field-hint">Only super admin can change this. Use the company slug plus 5 safe characters.</p>
        </label>
      </div>

      {error && <p className="error-banner">{error}</p>}
    </article>
  );
}

function UserRow({ token, user, companies, onRefresh }: UserRowProps): JSX.Element {
  const [email, setEmail] = useState(user.email);
  const [displayName, setDisplayName] = useState(user.displayName);
  const [companyId, setCompanyId] = useState(user.companyId);
  const [role, setRole] = useState<UserRole>(user.role);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setEmail(user.email);
    setDisplayName(user.displayName);
    setCompanyId(user.companyId);
    setRole(user.role);
    setPassword('');
  }, [user.companyId, user.displayName, user.email, user.role]);

  async function handleSave(): Promise<void> {
    setSaving(true);
    setError(null);

    const payload: UpdateUserPayload = {
      companyId,
      email,
      displayName,
      role,
    };

    if (password) {
      payload.password = password;
    }

    try {
      await updateUser(token, user.id, payload);
      setPassword('');
      await onRefresh();
    } catch (saveError) {
      setError(toErrorMessage(saveError, 'Unable to update user.'));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(): Promise<void> {
    setSaving(true);
    setError(null);

    try {
      await deleteUser(token, user.id);
      await onRefresh();
    } catch (deleteError) {
      setError(toErrorMessage(deleteError, 'Unable to delete user.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className="entity-row">
      <div className="entity-row-head">
        <div>
          <span className="status-eyebrow">User</span>
          <h4>{user.displayName || user.email}</h4>
          <p>{user.email} · {user.company.name}</p>
        </div>
        <div className="row-actions">
          <button className="secondary-button" type="button" onClick={() => void handleSave()} disabled={saving}>
            Save
          </button>
          <button className="danger-button" type="button" onClick={() => void handleDelete()} disabled={saving}>
            Delete
          </button>
        </div>
      </div>

      <div className="form-grid">
        <label className="field compact">
          <span>Email</span>
          <input value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>

        <label className="field compact">
          <span>Name</span>
          <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
        </label>

        <label className="field compact">
          <span>Company</span>
          <select value={companyId} onChange={(event) => setCompanyId(event.target.value)}>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
        </label>

        <label className="field compact">
          <span>Role</span>
          <select value={role} onChange={(event) => setRole(event.target.value as UserRole)}>
            <option value="user">User</option>
            <option value="super_admin">Super admin</option>
          </select>
        </label>

        <label className="field compact">
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Leave blank to keep current"
          />
        </label>
      </div>

      {error && <p className="error-banner">{error}</p>}
    </article>
  );
}

export function AdminPanel({ token }: AdminPanelProps): JSX.Element {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState('');
  const [userForm, setUserForm] = useState<CreateUserPayload>({
    companyId: '',
    email: '',
    password: '',
    displayName: '',
    role: 'user',
  });
  const [streamingForm, setStreamingForm] = useState<CreateStreamingPayload>({
    companyId: '',
    name: '',
    type: 'audio',
  });

  const companies = useMemo(
    () => [...(overview?.companies ?? [])].sort((left, right) => compareText(left.name, right.name)),
    [overview?.companies]
  );
  const companyNameById = useMemo(
    () => new Map(companies.map((company) => [company.id, company.name])),
    [companies]
  );
  const users = useMemo(
    () =>
      [...(overview?.users ?? [])].sort((left, right) => {
        const companyComparison = compareText(left.company.name, right.company.name);

        if (companyComparison !== 0) {
          return companyComparison;
        }

        const displayNameComparison = compareText(left.displayName || left.email, right.displayName || right.email);

        if (displayNameComparison !== 0) {
          return displayNameComparison;
        }

        return compareText(left.email, right.email);
      }),
    [overview?.users]
  );
  const streamings = useMemo(
    () =>
      [...(overview?.streamings ?? [])].sort((left, right) => {
        const leftCompanyName = companyNameById.get(left.companyId) ?? left.companyId;
        const rightCompanyName = companyNameById.get(right.companyId) ?? right.companyId;
        const companyComparison = compareText(leftCompanyName, rightCompanyName);

        if (companyComparison !== 0) {
          return companyComparison;
        }

        const nameComparison = compareText(left.name, right.name);

        if (nameComparison !== 0) {
          return nameComparison;
        }

        return compareText(left.type, right.type);
      }),
    [companyNameById, overview?.streamings]
  );

  const defaultCompanyId = useMemo(() => companies[0]?.id ?? '', [companies]);

  async function loadOverview(): Promise<void> {
    setLoading(true);

    try {
      const payload = await getAdminOverview(token);
      setOverview(payload);
      setError(null);
    } catch (loadError) {
      setError(toErrorMessage(loadError, 'Unable to load admin overview.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadOverview();
  }, [token]);

  useEffect(() => {
    if (!defaultCompanyId) {
      return;
    }

    setUserForm((current) => (current.companyId ? current : { ...current, companyId: defaultCompanyId }));
    setStreamingForm((current) =>
      current.companyId ? current : { ...current, companyId: defaultCompanyId }
    );
  }, [defaultCompanyId]);

  async function handleCreateCompany(): Promise<void> {
    if (!companyName.trim()) {
      setError('Company name is required.');
      return;
    }

    try {
      await createCompany(token, { name: companyName });
      setCompanyName('');
      await loadOverview();
    } catch (createError) {
      setError(toErrorMessage(createError, 'Unable to create company.'));
    }
  }

  async function handleCreateUser(): Promise<void> {
    try {
      await createUser(token, userForm);
      setUserForm({
        companyId: defaultCompanyId,
        email: '',
        password: '',
        displayName: '',
        role: 'user',
      });
      await loadOverview();
    } catch (createError) {
      setError(toErrorMessage(createError, 'Unable to create user.'));
    }
  }

  async function handleCreateStreaming(): Promise<void> {
    try {
      await createStreaming(token, streamingForm);
      setStreamingForm({
        companyId: defaultCompanyId,
        name: '',
        type: 'audio',
      });
      await loadOverview();
    } catch (createError) {
      setError(toErrorMessage(createError, 'Unable to create streaming.'));
    }
  }

  if (loading) {
    return (
      <section className="admin-panel">
        <article className="status-card">
          <span className="status-eyebrow">Admin console</span>
          <h2>Loading workspace</h2>
          <p>Fetching companies, users, and streamings.</p>
        </article>
      </section>
    );
  }

  if (!overview) {
    return (
      <section className="admin-panel">
        <article className="status-card">
          <span className="status-eyebrow">Admin console</span>
          <h2>Workspace unavailable</h2>
          <p>{error ?? 'No data available.'}</p>
        </article>
      </section>
    );
  }

  return (
    <section className="admin-panel">
      <div className="admin-panel-head">
        <div>
          <span className="status-eyebrow">Super admin</span>
          <h2>Workspace management</h2>
          <p>Create companies, users, and streamings, then review the sorted records below.</p>
        </div>
        <button className="secondary-button" type="button" onClick={() => void loadOverview()}>
          Refresh
        </button>
      </div>

      {error && <p className="error-banner">{error}</p>}

      <div className="admin-grid">
        <section className="entity-card">
          <div className="entity-card-head">
            <div>
              <span className="status-eyebrow">Companies</span>
              <h3>{companies.length}</h3>
              <p>Create one, then keep the list below tidy.</p>
            </div>
          </div>

          <div className="entity-create">
            <div className="form-grid">
              <label className="field compact">
                <span>New company name</span>
                <input value={companyName} onChange={(event) => setCompanyName(event.target.value)} />
              </label>
            </div>

            <button type="button" onClick={() => void handleCreateCompany()}>
              Create company
            </button>
          </div>

          <div className="entity-list-viewport">
            <div className="entity-list">
              {companies.map((company) => (
                <CompanyRow key={company.id} token={token} company={company} onRefresh={loadOverview} />
              ))}
            </div>
          </div>
        </section>

        <section className="entity-card">
          <div className="entity-card-head">
            <div>
              <span className="status-eyebrow">Users</span>
              <h3>{users.length}</h3>
              <p>Create users, assign their company, and keep the list below sorted.</p>
            </div>
          </div>

          <div className="entity-create">
            <div className="form-grid">
              <label className="field compact">
                <span>Email</span>
                <input
                  value={userForm.email}
                  onChange={(event) => setUserForm((current) => ({ ...current, email: event.target.value }))}
                />
              </label>
              <label className="field compact">
                <span>Display name</span>
                <input
                  value={userForm.displayName}
                  onChange={(event) =>
                    setUserForm((current) => ({ ...current, displayName: event.target.value }))
                  }
                />
              </label>
              <label className="field compact">
                <span>Password</span>
                <input
                  type="password"
                  value={userForm.password}
                  onChange={(event) => setUserForm((current) => ({ ...current, password: event.target.value }))}
                />
              </label>
              <label className="field compact">
                <span>Company</span>
                <select
                  value={userForm.companyId}
                  onChange={(event) => setUserForm((current) => ({ ...current, companyId: event.target.value }))}
                >
                  {companies.map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field compact">
                <span>Role</span>
                <select
                  value={userForm.role}
                  onChange={(event) =>
                    setUserForm((current) => ({ ...current, role: event.target.value as UserRole }))
                  }
                >
                  <option value="user">User</option>
                  <option value="super_admin">Super admin</option>
                </select>
              </label>
            </div>

            <button type="button" onClick={() => void handleCreateUser()}>
              Create user
            </button>
          </div>

          <div className="entity-list-viewport">
            <div className="entity-list">
              {users.map((user) => (
                <UserRow key={user.id} token={token} user={user} companies={companies} onRefresh={loadOverview} />
              ))}
            </div>
          </div>
        </section>

        <section className="entity-card">
          <div className="entity-card-head">
            <div>
              <span className="status-eyebrow">Streamings</span>
              <h3>{streamings.length}</h3>
              <p>Create audio or video streamings and keep the list ordered below.</p>
            </div>
          </div>

          <div className="entity-create">
            <div className="form-grid">
              <label className="field compact">
                <span>Name</span>
                <input
                  value={streamingForm.name}
                  onChange={(event) =>
                    setStreamingForm((current) => ({ ...current, name: event.target.value }))
                  }
                />
              </label>
              <label className="field compact">
                <span>Type</span>
                <select
                  value={streamingForm.type}
                  onChange={(event) =>
                    setStreamingForm((current) => ({ ...current, type: event.target.value as StreamingType }))
                  }
                >
                  <option value="audio">Audio</option>
                  <option value="video">Video</option>
                </select>
              </label>
              <label className="field compact">
                <span>Company</span>
                <select
                  value={streamingForm.companyId}
                  onChange={(event) =>
                    setStreamingForm((current) => ({ ...current, companyId: event.target.value }))
                  }
                >
                  {companies.map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <button type="button" onClick={() => void handleCreateStreaming()}>
              Create streaming
            </button>
          </div>

          <div className="entity-list-viewport">
            <div className="entity-list">
              {streamings.map((streaming) => (
                <StreamingRow
                  key={streaming.id}
                  token={token}
                  streaming={streaming}
                  companies={companies}
                  onRefresh={loadOverview}
                />
              ))}
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}