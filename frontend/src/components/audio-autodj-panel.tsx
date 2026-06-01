import { useEffect, useRef, useState, type DragEvent } from 'react';
import { createPortal } from 'react-dom';

import { useAuth } from '../auth/auth-context';
import { runtime } from '../config/runtime';
import {
  createAudioPlaylist,
  createAudioPlaylistSchedule,
  deleteAudioPlaylist,
  deleteAudioPlaylistSchedule,
  deleteAudioTrack,
  getCompanyAudioAutodjState,
  replaceAudioPlaylistItems,
  updateAudioPlaylist,
  updateCompanyAudioAutodjSettings,
  uploadAudioTracks,
} from '../audio-autodj/api';
import type {
  AudioLibraryTrack,
  AudioPlaylist,
  AudioPlaylistSchedule,
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
  { value: '1', label: 'Lun' },
  { value: '2', label: 'Mar' },
  { value: '3', label: 'Mie' },
  { value: '4', label: 'Jue' },
  { value: '5', label: 'Vie' },
  { value: '6', label: 'Sab' },
  { value: '0', label: 'Dom' },
];
const defaultScheduleDraft: ScheduleDraft = {
  startDay: '1',
  startTime: '09:00',
  endDay: '1',
  endTime: '10:00',
};

type ScheduleCalendarBlock = {
  playlistName: string;
  color: string;
  dayIndex: number;
  startMinutes: number;
  endMinutes: number;
};

type DeleteModalTarget =
  | {
      kind: 'track';
      id: string;
      label: string;
    }
  | {
      kind: 'playlist';
      id: string;
      label: string;
    };

const weekDayColumns: Array<{ value: number; label: string }> = [
  { value: 1, label: 'Lun' },
  { value: 2, label: 'Mar' },
  { value: 3, label: 'Mie' },
  { value: 4, label: 'Jue' },
  { value: 5, label: 'Vie' },
  { value: 6, label: 'Sab' },
  { value: 0, label: 'Dom' },
];

const PLAYLIST_COLORS = [
  '#ef4444', // rojo
  '#f97316', // naranja
  '#eab308', // amarillo
  '#84cc16', // lima
  '#22c55e', // verde
  '#10b981', // esmeralda
  '#06b6d4', // cyan
  '#3b82f6', // azul
  '#6366f1', // índigo
  '#a855f7', // púrpura
  '#ec4899', // rosa
  '#f43f5e', // rosa-rojo
];
const EXPANDED_PLAYLISTS_STORAGE_PREFIX = 'audioAutodjExpandedPlaylists:';

function getExpandedPlaylistsStorageKey(companyId: string): string {
  return `${EXPANDED_PLAYLISTS_STORAGE_PREFIX}${companyId}`;
}

function pickRandomPlaylistColor(): string {
  return PLAYLIST_COLORS[Math.floor(Math.random() * PLAYLIST_COLORS.length)] ?? '#3b82f6';
}

const DAY_ABBR_MAP: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const SANTIAGO_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Santiago',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

function getNowSantiago(): { dayOfWeek: number; minuteOfDay: number; timeLabel: string } {
  const parts = SANTIAGO_FORMATTER.formatToParts(new Date());
  const day = parts.find((p) => p.type === 'weekday')?.value ?? 'Mon';
  const hour = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10) % 24;
  const minute = parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0', 10);
  return {
    dayOfWeek: DAY_ABBR_MAP[day] ?? 0,
    minuteOfDay: hour * 60 + minute,
    timeLabel: `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`,
  };
}

function getScheduleSegments(schedule: AudioPlaylistSchedule): Array<{ dayIndex: number; startMinutes: number; endMinutes: number }> {
  const segments: Array<{ dayIndex: number; startMinutes: number; endMinutes: number }> = [];
  let cursor = schedule.startMinuteOfWeek;
  const end = schedule.endMinuteOfWeek;

  while (cursor < end) {
    const dayIndex = Math.floor(cursor / (24 * 60));
    const dayStart = dayIndex * 24 * 60;
    const dayEnd = Math.min(end, dayStart + 24 * 60);
    segments.push({
      dayIndex: dayIndex % 7,
      startMinutes: cursor - dayStart,
      endMinutes: dayEnd - dayStart,
    });
    cursor = dayEnd;
  }

  return segments;
}

function getScheduleCalendarBlocks(playlists: AudioPlaylist[]): ScheduleCalendarBlock[] {
  return playlists.flatMap((playlist) =>
    playlist.schedules.flatMap((schedule) =>
      getScheduleSegments(schedule).map((segment) => ({
        playlistName: playlist.name,
        color: playlist.color,
        dayIndex: segment.dayIndex,
        startMinutes: segment.startMinutes,
        endMinutes: segment.endMinutes,
      }))
    )
  );
}

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
  const [expandedPlaylists, setExpandedPlaylists] = useState<Set<string>>(new Set());
  const [deleteModalTarget, setDeleteModalTarget] = useState<DeleteModalTarget | null>(null);
  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null);
  const [nowSantiago, setNowSantiago] = useState(getNowSantiago);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const expandedHydratedRef = useRef(false);

  useEffect(() => {
    expandedHydratedRef.current = false;
    setExpandedPlaylists(new Set());
  }, [session?.company.id]);

  useEffect(() => {
    const id = setInterval(() => setNowSantiago(getNowSantiago()), 30_000);
    return () => clearInterval(id);
  }, []);

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
    if (expandedHydratedRef.current || !session?.company.id) {
      return;
    }

    const playlistIds = state?.playlists.map((playlist) => playlist.id) ?? [];

    if (playlistIds.length === 0) {
      return;
    }

    expandedHydratedRef.current = true;

    const storageKey = getExpandedPlaylistsStorageKey(session.company.id);
    const savedValue = window.localStorage.getItem(storageKey);

    if (!savedValue) {
      return;
    }

    try {
      const parsedValue = JSON.parse(savedValue) as unknown;

      if (!Array.isArray(parsedValue)) {
        return;
      }

      const nextExpanded = new Set(
        parsedValue.filter((v): v is string => typeof v === 'string' && playlistIds.includes(v)),
      );

      if (nextExpanded.size > 0) {
        setExpandedPlaylists(nextExpanded);
      }
    } catch {
      // Corrupt storage: keep all collapsed
    }
  }, [session?.company.id, state]);

  useEffect(() => {
    if (!expandedHydratedRef.current || !session?.company.id) {
      return;
    }

    const storageKey = getExpandedPlaylistsStorageKey(session.company.id);
    window.localStorage.setItem(storageKey, JSON.stringify([...expandedPlaylists]));
  }, [expandedPlaylists, session?.company.id]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedSearchText(searchText);
    }, 1000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [searchText]);

  useEffect(() => {
    if (!scheduleModalPlaylistId && !deleteModalTarget) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [deleteModalTarget, scheduleModalPlaylistId]);

  useEffect(() => {
    if (!scheduleModalPlaylistId && !deleteModalTarget) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setScheduleModalPlaylistId(null);
        setDeleteModalTarget(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [deleteModalTarget, scheduleModalPlaylistId]);

  useEffect(() => {
    if (!scheduleModalPlaylistId) {
      return;
    }

    const playlistExists = state?.playlists.some((playlist) => playlist.id === scheduleModalPlaylistId);

    if (!playlistExists) {
      setScheduleModalPlaylistId(null);
    }
  }, [scheduleModalPlaylistId, state]);

  async function runMutation(action: () => Promise<void>, successMessage: string): Promise<boolean> {
    setIsBusy(true);
    setErrorMessage(null);

    try {
      await action();
      await loadState();
      setStatusMessage(successMessage);
      return true;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Request failed.');
      return false;
    } finally {
      setIsBusy(false);
    }
  }

  function getDraggedTrackId(event: DragEvent<HTMLElement>): string | null {
    const directTrackId = event.dataTransfer.getData('text/plain');

    if (directTrackId) {
      return directTrackId;
    }

    return selectedTrackId;
  }

  async function appendTrackToPlaylist(trackId: string, playlist: AudioPlaylist): Promise<void> {
    if (!session?.token) {
      return;
    }

    const trackIds = playlist.items.map((item) => item.trackId);
    trackIds.push(trackId);

    await runMutation(async () => {
      await replaceAudioPlaylistItems(session.token, playlist.id, { trackIds });
      setSelectedTrackId(trackId);
    }, 'Playlist updated.');
  }

  async function removeTrackFromPlaylist(itemId: string, playlist: AudioPlaylist): Promise<void> {
    if (!session?.token) {
      return;
    }

    const nextTrackIds = playlist.items
      .filter((item) => item.id !== itemId)
      .map((item) => item.trackId);

    await runMutation(async () => {
      await replaceAudioPlaylistItems(session.token, playlist.id, { trackIds: nextTrackIds });
    }, 'Track removed from playlist.');
  }

  async function handleUpload(fileList: FileList | null): Promise<void> {
    if (!session?.token || !fileList || fileList.length === 0) {
      return;
    }

    const files = Array.from(fileList);

    await runMutation(async () => {
      await uploadAudioTracks(session.token, files, null);
    }, 'Tracks uploaded.');
  }

  async function handleCreatePlaylist(): Promise<void> {
    if (!session?.token || !playlistName.trim()) {
      return;
    }

    await runMutation(async () => {
      await createAudioPlaylist(session.token, { name: playlistName.trim(), color: pickRandomPlaylistColor() });
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

  function togglePlaylistCollapsed(id: string): void {
    setExpandedPlaylists((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function expandPlaylist(id: string): void {
    setExpandedPlaylists((prev) => {
      if (prev.has(id)) return prev;
      return new Set([...prev, id]);
    });
  }

  function handlePreview(event: React.MouseEvent, trackId: string): void {
    event.stopPropagation();

    if (playingTrackId === trackId) {
      previewAudioRef.current?.pause();
      previewAudioRef.current = null;
      setPlayingTrackId(null);
      return;
    }

    previewAudioRef.current?.pause();
    previewAudioRef.current = null;

    if (!session?.token) return;

    const token = session.token;
    const baseUrl = runtime.apiUrl.replace(/\/$/, '');

    setPlayingTrackId(trackId);

    void (async () => {
      try {
        const response = await fetch(`${baseUrl}/audio/autodj/tracks/${trackId}/preview`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) { setPlayingTrackId(null); return; }
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.onended = () => { setPlayingTrackId(null); URL.revokeObjectURL(url); };
        audio.onerror = () => { setPlayingTrackId(null); URL.revokeObjectURL(url); };
        previewAudioRef.current = audio;
        void audio.play();
      } catch {
        setPlayingTrackId(null);
      }
    })();
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

  async function handleConfirmDelete(): Promise<void> {
    if (!session?.token || !deleteModalTarget) {
      return;
    }

    let success = false;

    if (deleteModalTarget.kind === 'track') {
      success = await runMutation(() => deleteAudioTrack(session.token, deleteModalTarget.id), 'Track eliminado.');
    } else {
      success = await runMutation(() => deleteAudioPlaylist(session.token, deleteModalTarget.id), 'Playlist eliminada.');
    }

    if (success) {
      setDeleteModalTarget(null);
    }
  }

  async function handleUpdatePlaylistSettings(
    playlist: AudioPlaylist,
    patch: { shuffleEnabled?: boolean; isActive?: boolean }
  ): Promise<void> {
    if (!session?.token) {
      return;
    }

    await runMutation(async () => {
      await updateAudioPlaylist(session.token, playlist.id, patch);
    }, 'Playlist actualizada.');
  }

  if (!session) {
    return <div />;
  }

  const tracks = state?.tracks ?? [];
  const playlists = state?.playlists ?? [];
  const audioStreamingCount = session.streamings.filter((streaming) => streaming.type === 'audio').length;
  const scheduleCalendarBlocks = getScheduleCalendarBlocks(playlists);
  const scheduleCalendarIsEmpty = scheduleCalendarBlocks.length === 0;
  const defaultPlaylist = playlists.find((playlist) => playlist.kind === 'default') ?? null;
  const customPlaylists = playlists.filter((playlist) => playlist.kind === 'custom');
  const autodjIsEnabled = state?.enabled ?? true;
  const scheduleModalPlaylist = scheduleModalPlaylistId
    ? playlists.find((playlist) => playlist.id === scheduleModalPlaylistId) ?? null
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

    return [track.originalFileName, track.mimeType].some((value) =>
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
                <div className="flex items-center gap-2.5">
                  <span
                    className="audio-playlist-dot"
                    style={{ backgroundColor: scheduleModalPlaylist.color, width: 12, height: 12 }}
                  />
                  <div>
                    <span className="status-eyebrow">Gestionar playlist</span>
                    <h3 id={`audio-schedule-modal-title-${scheduleModalPlaylist.id}`}>{scheduleModalPlaylist.name}</h3>
                  </div>
                </div>
                <button type="button" className="ghost-button" onClick={() => setScheduleModalPlaylistId(null)}>
                  Cerrar
                </button>
              </header>

              <div className="audio-schedule-color-picker">
                <span className="status-eyebrow">Color</span>
                <div className="audio-schedule-color-swatches">
                  {PLAYLIST_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={`audio-color-swatch ${scheduleModalPlaylist.color === c ? 'audio-color-swatch--active' : ''}`}
                      style={{ backgroundColor: c }}
                      aria-label={`Color ${c}`}
                      onClick={() =>
                        void runMutation(
                          async () => { await updateAudioPlaylist(session.token, scheduleModalPlaylist.id, { color: c }); },
                          'Color actualizado.'
                        )
                      }
                    />
                  ))}
                </div>
              </div>

              <div className="audio-schedule-color-picker">
                <span className="status-eyebrow">Configuracion</span>
                <div className="audio-playlist-setting-grid">
                  <label className="audio-playlist-setting-switch" htmlFor={`playlist-shuffle-${scheduleModalPlaylist.id}`}>
                    <span>
                      <strong>Shuffle</strong>
                      <small>Reproduce esta playlist en orden aleatorio.</small>
                    </span>
                    <input
                      id={`playlist-shuffle-${scheduleModalPlaylist.id}`}
                      type="checkbox"
                      checked={scheduleModalPlaylist.shuffleEnabled}
                      disabled={isBusy}
                      onChange={(event) =>
                        void handleUpdatePlaylistSettings(scheduleModalPlaylist, {
                          shuffleEnabled: event.target.checked,
                        })
                      }
                    />
                  </label>

                  {scheduleModalPlaylist.kind === 'custom' ? (
                    <label className="audio-playlist-setting-switch" htmlFor={`playlist-active-${scheduleModalPlaylist.id}`}>
                      <span>
                        <strong>Playlist activa</strong>
                        <small>Si esta apagada, no entra en la seleccion de AutoDJ.</small>
                      </span>
                      <input
                        id={`playlist-active-${scheduleModalPlaylist.id}`}
                        type="checkbox"
                        checked={scheduleModalPlaylist.isActive}
                        disabled={isBusy}
                        onChange={(event) =>
                          void handleUpdatePlaylistSettings(scheduleModalPlaylist, {
                            isActive: event.target.checked,
                          })
                        }
                      />
                    </label>
                  ) : null}
                </div>
              </div>

              {scheduleModalPlaylist.kind === 'custom' ? (
                <div className="audio-schedule-modal-body">
                  <div className="audio-schedule-modal-stack">
                    <section className="audio-schedule-panel">
                      <div>
                        <span className="status-eyebrow">Nueva ventana</span>
                        <h4 className="mt-2 text-lg font-semibold">Agregar horario semanal</h4>
                      </div>

                      <div className="audio-schedule-field-stack">
                        <ScheduleDayGroup
                          label="Desde — día"
                          value={scheduleModalDraft.startDay}
                          onChange={(nextValue) =>
                            setScheduleDrafts((currentValue) => ({
                              ...currentValue,
                              [scheduleModalPlaylist.id]: { ...scheduleModalDraft, startDay: nextValue },
                            }))
                          }
                        />

                        <ScheduleDayGroup
                          label="Hasta — día"
                          value={scheduleModalDraft.endDay}
                          onChange={(nextValue) =>
                            setScheduleDrafts((currentValue) => ({
                              ...currentValue,
                              [scheduleModalPlaylist.id]: { ...scheduleModalDraft, endDay: nextValue },
                            }))
                          }
                        />

                        <label className="audio-schedule-time-field">
                          <span className="audio-schedule-group-label">Desde — hora</span>
                          <input
                            type="time"
                            lang="es"
                            step={60}
                            value={scheduleModalDraft.startTime}
                            onChange={(event) =>
                              setScheduleDrafts((currentValue) => ({
                                ...currentValue,
                                [scheduleModalPlaylist.id]: { ...scheduleModalDraft, startTime: event.target.value },
                              }))
                            }
                          />
                        </label>

                        <label className="audio-schedule-time-field">
                          <span className="audio-schedule-group-label">Hasta — hora</span>
                          <input
                            type="time"
                            lang="es"
                            step={60}
                            value={scheduleModalDraft.endTime}
                            onChange={(event) =>
                              setScheduleDrafts((currentValue) => ({
                                ...currentValue,
                                [scheduleModalPlaylist.id]: { ...scheduleModalDraft, endTime: event.target.value },
                              }))
                            }
                          />
                        </label>
                      </div>

                      <button type="button" disabled={isBusy} onClick={() => void handleCreateSchedule(scheduleModalPlaylist.id)}>
                        Agregar horario
                      </button>
                    </section>

                    <section className="audio-schedule-panel">
                      <div>
                        <span className="status-eyebrow">Horarios activos</span>
                        <h4 className="mt-2 text-lg font-semibold">{scheduleModalPlaylist.schedules.length} ventana(s)</h4>
                        <p className="text-sm text-slate-300">Elimina cualquier ventana que ya no deba controlar esta playlist.</p>
                      </div>

                      <div className="audio-schedule-list">
                        {scheduleModalPlaylist.schedules.length > 0 ? (
                          scheduleModalPlaylist.schedules.map((schedule) => (
                            <div key={schedule.id} className="audio-schedule-item">
                              <div>
                                <strong>
                                  {formatMinuteOfWeek(schedule.startMinuteOfWeek)} → {formatMinuteOfWeek(schedule.endMinuteOfWeek)}
                                </strong>
                              </div>
                              <button
                                type="button"
                                className="ghost-button"
                                onClick={() =>
                                  void runMutation(
                                    async () => {
                                      await deleteAudioPlaylistSchedule(session.token, scheduleModalPlaylist.id, schedule.id);
                                    },
                                    'Horario eliminado.'
                                  )
                                }
                              >
                                Eliminar
                              </button>
                            </div>
                          ))
                        ) : (
                          <article className="audio-track-empty">
                            <strong>Sin horarios todavía.</strong>
                            <p>Agrega la primera ventana semanal con el formulario al lado.</p>
                          </article>
                        )}
                      </div>
                    </section>
                  </div>
                </div>
              ) : (
                <div className="audio-schedule-modal-body">
                  <article className="audio-track-empty">
                    <strong>Playlist por defecto.</strong>
                    <p>Aqui puedes configurar su modo shuffle.</p>
                  </article>
                </div>
              )}
            </section>
          </div>,
          document.body
        )
      : null;

  const deleteModal =
    deleteModalTarget && typeof document !== 'undefined'
      ? createPortal(
          <div
            className="audio-schedule-modal-backdrop"
            role="presentation"
            onClick={() => setDeleteModalTarget(null)}
          >
            <section
              className="audio-delete-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="audio-delete-modal-title"
              onClick={(event) => event.stopPropagation()}
            >
              <header className="audio-delete-modal-head">
                <span className="status-eyebrow">Confirmar eliminación</span>
                <h3 id="audio-delete-modal-title">
                  {deleteModalTarget.kind === 'track' ? 'Eliminar track' : 'Eliminar playlist'}
                </h3>
              </header>

              <p className="audio-delete-modal-text">
                {deleteModalTarget.kind === 'track'
                  ? `Vas a eliminar "${deleteModalTarget.label}" de la biblioteca.`
                  : `Vas a eliminar la playlist "${deleteModalTarget.label}".`}
              </p>

              <p className="audio-delete-modal-subtext">
                Esta acción no se puede deshacer.
              </p>

              <div className="audio-delete-modal-actions">
                <button type="button" className="audio-delete-modal-cancel" onClick={() => setDeleteModalTarget(null)}>
                  Cancelar
                </button>
                <button
                  type="button"
                  className="audio-delete-modal-confirm"
                  disabled={isBusy}
                  onClick={() => void handleConfirmDelete()}
                >
                  Eliminar
                </button>
              </div>
            </section>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <section className="grid gap-6">
        <article className="audio-autodj-hero">
          <div className="audio-autodj-hero-top">
            <div className="audio-autodj-hero-identity">
              <span className={`audio-autodj-state-dot ${autodjIsEnabled ? 'audio-autodj-state-dot--on' : ''}`} />
              <div>
                <span className="status-eyebrow">AutoDJ</span>
                <h2 className="audio-autodj-hero-title">{autodjIsEnabled ? 'Activo' : 'Inactivo'}</h2>
              </div>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={autodjIsEnabled}
              aria-label={autodjIsEnabled ? 'Desactivar AutoDJ' : 'Activar AutoDJ'}
              disabled={isBusy || !state}
              onClick={() => void handleToggleEnabled()}
              className="audio-autodj-switch"
            >
              <span className={`audio-autodj-switch-thumb ${autodjIsEnabled ? 'audio-autodj-switch-thumb--on' : ''}`} />
            </button>
          </div>

          <p className="audio-autodj-hero-desc">
            {autodjIsEnabled
              ? `Sin señal en vivo, los horarios o la playlist 24/7 cubren las ${audioStreamingCount} señal(es) de audio.`
              : 'Sin señal en vivo las emisiones quedan en silencio esperando al encoder.'}
          </p>

          {errorMessage ? <p className="audio-autodj-error">{errorMessage}</p> : null}

          <div className="audio-autodj-metrics">
            <div className="audio-autodj-metric">
              <strong>{tracks.length}</strong>
              <span>tracks</span>
            </div>
            <div className="audio-autodj-metric">
              <strong>{playlists.length}</strong>
              <span>playlists</span>
            </div>
            <div className="audio-autodj-metric">
              <strong>{audioStreamingCount}</strong>
              <span>señales</span>
            </div>
          </div>
        </article>

      <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <article className="status-card audio-library-card">
          <div className="audio-library-header">
            <div className="audio-library-header__left">
              <span className="audio-library-header__label">Biblioteca</span>
              <span className="audio-library-header__count">{tracks.length} tracks</span>
            </div>
            <p className="audio-library-header__desc">Arrastra tracks a las playlists o usa el buscador.</p>
          </div>

          <label className="audio-upload-zone">
            <span className="audio-upload-zone__label">Subir archivos de audio</span>
            <span className="audio-upload-zone__hint">MP3, WAV, FLAC, OGG — múltiples a la vez</span>
            <input
              type="file"
              accept="audio/*"
              multiple
              onChange={(event) => void handleUpload(event.target.files)}
            />
          </label>

          <label className="audio-search-card">
            <div className="audio-search-inner">
              <svg className="audio-search-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" strokeWidth="1.6" />
                <path d="M13 13l3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
              <input
                type="search"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="Buscar por nombre o formato…"
              />
              {searchText ? (
                <span className="audio-search-count">
                  {isSearchPending ? '…' : `${visibleTracks.length} / ${tracks.length}`}
                </span>
              ) : null}
            </div>
          </label>

          <div className="audio-track-grid">
            {visibleTracks.length > 0 ? (
              visibleTracks.map((track) => (
                <article
                  key={track.id}
                  className={`audio-track-card ${selectedTrackId === track.id ? 'audio-track-card--selected' : ''}`}
                  role="button"
                  tabIndex={0}
                  aria-pressed={selectedTrackId === track.id}
                  aria-label={`Seleccionar ${track.originalFileName}`}
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
                  <div className="audio-track-card__info">
                    <span className="audio-track-card__name">{track.originalFileName}</span>
                    <span className="audio-track-card__meta">{track.mimeType || 'audio'} · {formatBytes(track.sizeBytes)}</span>
                  </div>
                  <div className="audio-track-card__actions">
                    {selectedTrackId === track.id ? (
                      <span className="audio-track-badge audio-track-badge--selected">Seleccionado</span>
                    ) : null}
                    <button
                      type="button"
                      className="ghost-button audio-track-preview"
                      title={playingTrackId === track.id ? 'Detener preview' : 'Escuchar preview'}
                      onClick={(event) => handlePreview(event, track.id)}
                    >
                      {playingTrackId === track.id ? '◼' : '▶'}
                    </button>
                    <button
                      type="button"
                      className="ghost-button audio-track-delete"
                      onClick={(event) => {
                        event.stopPropagation();
                        setDeleteModalTarget({
                          kind: 'track',
                          id: track.id,
                          label: track.originalFileName,
                        });
                      }}
                    >
                      ×
                    </button>
                  </div>
                </article>
              ))
            ) : (
              <article className="audio-track-empty">
                <strong>{searchTerm ? 'Sin resultados.' : 'Sin tracks subidos todavía.'}</strong>
                <p>
                  {searchTerm
                    ? 'Prueba con otro nombre o formato.'
                    : 'Sube música para comenzar a armar la biblioteca.'}
                </p>
              </article>
            )}
          </div>
        </article>

        <article className="status-card grid gap-3">
          <div className="audio-playlists-section-head">
            <span className="text-sm font-semibold text-white">Playlists</span>
            <form
              className="audio-playlist-create-row"
              onSubmit={(e) => { e.preventDefault(); void handleCreatePlaylist(); }}
            >
              <input
                className="audio-playlist-create-input"
                value={playlistName}
                onChange={(event) => setPlaylistName(event.target.value)}
                placeholder="Nueva playlist…"
              />
              <button
                type="submit"
                className="audio-playlist-create-btn"
                disabled={isBusy || !playlistName.trim()}
              >
                <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                </svg>
                Crear
              </button>
            </form>
          </div>

          <div className="audio-playlists-scroll-zone">
            {defaultPlaylist ? (() => {
              const color = defaultPlaylist.color;
              const isCollapsed = !expandedPlaylists.has(defaultPlaylist.id);
              return (
                <div
                  className={`audio-playlist-card ${isCollapsed ? 'audio-playlist-card--collapsed' : ''}`}
                  style={{ borderLeftColor: color }}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    const trackId = getDraggedTrackId(event);
                    if (trackId) {
                      expandPlaylist(defaultPlaylist.id);
                      void appendTrackToPlaylist(trackId, defaultPlaylist);
                    }
                  }}
                >
                  <div className="audio-playlist-card-header">
                    <span className="audio-playlist-dot" style={{ backgroundColor: color }} />
                    <div className="min-w-0 flex-1">
                      <p className="audio-playlist-name">
                        {defaultPlaylist.name}
                        <span className="audio-playlist-priority">· 24/7</span>
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {isCollapsed && defaultPlaylist.items.length > 0 && (
                        <span className="audio-playlist-badge">{defaultPlaylist.items.length}</span>
                      )}
                      <button
                        type="button"
                        className="audio-playlist-icon-btn"
                        title="Gestionar playlist"
                        onClick={() => setScheduleModalPlaylistId(defaultPlaylist.id)}
                      >
                        <svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M6 3.5h7M6 8h7M6 12.5h7M2.75 3.5h.5M2.75 8h.5M2.75 12.5h.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
                      </button>
                      <button
                        type="button"
                        className="audio-playlist-toggle"
                        aria-expanded={!isCollapsed}
                        onClick={() => togglePlaylistCollapsed(defaultPlaylist.id)}
                      >
                        <svg
                          className={`audio-playlist-chevron ${isCollapsed ? '' : 'audio-playlist-chevron--open'}`}
                          viewBox="0 0 16 16"
                          fill="none"
                          aria-hidden="true"
                        >
                          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {!isCollapsed && (
                    <div className="audio-playlist-body">
                      {defaultPlaylist.items.length > 0 ? (
                        defaultPlaylist.items.map((item) => (
                          <div key={item.id} className="audio-playlist-track">
                            <div className="min-w-0">
                              <span className="audio-playlist-track-name">{item.track.originalFileName}</span>
                              <span className="audio-playlist-track-meta">{formatBytes(item.track.sizeBytes)}</span>
                            </div>
                            <button
                              type="button"
                              className="audio-playlist-track-remove"
                              title="Quitar de la playlist"
                              onClick={() => void removeTrackFromPlaylist(item.id, defaultPlaylist)}
                            >
                              <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                              </svg>
                            </button>
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-slate-400 py-1">Arrastra tracks aquí para armar la rotación.</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })() : null}

            {customPlaylists.length > 0 ? (
              customPlaylists.map((playlist) => {
                const color = playlist.color;
                const isCollapsed = !expandedPlaylists.has(playlist.id);
                return (
                  <div
                    key={playlist.id}
                    className={`audio-playlist-card ${isCollapsed ? 'audio-playlist-card--collapsed' : ''}`}
                    style={{ borderLeftColor: color }}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      const trackId = getDraggedTrackId(event);
                      if (trackId) {
                        expandPlaylist(playlist.id);
                        void appendTrackToPlaylist(trackId, playlist);
                      }
                    }}
                  >
                    <div className="audio-playlist-card-header">
                      <span className="audio-playlist-dot" style={{ backgroundColor: color }} />
                      <div className="min-w-0 flex-1">
                        <p className="audio-playlist-name">
                          {playlist.name}
                          <span className="audio-playlist-priority">· P{playlist.priority}</span>
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {isCollapsed && (
                          <>
                            {playlist.items.length > 0 && (
                              <span className="audio-playlist-badge">{playlist.items.length} tracks</span>
                            )}
                            {playlist.schedules.length > 0 && (
                              <span className="audio-playlist-badge" style={{ color, borderColor: `${color}40` }}>
                                {playlist.schedules.length} horarios
                              </span>
                            )}
                          </>
                        )}
                        {!isCollapsed && selectedTrackId ? (
                          <button type="button" className="audio-playlist-icon-btn" title="Agregar track seleccionado" onClick={() => void appendTrackToPlaylist(selectedTrackId, playlist)}>
                            <svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
                          </button>
                        ) : null}
                        {!isCollapsed && (
                          <>
                            <button
                              type="button"
                              className="audio-playlist-icon-btn"
                              title="Gestionar playlist"
                              onClick={() => setScheduleModalPlaylistId(playlist.id)}
                            >
                              <svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M6 3.5h7M6 8h7M6 12.5h7M2.75 3.5h.5M2.75 8h.5M2.75 12.5h.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
                            </button>
                            <button
                              type="button"
                              className="audio-playlist-icon-btn audio-playlist-icon-btn--danger"
                              title="Eliminar playlist"
                              onClick={() =>
                                setDeleteModalTarget({
                                  kind: 'playlist',
                                  id: playlist.id,
                                  label: playlist.name,
                                })
                              }
                            >
                              <svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 4h10M6 4V2.5h4V4M6.5 7v5M9.5 7v5M4.5 4l.5 9h6l.5-9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          className="audio-playlist-toggle"
                          aria-expanded={!isCollapsed}
                          onClick={() => togglePlaylistCollapsed(playlist.id)}
                        >
                          <svg
                            className={`audio-playlist-chevron ${isCollapsed ? '' : 'audio-playlist-chevron--open'}`}
                            viewBox="0 0 16 16"
                            fill="none"
                            aria-hidden="true"
                          >
                            <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    {!isCollapsed && (
                      <>
                        <div className="audio-playlist-body">
                          {playlist.items.length > 0 ? (
                            playlist.items.map((item) => (
                              <div key={item.id} className="audio-playlist-track">
                                <div className="min-w-0">
                                  <span className="audio-playlist-track-name">{item.track.originalFileName}</span>
                                  <span className="audio-playlist-track-meta">{formatBytes(item.track.sizeBytes)}</span>
                                </div>
                                <button
                                  type="button"
                                  className="audio-playlist-track-remove"
                                  title="Quitar de la playlist"
                                  onClick={() => void removeTrackFromPlaylist(item.id, playlist)}
                                >
                                  <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                                    <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                                  </svg>
                                </button>
                              </div>
                            ))
                          ) : (
                            <p className="text-xs text-slate-400 py-1">Arrastra tracks aquí para armar esta playlist.</p>
                          )}
                        </div>

                        <div className="audio-playlist-schedule-row">
                          <span className="audio-playlist-dot" style={{ backgroundColor: color }} />
                          <span className="text-xs text-slate-300">
                            {playlist.schedules.length > 0
                              ? `${playlist.schedules.length} ventana(s) activa(s)`
                              : 'Sin horarios configurados'}
                          </span>
                        </div>
                      </>
                    )}
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

        <article className="status-card audio-schedule-calendar-card grid gap-5 lg:col-span-2">
          <div className="section-heading">
            <div>
              <span className="status-eyebrow">Weekly schedule</span>
              <h2>Playlist calendar</h2>
            </div>
            <p>Visualiza la semana con días y horas para saber qué playlist está activa en cada intervalo.</p>
          </div>

          <div className={`audio-schedule-calendar ${scheduleCalendarIsEmpty ? 'audio-schedule-calendar--empty' : ''}`}>
            <div className="audio-schedule-calendar-header">
              <div className="audio-schedule-time-axis-header">Hora</div>
              {weekDayColumns.map((day) => (
                <div key={day.value} className="audio-schedule-day-label">
                  {day.label}
                </div>
              ))}
            </div>

            <div className="audio-schedule-calendar-body">
              <div className="audio-schedule-time-axis" aria-hidden="true">
                {Array.from({ length: 24 }).map((_, hour) => (
                  <div key={hour} className="audio-schedule-time-label">
                    {hour.toString().padStart(2, '0')}:00
                  </div>
                ))}
              </div>

              <div className="audio-schedule-calendar-columns-wrap">
                {scheduleCalendarIsEmpty ? (
                  <div className="audio-schedule-empty-state">
                    <strong>Sin horarios todavía</strong>
                    <p>Crea playlists y programa ventanas para ver bloques de color en esta vista semanal.</p>
                  </div>
                ) : null}

                <div className="audio-schedule-calendar-columns">
                  {weekDayColumns.map((day) => (
                    <div key={day.value} className="audio-schedule-day-column" aria-label={day.label}>
                      {Array.from({ length: 24 }).map((_, hour) => (
                        <div key={`${day.value}-${hour}`} className="audio-schedule-day-hour-line" />
                      ))}
                      {day.value === nowSantiago.dayOfWeek && (
                        <div
                          className="audio-schedule-now-line"
                          style={{ top: `${(nowSantiago.minuteOfDay / 1440) * 100}%` }}
                          aria-label={`Hora actual Santiago: ${nowSantiago.timeLabel}`}
                        >
                          <span className="audio-schedule-now-label">{nowSantiago.timeLabel}</span>
                        </div>
                      )}
                      {scheduleCalendarBlocks
                        .filter((block) => block.dayIndex === day.value)
                        .map((block, blockIndex) => (
                          <div
                            key={`${block.playlistName}-${day.value}-${blockIndex}`}
                            className="audio-schedule-slot"
                            style={{
                              top: `${(block.startMinutes / 1440) * 100}%`,
                              height: `${((block.endMinutes - block.startMinutes) / 1440) * 100}%`,
                              backgroundColor: block.color,
                            }}
                          >
                            <span>{block.playlistName}</span>
                          </div>
                        ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </article>
      </section>
    </section>

      {scheduleModal}
      {deleteModal}
    </>
  );
}