import { useEffect, useState, type DragEvent } from 'react';
import { createPortal } from 'react-dom';

import { useAuth } from '../auth/auth-context';
import {
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
  AudioLibraryFolder,
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

type ScheduleDayOption = {
  value: string;
  label: string;
};

const dayLabels = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];
const scheduleDayOptions: ScheduleDayOption[] = [
  { value: '1', label: 'Lunes' },
  { value: '2', label: 'Martes' },
  { value: '3', label: 'Miercoles' },
  { value: '4', label: 'Jueves' },
  { value: '5', label: 'Viernes' },
  { value: '6', label: 'Sabado' },
  { value: '0', label: 'Domingo' },
];
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

function getTrackFolderName(track: AudioLibraryTrack, folders: AudioLibraryFolder[]): string {
  return folders.find((folder) => folder.id === track.folderId)?.name ?? 'root';
}

function ScheduleDayGroup({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (nextValue: string) => void;
}): JSX.Element {
  return (
    <div className="audio-schedule-day-group">
      <span className="audio-schedule-group-label">{label}</span>
      <div className="audio-day-list">
        {scheduleDayOptions.map((option) => (
          <label
            key={option.value}
            className={`audio-day-option ${value === option.value ? 'audio-day-option--selected' : ''}`}
          >
            <input type="checkbox" checked={value === option.value} onChange={() => onChange(option.value)} />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

export function AudioAutodjPanel(): JSX.Element {
  const { session } = useAuth();
  const [state, setState] = useState<CompanyAudioAutodjState | null>(null);
  const [statusMessage, setStatusMessage] = useState('Loading AutoDJ.');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [playlistName, setPlaylistName] = useState('');
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [scheduleDrafts, setScheduleDrafts] = useState<Record<string, ScheduleDraft>>({});
  const [scheduleModalPlaylistId, setScheduleModalPlaylistId] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [debouncedSearchText, setDebouncedSearchText] = useState('');

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

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedSearchText(searchText);
    }, 2000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [searchText]);

  useEffect(() => {
    if (!scheduleModalPlaylistId) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [scheduleModalPlaylistId]);

  useEffect(() => {
    if (!scheduleModalPlaylistId) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setScheduleModalPlaylistId(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [scheduleModalPlaylistId]);

  useEffect(() => {
    if (!scheduleModalPlaylistId) {
      return;
    }

    const playlistExists = state?.playlists.some(
      (playlist) => playlist.id === scheduleModalPlaylistId && playlist.kind === 'custom'
    );

    if (!playlistExists) {
      setScheduleModalPlaylistId(null);
    }
  }, [scheduleModalPlaylistId, state]);

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
  const scheduleModalPlaylist = scheduleModalPlaylistId
    ? playlists.find((playlist) => playlist.id === scheduleModalPlaylistId && playlist.kind === 'custom') ?? null
    : null;
  const scheduleModalDraft = scheduleModalPlaylist
    ? getScheduleDraftValue(scheduleDrafts, scheduleModalPlaylist.id)
    : defaultScheduleDraft;
  const searchTerm = debouncedSearchText.trim().toLowerCase();
  const isSearchPending = searchText !== debouncedSearchText;
  const visibleTracks = tracks.filter((track) => {
    if (!searchTerm) {
      return true;
    }

    return [track.originalFileName, track.mimeType, getTrackFolderName(track, folders)].some((value) =>
      value.toLowerCase().includes(searchTerm)
    );
  });

  const scheduleModal =
    scheduleModalPlaylist && typeof document !== 'undefined'
      ? createPortal(
          <div
            className="audio-schedule-modal-backdrop"
            role="presentation"
            onClick={() => setScheduleModalPlaylistId(null)}
          >
            <section
              className="audio-schedule-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby={`audio-schedule-modal-title-${scheduleModalPlaylist.id}`}
              onClick={(event) => event.stopPropagation()}
            >
              <header className="audio-schedule-modal-head">
                <div>
                  <span className="status-eyebrow">Schedules</span>
                  <h3 id={`audio-schedule-modal-title-${scheduleModalPlaylist.id}`}>{scheduleModalPlaylist.name}</h3>
                  <p>Use Monday to Sunday checkboxes and 24h times to define the active window.</p>
                </div>
                <button type="button" className="ghost-button" onClick={() => setScheduleModalPlaylistId(null)}>
                  Close
                </button>
              </header>

              <div className="audio-schedule-modal-body">
                <div className="audio-schedule-modal-stack">
                  <section className="audio-schedule-panel">
                    <div>
                      <span className="status-eyebrow">Create window</span>
                      <h4 className="mt-2 text-lg font-semibold">New weekly schedule</h4>
                      <p className="text-sm text-slate-300">Priority 1 takes over only inside this range.</p>
                    </div>

                    <div className="audio-schedule-field-stack">
                      <ScheduleDayGroup
                        label="Start day"
                        value={scheduleModalDraft.startDay}
                        onChange={(nextValue) =>
                          setScheduleDrafts((currentValue) => ({
                            ...currentValue,
                            [scheduleModalPlaylist.id]: { ...scheduleModalDraft, startDay: nextValue },
                          }))
                        }
                      />

                      <label className="audio-schedule-time-field">
                        <span className="audio-schedule-group-label">Start time</span>
                        <input
                          type="time"
                          step={60}
                          value={scheduleModalDraft.startTime}
                          onChange={(event) =>
                            setScheduleDrafts((currentValue) => ({
                              ...currentValue,
                              [scheduleModalPlaylist.id]: { ...scheduleModalDraft, startTime: event.target.value },
                            }))
                          }
                        />
                        <p>Formato 24h, por ejemplo 23:30.</p>
                      </label>

                      <ScheduleDayGroup
                        label="End day"
                        value={scheduleModalDraft.endDay}
                        onChange={(nextValue) =>
                          setScheduleDrafts((currentValue) => ({
                            ...currentValue,
                            [scheduleModalPlaylist.id]: { ...scheduleModalDraft, endDay: nextValue },
                          }))
                        }
                      />

                      <label className="audio-schedule-time-field">
                        <span className="audio-schedule-group-label">End time</span>
                        <input
                          type="time"
                          step={60}
                          value={scheduleModalDraft.endTime}
                          onChange={(event) =>
                            setScheduleDrafts((currentValue) => ({
                              ...currentValue,
                              [scheduleModalPlaylist.id]: { ...scheduleModalDraft, endTime: event.target.value },
                            }))
                          }
                        />
                        <p>Formato 24h, por ejemplo 23:30.</p>
                      </label>
                    </div>

                    <button type="button" disabled={isBusy} onClick={() => void handleCreateSchedule(scheduleModalPlaylist.id)}>
                      Add schedule
                    </button>
                  </section>

                  <section className="audio-schedule-panel">
                    <div>
                      <span className="status-eyebrow">Current windows</span>
                      <h4 className="mt-2 text-lg font-semibold">Active schedule list</h4>
                      <p className="text-sm text-slate-300">Remove any window that should stop controlling the playlist.</p>
                    </div>

                    <div className="audio-schedule-list">
                      {scheduleModalPlaylist.schedules.length > 0 ? (
                        scheduleModalPlaylist.schedules.map((schedule) => (
                          <div key={schedule.id} className="audio-schedule-item">
                            <div>
                              <strong>
                                {formatMinuteOfWeek(schedule.startMinuteOfWeek)} to {formatMinuteOfWeek(schedule.endMinuteOfWeek)}
                              </strong>
                              <p>Priority 1 takes over only inside this window.</p>
                            </div>
                            <button
                              type="button"
                              className="ghost-button"
                              onClick={() =>
                                void runMutation(
                                  async () => {
                                    await deleteAudioPlaylistSchedule(session.token, scheduleModalPlaylist.id, schedule.id);
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
                        <article className="audio-track-empty">
                          <strong>No custom schedule yet.</strong>
                          <p>Create the first weekly window in the form above.</p>
                        </article>
                      )}
                    </div>
                  </section>
                </div>
              </div>
            </section>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <section className="grid gap-6">
        <article className="status-card audio-autodj-hero grid gap-5">
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

        <div className="audio-autodj-metrics">
          <div className="audio-autodj-metric">
            <strong>{tracks.length}</strong>
            <span>tracks uploaded</span>
          </div>
          <div className="audio-autodj-metric">
            <strong>{folders.length}</strong>
            <span>folders ready</span>
          </div>
          <div className="audio-autodj-metric">
            <strong>{playlists.length}</strong>
            <span>playlists</span>
          </div>
          <div className="audio-autodj-metric">
            <strong>{audioStreamingCount}</strong>
            <span>audio signals</span>
          </div>
        </div>
      </article>

      <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <article className="status-card audio-library-card grid gap-5">
          <div className="section-heading">
            <div>
              <span className="status-eyebrow">Library</span>
              <h2>{tracks.length}</h2>
            </div>
            <p>Upload audio, search by name, codec, or folder, and drag tracks into folders or playlists.</p>
          </div>

          <div className="audio-library-toolbar">
            <label className="audio-search-card">
              <span className="status-eyebrow">Search music</span>
              <input
                type="search"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="Search by file, format, or folder"
              />
              <div className="audio-search-status">
                <p>
                  {searchText
                    ? isSearchPending
                      ? 'Applying the filter after a 2 second pause.'
                      : `${visibleTracks.length} result(s) from ${tracks.length} track(s).`
                    : 'The search waits 2 seconds after you stop typing.'}
                </p>
                {searchText ? (
                  <span className="audio-track-badge">{isSearchPending ? 'Debouncing' : 'Ready'}</span>
                ) : null}
              </div>
            </label>

            <label className="audio-upload-card">
              <span className="status-eyebrow">Upload audio files</span>
              <input
                type="file"
                accept="audio/*"
                multiple
                onChange={(event) => void handleUpload(event.target.files)}
              />
              <p>Drop music here and keep it in this company library for playlists and folder drops.</p>
            </label>
          </div>

          <div className="grid gap-3">
            <div
              className="audio-folder-card audio-folder-card--root"
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
              <div className="audio-folder-grid">
                {folders.map((folder) => {
                  const trackCount = tracks.filter((track) => track.folderId === folder.id).length;

                  return (
                    <div
                      key={folder.id}
                      className="audio-folder-card"
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

            <div className="audio-track-grid">
              {visibleTracks.length > 0 ? (
                visibleTracks.map((track) => {
                  const folderName = getTrackFolderName(track, folders);

                  return (
                    <article
                      key={track.id}
                      className={`audio-track-card ${selectedTrackId === track.id ? 'audio-track-card--selected' : ''}`}
                      role="button"
                      tabIndex={0}
                      aria-pressed={selectedTrackId === track.id}
                      aria-label={`Select ${track.originalFileName}`}
                      draggable
                      onClick={() => setSelectedTrackId(track.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setSelectedTrackId(track.id);
                        }
                      }}
                      onDragStart={(event) => {
                        event.dataTransfer.setData('text/plain', track.id);
                        setSelectedTrackId(track.id);
                      }}
                    >
                      <div className="audio-track-card__head">
                        <div className="audio-track-card__title">
                          <span className="status-eyebrow">Track</span>
                          <h3>{track.originalFileName}</h3>
                          <p>
                            {track.mimeType || 'audio'} · {formatBytes(track.sizeBytes)}
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

                      <div className="audio-track-badges">
                        <span className="audio-track-badge">Folder: {folderName}</span>
                        <span className="audio-track-badge">
                          {selectedTrackId === track.id ? 'Selected' : 'Drag to folder or playlist'}
                        </span>
                      </div>
                    </article>
                  );
                })
              ) : (
                <article className="audio-track-empty">
                  <strong>{searchTerm ? 'No matches yet.' : 'No tracks uploaded yet.'}</strong>
                  <p>
                    {searchTerm
                      ? isSearchPending
                        ? 'Wait for the 2 second debounce to finish.'
                        : 'Try a different file name, folder, or codec.'
                      : 'Upload music to start building the library.'}
                  </p>
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
                        <p className="text-sm text-slate-300">
                          {playlist.schedules.length > 0
                            ? `${playlist.schedules.length} window(s) configured.`
                            : 'No custom schedule yet.'}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-white/10 bg-slate-950/40 p-4">
                        <div>
                          <p className="text-sm text-slate-300">Manage the weekly windows for this playlist in a modal.</p>
                          <strong className="block mt-1 text-white">{playlist.schedules.length} schedule(s)</strong>
                        </div>
                        <button
                          type="button"
                          className="ghost-button"
                          onClick={() => setScheduleModalPlaylistId(playlist.id)}
                        >
                          Manage schedules
                        </button>
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

      {scheduleModal}
    </>
  );
}