import { useEffect, useState, type DragEvent } from 'react';

import { useAuth } from '../auth/auth-context';
import {
  createAudioFolder,
  createAudioPlaylist,
  createAudioPlaylistSchedule,
  deleteAudioFolder,
  deleteAudioPlaylist,
  deleteAudioPlaylistSchedule,
  deleteAudioTrack,
  getCompanyAudioAutodjState,
  replaceAudioPlaylistItems,
  updateAudioTrack,
  updateCompanyAudioAutodjSettings,
  uploadAudioTracks,
} from '../audio-autodj/api';
import type {
  AudioLibraryTrack,
  AudioPlaylist,
  CompanyAudioAutodjState,
} from '../audio-autodj/types';

type ScheduleDraft = {
  startDay: string;
  startTime: string;
  endDay: string;
  endTime: string;
};

const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const defaultScheduleDraft: ScheduleDraft = {
  startDay: '1',
  startTime: '09:00',
  endDay: '1',
  endTime: '10:00',
};

function formatBytes(value: number): string {
  if (value < 1024) {
    return `${value} B`;
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function formatMinuteOfWeek(value: number): string {
  const dayIndex = Math.floor(value / (24 * 60));
  const minuteOfDay = value % (24 * 60);
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;

  return `${dayLabels[dayIndex] ?? dayLabels[0]} ${hour.toString().padStart(2, '0')}:${minute
    .toString()
    .padStart(2, '0')}`;
}

function toMinuteOfWeek(day: string, time: string): number | null {
  const parsedDay = Number.parseInt(day, 10);
  const [hoursText, minutesText] = time.split(':');
  const parsedHours = Number.parseInt(hoursText ?? '', 10);
  const parsedMinutes = Number.parseInt(minutesText ?? '', 10);

  if (
    Number.isNaN(parsedDay) ||
    Number.isNaN(parsedHours) ||
    Number.isNaN(parsedMinutes) ||
    parsedDay < 0 ||
    parsedDay > 6 ||
    parsedHours < 0 ||
    parsedHours > 23 ||
    parsedMinutes < 0 ||
    parsedMinutes > 59
  ) {
    return null;
  }

  return parsedDay * 24 * 60 + parsedHours * 60 + parsedMinutes;
}

function getScheduleDraftValue(
  drafts: Record<string, ScheduleDraft>,
  playlistId: string
): ScheduleDraft {
  return drafts[playlistId] ?? defaultScheduleDraft;
}

export function AudioAutodjPanel(): JSX.Element {
  const { session } = useAuth();
  const [state, setState] = useState<CompanyAudioAutodjState | null>(null);
  const [statusMessage, setStatusMessage] = useState('Loading AutoDJ.');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [playlistName, setPlaylistName] = useState('');
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [scheduleDrafts, setScheduleDrafts] = useState<Record<string, ScheduleDraft>>({});

  useEffect(() => {
    if (!session?.token) {
      return;
    }

    void loadState();
  }, [session?.token]);

  async function loadState(): Promise<void> {
    if (!session?.token) {
      return;
    }

    setErrorMessage(null);
    setStatusMessage('Refreshing AutoDJ state.');

    try {
      const nextState = await getCompanyAudioAutodjState(session.token);
      setState(nextState);
      setStatusMessage('AutoDJ is ready.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load AutoDJ.');
      setStatusMessage('AutoDJ could not be loaded.');
    }
  }

  async function runMutation(action: () => Promise<void>, successMessage: string): Promise<void> {
    setIsBusy(true);
    setErrorMessage(null);

    try {
      await action();
      await loadState();
      setStatusMessage(successMessage);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Request failed.');
    } finally {
      setIsBusy(false);
    }
  }

  function getTrack(trackId: string): AudioLibraryTrack | null {
    return state?.tracks.find((track) => track.id === trackId) ?? null;
  }

  function getDraggedTrackId(event: DragEvent<HTMLElement>): string | null {
    const directTrackId = event.dataTransfer.getData('text/plain');

    if (directTrackId) {
      return directTrackId;
    }

    return selectedTrackId;
  }

  async function moveTrackToFolder(trackId: string, folderId: string | null): Promise<void> {
    if (!session?.token) {
      return;
    }

    await runMutation(async () => {
      await updateAudioTrack(session.token, trackId, { folderId });
      setSelectedTrackId(trackId);
    }, 'Track moved.');
  }

  async function appendTrackToPlaylist(trackId: string, playlist: AudioPlaylist): Promise<void> {
    if (!session?.token) {
      return;
    }

    const trackIds = playlist.items.map((item) => item.trackId);

    if (!trackIds.includes(trackId)) {
      trackIds.push(trackId);
    }

    await runMutation(async () => {
      await replaceAudioPlaylistItems(session.token, playlist.id, { trackIds });
      setSelectedTrackId(trackId);
    }, 'Playlist updated.');
  }

  async function removeTrackFromPlaylist(trackId: string, playlist: AudioPlaylist): Promise<void> {
    if (!session?.token) {
      return;
    }

    const nextTrackIds = playlist.items
      .filter((item) => item.trackId !== trackId)
      .map((item) => item.trackId);

    await runMutation(async () => {
      await replaceAudioPlaylistItems(session.token, playlist.id, { trackIds: nextTrackIds });
    }, 'Track removed from playlist.');
  }

  async function handleUpload(fileList: FileList | null, folderId: string | null = null): Promise<void> {
    if (!session?.token || !fileList || fileList.length === 0) {
      return;
    }

    const files = Array.from(fileList);

    await runMutation(async () => {
      await uploadAudioTracks(session.token, files, folderId);
    }, 'Tracks uploaded.');
  }

  async function handleCreateFolder(): Promise<void> {
    if (!session?.token || !folderName.trim()) {
      return;
    }

    await runMutation(async () => {
      await createAudioFolder(session.token, { name: folderName.trim() });
      setFolderName('');
    }, 'Folder created.');
  }

  async function handleCreatePlaylist(): Promise<void> {
    if (!session?.token || !playlistName.trim()) {
      return;
    }

    await runMutation(async () => {
      await createAudioPlaylist(session.token, { name: playlistName.trim() });
      setPlaylistName('');
    }, 'Playlist created.');
  }

  async function handleCreateSchedule(playlistId: string): Promise<void> {
    if (!session?.token) {
      return;
    }

    const draft = getScheduleDraftValue(scheduleDrafts, playlistId);
    const startMinuteOfWeek = toMinuteOfWeek(draft.startDay, draft.startTime);
    const endMinuteOfWeek = toMinuteOfWeek(draft.endDay, draft.endTime);

    if (startMinuteOfWeek === null || endMinuteOfWeek === null || endMinuteOfWeek <= startMinuteOfWeek) {
      setErrorMessage('Schedule end must be after schedule start within the same weekly cycle.');
      return;
    }

    await runMutation(async () => {
      await createAudioPlaylistSchedule(session.token, playlistId, {
        startMinuteOfWeek,
        endMinuteOfWeek,
      });
      setScheduleDrafts((currentValue) => ({
        ...currentValue,
        [playlistId]: defaultScheduleDraft,
      }));
    }, 'Schedule saved.');
  }

  async function handleToggleEnabled(): Promise<void> {
    if (!session?.token || !state) {
      return;
    }

    const nextEnabled = !state.enabled;

    await runMutation(async () => {
      await updateCompanyAudioAutodjSettings(session.token, { enabled: nextEnabled });
    }, nextEnabled ? 'AutoDJ turned on.' : 'AutoDJ turned off. The stream will wait only for live source input.');
  }

  if (!session) {
    return <div />;
  }

  const tracks = state?.tracks ?? [];
  const folders = state?.folders ?? [];
  const playlists = state?.playlists ?? [];
  const audioStreamingCount = session.streamings.filter((streaming) => streaming.type === 'audio').length;
  const defaultPlaylist = playlists.find((playlist) => playlist.kind === 'default') ?? null;
  const customPlaylists = playlists.filter((playlist) => playlist.kind === 'custom');
  const autodjIsEnabled = state?.enabled ?? true;

  return (
    <section className="grid gap-6">
      <article className="status-card">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <span className="status-eyebrow">AutoDJ state</span>
            <h2>{autodjIsEnabled ? 'AutoDJ is on' : 'AutoDJ is off'}</h2>
            <p>{statusMessage}</p>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-300">AutoDJ</span>
            <button
              type="button"
              role="switch"
              aria-checked={autodjIsEnabled}
              aria-label={autodjIsEnabled ? 'Turn AutoDJ off' : 'Turn AutoDJ on'}
              disabled={isBusy || !state}
              onClick={() => void handleToggleEnabled()}
              className="h-7 w-12 border border-white/15 bg-slate-900/60 p-0 shadow-none"
            >
              <span
                className={`flex h-full w-full items-center ${autodjIsEnabled ? 'justify-end' : 'justify-start'} px-1`}
                aria-hidden="true"
              >
                <span
                  className={`h-5 w-5 rounded-full ${
                    autodjIsEnabled ? 'bg-emerald-300' : 'bg-slate-300'
                  }`}
                />
              </span>
            </button>
            <span className="text-sm text-slate-300">{autodjIsEnabled ? 'On' : 'Off'}</span>
          </div>
        </div>

        <p className="mt-4 text-sm text-slate-300">
          {autodjIsEnabled
            ? `Live audio still wins first. If there is no live source, scheduled custom playlists or the default 24/7 playlist take over across ${audioStreamingCount} audio signal(s).`
            : 'AutoDJ is disabled. If live goes down, this company stays silent and waits for the client source from BUTT or another encoder.'}
        </p>
        {errorMessage ? <p className="mt-3 text-red-300">{errorMessage}</p> : null}
      </article>

      <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <article className="status-card grid gap-4">
          <div className="section-heading">
            <div>
              <span className="status-eyebrow">Library</span>
              <h2>{tracks.length}</h2>
            </div>
            <p>Folders and music live here. Upload audio, create folders, and drag tracks into folders or playlists.</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <label className="grid gap-2 text-sm text-slate-300">
              <span>Create folder</span>
              <input
                className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white"
                value={folderName}
                onChange={(event) => setFolderName(event.target.value)}
                placeholder="Morning drive"
              />
            </label>
            <button type="button" disabled={isBusy || !folderName.trim()} onClick={() => void handleCreateFolder()}>
              Add folder
            </button>
          </div>

          <label className="grid gap-2 text-sm text-slate-300">
            <span>Upload audio files</span>
            <input
              className="rounded-2xl border border-dashed border-white/20 bg-slate-950/40 px-4 py-4"
              type="file"
              accept="audio/*"
              multiple
              onChange={(event) => void handleUpload(event.target.files)}
            />
          </label>

          <div className="grid gap-3">
            <div
              className="rounded-3xl border border-dashed border-white/15 bg-slate-950/40 p-4"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const trackId = getDraggedTrackId(event);
                if (trackId) {
                  void moveTrackToFolder(trackId, null);
                }
              }}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <span className="status-eyebrow">Root</span>
                  <h3 className="mt-2 text-xl font-semibold">Unsorted library</h3>
                  <p className="text-sm text-slate-300">Drop a track here to move it out of any folder.</p>
                </div>
                {selectedTrackId ? (
                  <button type="button" className="ghost-button" onClick={() => void moveTrackToFolder(selectedTrackId, null)}>
                    Move selected here
                  </button>
                ) : null}
              </div>
            </div>

            {folders.length > 0 ? (
              <div className="grid gap-3 md:grid-cols-2">
                {folders.map((folder) => {
                  const trackCount = tracks.filter((track) => track.folderId === folder.id).length;

                  return (
                    <div
                      key={folder.id}
                      className="rounded-3xl border border-white/10 bg-slate-950/40 p-4"
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => {
                        event.preventDefault();
                        const trackId = getDraggedTrackId(event);
                        if (trackId) {
                          void moveTrackToFolder(trackId, folder.id);
                        }
                      }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <span className="status-eyebrow">Folder</span>
                          <h3 className="mt-2 text-xl font-semibold">{folder.name}</h3>
                          <p className="text-sm text-slate-300">{trackCount} track(s)</p>
                        </div>
                        <div className="grid gap-2">
                          {selectedTrackId ? (
                            <button type="button" className="ghost-button" onClick={() => void moveTrackToFolder(selectedTrackId, folder.id)}>
                              Move selected here
                            </button>
                          ) : null}
                          <button type="button" className="ghost-button" onClick={() => void runMutation(() => deleteAudioFolder(session.token, folder.id), 'Folder removed.')}>
                            Delete folder
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}

            <div className="grid gap-3">
              {tracks.length > 0 ? (
                tracks.map((track) => (
                  <button
                    key={track.id}
                    className={`rounded-3xl border px-4 py-4 text-left shadow-none ${
                      selectedTrackId === track.id
                        ? 'border-cyan-300 bg-cyan-400/10 text-white'
                        : 'border-white/10 bg-slate-950/50 text-white'
                    }`}
                    type="button"
                    draggable
                    onClick={() => setSelectedTrackId(track.id)}
                    onDragStart={(event) => {
                      event.dataTransfer.setData('text/plain', track.id);
                      setSelectedTrackId(track.id);
                    }}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <span className="status-eyebrow">Track</span>
                        <h3 className="mt-2 text-lg font-semibold">{track.originalFileName}</h3>
                        <p>
                          {track.mimeType || 'audio'} · {formatBytes(track.sizeBytes)} · folder:{' '}
                          {folders.find((folder) => folder.id === track.folderId)?.name ?? 'root'}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={(event) => {
                          event.stopPropagation();
                          void runMutation(() => deleteAudioTrack(session.token, track.id), 'Track removed.');
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </button>
                ))
              ) : (
                <article className="status-card empty-state">
                  <p>No tracks uploaded yet.</p>
                </article>
              )}
            </div>
          </div>
        </article>

        <article className="status-card grid gap-4">
          <div className="section-heading">
            <div>
              <span className="status-eyebrow">Playlists</span>
              <h2>{playlists.length}</h2>
            </div>
            <p>Playlists live here. Default is priority 2; custom playlists win with priority 1 only inside their schedules.</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <label className="grid gap-2 text-sm text-slate-300">
              <span>Create custom playlist</span>
              <input
                className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white"
                value={playlistName}
                onChange={(event) => setPlaylistName(event.target.value)}
                placeholder="Lunch special"
              />
            </label>
            <button type="button" disabled={isBusy || !playlistName.trim()} onClick={() => void handleCreatePlaylist()}>
              Add playlist
            </button>
          </div>

          {defaultPlaylist ? (
            <div
              className="rounded-3xl border border-white/10 bg-slate-950/40 p-4"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const trackId = getDraggedTrackId(event);
                if (trackId) {
                  void appendTrackToPlaylist(trackId, defaultPlaylist);
                }
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="status-eyebrow">Priority {defaultPlaylist.priority}</span>
                  <h3 className="mt-2 text-xl font-semibold">{defaultPlaylist.name}</h3>
                  <p className="text-sm text-slate-300">24/7 fallback. Used when AutoDJ is on, there is no live source, and no custom schedule is active.</p>
                </div>
                {selectedTrackId ? (
                  <button type="button" className="ghost-button" onClick={() => void appendTrackToPlaylist(selectedTrackId, defaultPlaylist)}>
                    Add selected track
                  </button>
                ) : null}
              </div>
              <div className="mt-4 grid gap-2">
                {defaultPlaylist.items.length > 0 ? (
                  defaultPlaylist.items.map((item) => (
                    <div key={item.id} className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-900/60 px-3 py-3">
                      <div>
                        <strong>{item.track.originalFileName}</strong>
                        <p className="text-sm text-slate-300">{formatBytes(item.track.sizeBytes)}</p>
                      </div>
                      <button type="button" className="ghost-button" onClick={() => void removeTrackFromPlaylist(item.trackId, defaultPlaylist)}>
                        Remove
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-300">Drop tracks here to build the default rotation.</p>
                )}
              </div>
            </div>
          ) : null}

          <div className="grid gap-4">
            {customPlaylists.length > 0 ? (
              customPlaylists.map((playlist) => {
                const draft = getScheduleDraftValue(scheduleDrafts, playlist.id);

                return (
                  <div
                    key={playlist.id}
                    className="rounded-3xl border border-white/10 bg-slate-950/40 p-4"
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      const trackId = getDraggedTrackId(event);
                      if (trackId) {
                        void appendTrackToPlaylist(trackId, playlist);
                      }
                    }}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <span className="status-eyebrow">Priority {playlist.priority}</span>
                        <h3 className="mt-2 text-xl font-semibold">{playlist.name}</h3>
                        <p className="text-sm text-slate-300">Wins over the default playlist while one of its schedules is active and AutoDJ is on.</p>
                      </div>
                      <div className="grid gap-2">
                        {selectedTrackId ? (
                          <button type="button" className="ghost-button" onClick={() => void appendTrackToPlaylist(selectedTrackId, playlist)}>
                            Add selected track
                          </button>
                        ) : null}
                        <button type="button" className="ghost-button" onClick={() => void runMutation(() => deleteAudioPlaylist(session.token, playlist.id), 'Playlist removed.')}>
                          Delete playlist
                        </button>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-2">
                      {playlist.items.length > 0 ? (
                        playlist.items.map((item) => (
                          <div key={item.id} className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-900/60 px-3 py-3">
                            <div>
                              <strong>{item.track.originalFileName}</strong>
                              <p className="text-sm text-slate-300">{formatBytes(item.track.sizeBytes)}</p>
                            </div>
                            <button type="button" className="ghost-button" onClick={() => void removeTrackFromPlaylist(item.trackId, playlist)}>
                              Remove
                            </button>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-slate-300">Drop tracks here to build this scheduled playlist.</p>
                      )}
                    </div>

                    <div className="mt-5 grid gap-3 rounded-3xl border border-white/10 bg-slate-900/40 p-4">
                      <div>
                        <span className="status-eyebrow">Schedules</span>
                        <h4 className="mt-2 text-lg font-semibold">Weekly windows</h4>
                        <p className="text-sm text-slate-300">If a new window overlaps another custom playlist, the backend rejects it and explains why.</p>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="grid gap-2 text-sm text-slate-300">
                          <span>Start day</span>
                          <select
                            className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white"
                            value={draft.startDay}
                            onChange={(event) =>
                              setScheduleDrafts((currentValue) => ({
                                ...currentValue,
                                [playlist.id]: { ...draft, startDay: event.target.value },
                              }))
                            }
                          >
                            {dayLabels.map((label, index) => (
                              <option key={label} value={index.toString()}>
                                {label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="grid gap-2 text-sm text-slate-300">
                          <span>Start time</span>
                          <input
                            className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white"
                            type="time"
                            value={draft.startTime}
                            onChange={(event) =>
                              setScheduleDrafts((currentValue) => ({
                                ...currentValue,
                                [playlist.id]: { ...draft, startTime: event.target.value },
                              }))
                            }
                          />
                        </label>
                        <label className="grid gap-2 text-sm text-slate-300">
                          <span>End day</span>
                          <select
                            className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white"
                            value={draft.endDay}
                            onChange={(event) =>
                              setScheduleDrafts((currentValue) => ({
                                ...currentValue,
                                [playlist.id]: { ...draft, endDay: event.target.value },
                              }))
                            }
                          >
                            {dayLabels.map((label, index) => (
                              <option key={label} value={index.toString()}>
                                {label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="grid gap-2 text-sm text-slate-300">
                          <span>End time</span>
                          <input
                            className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white"
                            type="time"
                            value={draft.endTime}
                            onChange={(event) =>
                              setScheduleDrafts((currentValue) => ({
                                ...currentValue,
                                [playlist.id]: { ...draft, endTime: event.target.value },
                              }))
                            }
                          />
                        </label>
                      </div>

                      <button type="button" disabled={isBusy} onClick={() => void handleCreateSchedule(playlist.id)}>
                        Add schedule
                      </button>

                      <div className="grid gap-2">
                        {playlist.schedules.length > 0 ? (
                          playlist.schedules.map((schedule) => (
                            <div key={schedule.id} className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-950/50 px-3 py-3">
                              <div>
                                <strong>{formatMinuteOfWeek(schedule.startMinuteOfWeek)} to {formatMinuteOfWeek(schedule.endMinuteOfWeek)}</strong>
                                <p className="text-sm text-slate-300">Priority 1 takes over only inside this window.</p>
                              </div>
                              <button
                                type="button"
                                className="ghost-button"
                                onClick={() =>
                                  void runMutation(
                                    async () => {
                                      await deleteAudioPlaylistSchedule(session.token, playlist.id, schedule.id);
                                    },
                                    'Schedule removed.'
                                  )
                                }
                              >
                                Delete
                              </button>
                            </div>
                          ))
                        ) : (
                          <p className="text-sm text-slate-300">No custom schedule yet.</p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <article className="status-card empty-state">
                <p>No custom playlists yet.</p>
              </article>
            )}
          </div>
        </article>
      </section>
    </section>
  );
}