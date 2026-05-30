import { useEffect, useState, type DragEvent } from 'react';
import { createPortal } from 'react-dom';

import { useAuth } from '../auth/auth-context';
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

function pickRandomPlaylistColor(): string {
  return PLAYLIST_COLORS[Math.floor(Math.random() * PLAYLIST_COLORS.length)] ?? '#3b82f6';
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
  const [collapsedPlaylists, setCollapsedPlaylists] = useState<Set<string>>(new Set());
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

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
    }, 1000);

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
    setCollapsedPlaylists((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
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
  const playlists = state?.playlists ?? [];
  const audioStreamingCount = session.streamings.filter((streaming) => streaming.type === 'audio').length;
  const scheduleCalendarBlocks = getScheduleCalendarBlocks(playlists);
  const scheduleCalendarIsEmpty = scheduleCalendarBlocks.length === 0;
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
                      className="ghost-button audio-track-delete"
                      onClick={(event) => {
                        event.stopPropagation();
                        void runMutation(() => deleteAudioTrack(session.token, track.id), 'Track eliminado.');
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
              const isCollapsed = collapsedPlaylists.has(defaultPlaylist.id);
              return (
                <div
                  className="audio-playlist-card"
                  style={{ borderLeftColor: color }}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    const trackId = getDraggedTrackId(event);
                    if (trackId) void appendTrackToPlaylist(trackId, defaultPlaylist);
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
                      {selectedTrackId && !isCollapsed ? (
                        <button type="button" className="ghost-button text-xs" onClick={() => void appendTrackToPlaylist(selectedTrackId, defaultPlaylist)}>
                          + Agregar
                        </button>
                      ) : null}
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
                              onClick={() => void removeTrackFromPlaylist(item.trackId, defaultPlaylist)}
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
                const isCollapsed = collapsedPlaylists.has(playlist.id);
                return (
                  <div
                    key={playlist.id}
                    className="audio-playlist-card"
                    style={{ borderLeftColor: color }}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      const trackId = getDraggedTrackId(event);
                      if (trackId) void appendTrackToPlaylist(trackId, playlist);
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
                              title="Gestionar horarios"
                              onClick={() => setScheduleModalPlaylistId(playlist.id)}
                            >
                              <svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.4"/><path d="M8 5v3l2 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
                            </button>
                            {deleteConfirmId === playlist.id ? (
                              <div className="audio-playlist-confirm-delete">
                                <span>¿Eliminar?</span>
                                <button
                                  type="button"
                                  className="audio-playlist-confirm-yes"
                                  disabled={isBusy}
                                  onClick={() => {
                                    setDeleteConfirmId(null);
                                    void runMutation(() => deleteAudioPlaylist(session.token, playlist.id), 'Playlist eliminada.');
                                  }}
                                >
                                  Sí
                                </button>
                                <button type="button" className="audio-playlist-confirm-no" onClick={() => setDeleteConfirmId(null)}>
                                  No
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                className="audio-playlist-icon-btn audio-playlist-icon-btn--danger"
                                title="Eliminar playlist"
                                onClick={() => setDeleteConfirmId(playlist.id)}
                              >
                                <svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 4h10M6 4V2.5h4V4M6.5 7v5M9.5 7v5M4.5 4l.5 9h6l.5-9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                              </button>
                            )}
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
                                  onClick={() => void removeTrackFromPlaylist(item.trackId, playlist)}
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
    </>
  );
}