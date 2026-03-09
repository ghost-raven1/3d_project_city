import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import GraphicEqRoundedIcon from '@mui/icons-material/GraphicEqRounded';
import InfoOutlineRoundedIcon from '@mui/icons-material/InfoOutlineRounded';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import PauseRoundedIcon from '@mui/icons-material/PauseRounded';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import SkipNextRoundedIcon from '@mui/icons-material/SkipNextRounded';
import SkipPreviousRoundedIcon from '@mui/icons-material/SkipPreviousRounded';
import VolumeUpRoundedIcon from '@mui/icons-material/VolumeUpRounded';
import {
  Box,
  Chip,
  Collapse,
  IconButton,
  Link,
  Paper,
  Slider,
  Stack,
  Tooltip,
  Typography,
  useMediaQuery,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import {
  panelActionButtonSx,
  panelChipSx,
  panelInsetSx,
  panelMetaTextSx,
  panelScrollSx,
  panelSurfaceSx,
  panelTitleSx,
} from './panelStyles';
import { MusicSpectrumTelemetry } from './scene/types';

interface MusicPlayerDockProps {
  compact?: boolean;
  topOffset?: number;
  bottomOffset?: number;
  onHeightChange?: (height: number) => void;
  onSpectrumChange?: (telemetry: MusicSpectrumTelemetry | null) => void;
}

interface MusicTrack {
  id: string;
  title: string;
  artist: string;
  mood: string;
  sourceUrl: string;
  sourcePage: string;
  licenseLabel: string;
  licenseUrl: string;
}

type SpectrumBandKey = keyof MusicSpectrumTelemetry['bands'];

const EMPTY_BANDS: MusicSpectrumTelemetry['bands'] = {
  subBass: 0,
  bass: 0,
  lowMid: 0,
  mid: 0,
  highMid: 0,
  high: 0,
};

const SPECTRUM_BANDS: Array<{
  key: SpectrumBandKey;
  label: string;
  color: string;
}> = [
  { key: 'subBass', label: 'Sub', color: '#67d5ff' },
  { key: 'bass', label: 'Bass', color: '#79edff' },
  { key: 'lowMid', label: 'LowMid', color: '#66f0d2' },
  { key: 'mid', label: 'Mid', color: '#9be8ff' },
  { key: 'highMid', label: 'HighMid', color: '#ffd888' },
  { key: 'high', label: 'High', color: '#ffc173' },
];

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

const FREE_SYNTHWAVE_TRACKS: MusicTrack[] = [
  {
    id: 'driving-night',
    title: 'Driving to the Night',
    artist: 'Frank Schroeter',
    mood: 'Synthwave / Retrowave',
    sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/0/0d/Driving_to_the_Night_by_Frank_Schroeter.ogg',
    sourcePage: 'https://commons.wikimedia.org/wiki/File:Driving_to_the_Night_by_Frank_Schroeter.ogg',
    licenseLabel: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
  },
  {
    id: 'journey-80s',
    title: 'Journey To The 80s',
    artist: 'Frank Schroeter',
    mood: 'Neon Drive / Synthwave',
    sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/8/82/Journey_To_The_80s_by_Frank_Schroeter.ogg',
    sourcePage: 'https://commons.wikimedia.org/wiki/File:Journey_To_The_80s_by_Frank_Schroeter.ogg',
    licenseLabel: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
  },
  {
    id: 'eighties-action',
    title: 'Eighties Action',
    artist: 'Kevin MacLeod',
    mood: 'Action / Retro',
    sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/0/04/Eighties_Action_%28ISRC_USUAN1100243%29.mp3',
    sourcePage: 'https://commons.wikimedia.org/wiki/File:Eighties_Action_(ISRC_USUAN1100243).mp3',
    licenseLabel: 'CC BY 3.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/3.0/',
  },
  {
    id: 'super-power',
    title: 'Super Power Cool Dude',
    artist: 'Kevin MacLeod',
    mood: 'Retro Arcade / Upbeat',
    sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/4/4e/Super_Power_Cool_Dude_%28ISRC_USUAN1600036%29.mp3',
    sourcePage: 'https://commons.wikimedia.org/wiki/File:Super_Power_Cool_Dude_(ISRC_USUAN1600036).mp3',
    licenseLabel: 'CC BY 3.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/3.0/',
  },
  {
    id: '1984',
    title: '1984',
    artist: 'Frank Schroeter',
    mood: 'Dark Synthwave / Dystopian',
    sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/2/20/1984_by_Frank_Schroeter.ogg',
    sourcePage: 'https://commons.wikimedia.org/wiki/File:1984_by_Frank_Schroeter.ogg',
    licenseLabel: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
  },
  {
    id: 'horizon-flare',
    title: 'Horizon Flare',
    artist: 'Alexander Nakarada',
    mood: 'Neon Skyline / Retro Future',
    sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/2/28/Horizon_Flare_by_Alexander_Nakarada.ogg',
    sourcePage: 'https://commons.wikimedia.org/wiki/File:Horizon_Flare_by_Alexander_Nakarada.ogg',
    licenseLabel: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
  },
  {
    id: 'retrowave',
    title: 'Retrowave',
    artist: 'Raspberrymusic',
    mood: 'Warm Neon / Cruise',
    sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/f/fc/Raspberrymusic_-_Retrowave.ogg',
    sourcePage: 'https://commons.wikimedia.org/wiki/File:Raspberrymusic_-_Retrowave.ogg',
    licenseLabel: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
  },
  {
    id: 'i-am-a-robot',
    title: 'I Am a Robot',
    artist: 'Alexi Action',
    mood: 'Dark Synthwave / Cyberpunk',
    sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/1/17/Alexi_Action_-_I_Am_a_Robot_%28Dark_Synthwave%29.ogg',
    sourcePage: 'https://commons.wikimedia.org/wiki/File:Alexi_Action_-_I_Am_a_Robot_(Dark_Synthwave).ogg',
    licenseLabel: 'CC BY 3.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/3.0/',
  },
];

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return '0:00';
  }
  const whole = Math.floor(seconds);
  const mins = Math.floor(whole / 60);
  const secs = whole % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function MusicPlayerDock({
  compact = false,
  topOffset = 96,
  bottomOffset = 14,
  onHeightChange,
  onSpectrumChange,
}: MusicPlayerDockProps) {
  const isShortViewport = useMediaQuery('(max-height: 860px)');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const lastHeightRef = useRef(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const frequencyDataRef = useRef<Uint8Array | null>(null);
  const spectrumFrameRef = useRef<number | null>(null);
  const spectrumEmitAtRef = useRef(0);
  const beatAverageRef = useRef(0);
  const smoothedBandsRef = useRef<MusicSpectrumTelemetry['bands']>(EMPTY_BANDS);

  const [trackIndex, setTrackIndex] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.68);
  const [showCredits, setShowCredits] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [spectrum, setSpectrum] = useState<MusicSpectrumTelemetry | null>(null);

  const safeTopOffset = Number.isFinite(topOffset)
    ? Math.max(72, Math.round(topOffset))
    : 96;
  const mobileBottomOffset = Math.max(8, Math.round(bottomOffset));
  const desktopBottomOffset = Math.max(12, Math.round(bottomOffset));
  const mobileMaxHeight = `max(220px, calc(100vh - ${safeTopOffset + mobileBottomOffset + 8}px))`;
  const desktopMaxHeight = `max(240px, calc(100vh - ${safeTopOffset + desktopBottomOffset + 10}px))`;
  const activeTrack = FREE_SYNTHWAVE_TRACKS[trackIndex] ?? FREE_SYNTHWAVE_TRACKS[0];
  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  const compactTrackList = compact || isShortViewport;
  const visualBands = spectrum?.bands ?? EMPTY_BANDS;
  const visualEnergy = spectrum?.energy ?? 0;
  const visualBeat = spectrum?.beat ?? 0;
  const visualReactive = Boolean(spectrum?.reactive && spectrum?.playing);

  const stopSpectrumLoop = useCallback(() => {
    if (spectrumFrameRef.current !== null) {
      window.cancelAnimationFrame(spectrumFrameRef.current);
      spectrumFrameRef.current = null;
    }
  }, []);

  const emitSpectrum = useCallback((next: MusicSpectrumTelemetry | null) => {
    onSpectrumChange?.(next);
    setSpectrum(next);
  }, [onSpectrumChange]);

  const ensureAudioAnalyzer = useCallback((): boolean => {
    const audio = audioRef.current;
    if (!audio || typeof window === 'undefined') {
      return false;
    }
    if (analyserRef.current) {
      return true;
    }

    const audioWindow = window as Window & { webkitAudioContext?: typeof AudioContext };
    const AudioContextCtor = window.AudioContext ?? audioWindow.webkitAudioContext;
    if (!AudioContextCtor) {
      return false;
    }

    try {
      const context = new AudioContextCtor();
      const analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.72;
      analyser.minDecibels = -90;
      analyser.maxDecibels = -16;

      const source = context.createMediaElementSource(audio);
      source.connect(analyser);
      analyser.connect(context.destination);

      audioContextRef.current = context;
      sourceNodeRef.current = source;
      analyserRef.current = analyser;
      frequencyDataRef.current = new Uint8Array(analyser.frequencyBinCount);
      return true;
    } catch {
      return false;
    }
  }, []);

  const sampleSpectrumOnce = useCallback((timestampMs: number) => {
    const analyser = analyserRef.current;
    const context = audioContextRef.current;
    const buffer = frequencyDataRef.current;
    if (!analyser || !context || !buffer) {
      return null;
    }

    analyser.getByteFrequencyData(buffer);
    const nyquist = context.sampleRate / 2;
    const hzPerBin = nyquist / buffer.length;
    const sampleRange = (fromHz: number, toHz: number): number => {
      const startIndex = Math.max(0, Math.floor(fromHz / hzPerBin));
      const endIndex = Math.min(buffer.length - 1, Math.ceil(toHz / hzPerBin));
      if (endIndex <= startIndex) {
        return 0;
      }
      let sum = 0;
      for (let index = startIndex; index <= endIndex; index += 1) {
        sum += buffer[index] ?? 0;
      }
      return clamp01(sum / ((endIndex - startIndex + 1) * 255));
    };

    const rawBands: MusicSpectrumTelemetry['bands'] = {
      subBass: sampleRange(20, 80),
      bass: sampleRange(80, 250),
      lowMid: sampleRange(250, 500),
      mid: sampleRange(500, 2000),
      highMid: sampleRange(2000, 6000),
      high: sampleRange(6000, 14000),
    };
    const previous = smoothedBandsRef.current;
    const bands: MusicSpectrumTelemetry['bands'] = {
      subBass: previous.subBass * 0.72 + rawBands.subBass * 0.28,
      bass: previous.bass * 0.72 + rawBands.bass * 0.28,
      lowMid: previous.lowMid * 0.74 + rawBands.lowMid * 0.26,
      mid: previous.mid * 0.74 + rawBands.mid * 0.26,
      highMid: previous.highMid * 0.76 + rawBands.highMid * 0.24,
      high: previous.high * 0.78 + rawBands.high * 0.22,
    };
    smoothedBandsRef.current = bands;

    const lowEnergy = bands.subBass * 0.62 + bands.bass * 0.38;
    beatAverageRef.current = beatAverageRef.current * 0.965 + lowEnergy * 0.035;
    const beat = clamp01((lowEnergy - beatAverageRef.current) * 3.5 + lowEnergy * 0.12);
    const energy = clamp01(
      bands.subBass * 0.22 +
        bands.bass * 0.26 +
        bands.lowMid * 0.18 +
        bands.mid * 0.17 +
        bands.highMid * 0.11 +
        bands.high * 0.06,
    );

    return {
      bands,
      energy,
      beat,
      playing: true,
      reactive: energy > 0.03 || beat > 0.04,
      timestampMs,
    } satisfies MusicSpectrumTelemetry;
  }, []);

  const startSpectrumLoop = useCallback(() => {
    if (spectrumFrameRef.current !== null) {
      return;
    }

    const tick = (timestampMs: number) => {
      const audio = audioRef.current;
      if (!audio || audio.paused) {
        spectrumFrameRef.current = null;
        return;
      }
      if (!analyserRef.current) {
        spectrumFrameRef.current = null;
        return;
      }

      const snapshot = sampleSpectrumOnce(timestampMs);
      if (snapshot && timestampMs - spectrumEmitAtRef.current >= 92) {
        spectrumEmitAtRef.current = timestampMs;
        emitSpectrum(snapshot);
      }

      spectrumFrameRef.current = window.requestAnimationFrame(tick);
    };

    spectrumFrameRef.current = window.requestAnimationFrame(tick);
  }, [emitSpectrum, sampleSpectrumOnce]);

  const playAudio = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    const tryPlay = async () => {
      ensureAudioAnalyzer();
      const context = audioContextRef.current;
      if (context && context.state === 'suspended') {
        await context.resume();
      }
      await audio.play();
    };

    void tryPlay()
      .then(() => {
        setPlaybackError(null);
        setIsPlaying(true);
      })
      .catch(() => {
        setIsPlaying(false);
        setPlaybackError('Playback is blocked by browser policy. Press play to start.');
      });
  }, [ensureAudioAnalyzer]);

  const switchTrack = useCallback(
    (nextIndex: number, continuePlayback: boolean) => {
      const boundedIndex = ((nextIndex % FREE_SYNTHWAVE_TRACKS.length) + FREE_SYNTHWAVE_TRACKS.length) %
        FREE_SYNTHWAVE_TRACKS.length;
      setTrackIndex(boundedIndex);
      setCurrentTime(0);
      setDuration(0);
      setPlaybackError(null);
      setIsPlaying(continuePlayback);
    },
    [],
  );

  const handleTogglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    if (audio.paused) {
      playAudio();
      return;
    }
    audio.pause();
    setIsPlaying(false);
  }, [playAudio]);

  const handleStepTrack = useCallback(
    (delta: number, forcePlayback = false) => {
      switchTrack(trackIndex + delta, forcePlayback || isPlaying);
    },
    [isPlaying, switchTrack, trackIndex],
  );

  const handleSeek = useCallback((_event: Event, value: number | number[]) => {
    const next = Array.isArray(value) ? value[0] : value;
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(duration) || duration <= 0) {
      return;
    }
    const targetTime = Math.max(0, Math.min(duration, (next / 100) * duration));
    audio.currentTime = targetTime;
    setCurrentTime(targetTime);
  }, [duration]);

  const handleVolume = useCallback((_event: Event, value: number | number[]) => {
    const next = Array.isArray(value) ? value[0] : value;
    const normalized = Math.max(0, Math.min(1, next / 100));
    setVolume(normalized);
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    audio.volume = volume;
  }, [volume]);

  useEffect(() => {
    if (!isPlaying) {
      return;
    }
    playAudio();
  }, [isPlaying, playAudio, trackIndex]);

  useEffect(() => {
    if (!isPlaying) {
      stopSpectrumLoop();
      beatAverageRef.current = 0;
      smoothedBandsRef.current = EMPTY_BANDS;
      spectrumEmitAtRef.current = 0;
      emitSpectrum(null);
      return;
    }

    startSpectrumLoop();
    return () => {
      stopSpectrumLoop();
    };
  }, [emitSpectrum, isPlaying, startSpectrumLoop, stopSpectrumLoop]);

  useEffect(() => {
    return () => {
      stopSpectrumLoop();
      emitSpectrum(null);

      try {
        sourceNodeRef.current?.disconnect();
      } catch {
        // no-op
      }
      try {
        analyserRef.current?.disconnect();
      } catch {
        // no-op
      }

      const context = audioContextRef.current;
      if (context) {
        void context.close();
      }
      sourceNodeRef.current = null;
      analyserRef.current = null;
      frequencyDataRef.current = null;
      audioContextRef.current = null;
    };
  }, [emitSpectrum, stopSpectrumLoop]);

  useEffect(() => {
    if (!onHeightChange) {
      return;
    }

    const node = rootRef.current;
    if (!node) {
      return;
    }

    const emitHeight = () => {
      const next = Math.max(0, Math.ceil(node.getBoundingClientRect().height));
      if (Math.abs(next - lastHeightRef.current) < 1) {
        return;
      }
      lastHeightRef.current = next;
      onHeightChange(next);
    };

    emitHeight();
    const observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => emitHeight());
    observer?.observe(node);
    window.addEventListener('resize', emitHeight);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', emitHeight);
    };
  }, [onHeightChange, showCredits, compactTrackList]);

  return (
    <Paper
      ref={rootRef}
      elevation={4}
      sx={{
        position: 'absolute',
        left: { xs: 8, md: 16 },
        bottom: { xs: mobileBottomOffset, md: desktopBottomOffset },
        width: { xs: 'calc(100% - 16px)', sm: compact ? 330 : 360 },
        maxWidth: 'calc(100vw - 16px)',
        maxHeight: {
          xs: mobileMaxHeight,
          md: desktopMaxHeight,
        },
        overflow: 'hidden',
        zIndex: 14,
        p: 1,
        ...panelSurfaceSx,
      }}
    >
      <Stack spacing={0.8}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={0.6}>
          <Stack direction="row" spacing={0.6} alignItems="center" sx={{ minWidth: 0 }}>
            <GraphicEqRoundedIcon fontSize="small" sx={{ color: '#89e9ff' }} />
            <Typography
              variant="caption"
              sx={{
                ...panelTitleSx,
                fontWeight: 700,
                whiteSpace: 'nowrap',
              }}
            >
              Neon Radio
            </Typography>
            <Chip
              size="small"
              label="Free CC"
              variant="outlined"
              sx={{
                ...panelChipSx,
                height: 20,
                color: '#cfeaff',
                borderColor: alpha('#8ce6ff', 0.52),
                backgroundColor: alpha('#0e2a47', 0.46),
              }}
            />
          </Stack>
          <Tooltip title={showCredits ? 'Hide credits' : 'Show credits'}>
            <IconButton
              size="small"
              onClick={() => setShowCredits((current) => !current)}
              sx={{
                ...panelActionButtonSx,
                border: '1px solid',
                borderColor: alpha('#8ce6ff', 0.42),
              }}
            >
              <InfoOutlineRoundedIcon fontSize="small" sx={{ color: '#9be9ff' }} />
            </IconButton>
          </Tooltip>
        </Stack>

        <Box
          sx={{
            ...panelInsetSx,
            px: 0.85,
            py: 0.7,
            background:
              'linear-gradient(135deg, rgba(9,38,67,0.68) 0%, rgba(8,25,45,0.74) 100%)',
          }}
        >
          <Typography
            variant="body2"
            sx={{ color: '#e8f6ff', fontWeight: 600, lineHeight: 1.2 }}
          >
            {activeTrack.title}
          </Typography>
          <Typography variant="caption" sx={{ ...panelMetaTextSx, lineHeight: 1.2 }}>
            {activeTrack.artist} · {activeTrack.mood}
          </Typography>
        </Box>

        <Box
          sx={{
            ...panelInsetSx,
            px: 0.7,
            py: 0.62,
            background:
              'linear-gradient(148deg, rgba(7,28,49,0.78), rgba(10,35,60,0.66))',
          }}
        >
          <Stack direction="row" spacing={0.55} flexWrap="wrap" sx={{ mb: 0.55 }}>
            <Chip
              size="small"
              label={visualReactive ? 'Audio Reactive' : 'Listening'}
              sx={{
                ...panelChipSx,
                height: 20,
                color: visualReactive ? '#072033' : '#c7e3ff',
                borderColor: alpha('#88e6ff', visualReactive ? 0.82 : 0.42),
                backgroundColor: visualReactive
                  ? alpha('#8beeff', 0.86)
                  : alpha('#0e3558', 0.52),
              }}
            />
            <Chip
              size="small"
              label={`Energy ${Math.round(visualEnergy * 100)}%`}
              sx={{
                ...panelChipSx,
                height: 20,
                color: '#d7edff',
                borderColor: alpha('#88e6ff', 0.4),
                backgroundColor: alpha('#0d2f50', 0.54),
              }}
            />
            <Chip
              size="small"
              label={`Beat ${Math.round(visualBeat * 100)}%`}
              sx={{
                ...panelChipSx,
                height: 20,
                color: '#d8ecff',
                borderColor: alpha('#ffcd83', 0.44),
                backgroundColor: alpha('#2e2b44', 0.46),
              }}
            />
          </Stack>

          <Stack
            direction="row"
            spacing={0.55}
            alignItems="flex-end"
            sx={{
              height: 56,
              px: 0.15,
            }}
          >
            {SPECTRUM_BANDS.map((band) => {
              const level = visualBands[band.key];
              const barHeight = Math.max(8, Math.round(8 + level * 30 + visualBeat * 8));
              return (
                <Box key={band.key} sx={{ flex: 1, minWidth: 0 }}>
                  <Box
                    sx={{
                      position: 'relative',
                      height: 40,
                      borderRadius: 0.8,
                      border: `1px solid ${alpha('#7fd8ff', 0.26)}`,
                      backgroundColor: alpha('#09253f', 0.56),
                      overflow: 'hidden',
                    }}
                  >
                    <Box
                      sx={{
                        position: 'absolute',
                        left: 2,
                        right: 2,
                        bottom: 2,
                        height: barHeight,
                        maxHeight: 36,
                        borderRadius: 0.7,
                        background:
                          `linear-gradient(180deg, ${alpha('#f5fbff', 0.92)} 0%, ${alpha(band.color, 0.88)} 52%, ${alpha(band.color, 0.44)} 100%)`,
                        boxShadow: `0 0 12px ${alpha(band.color, 0.52)}`,
                      }}
                    />
                  </Box>
                  <Typography
                    variant="caption"
                    sx={{
                      mt: 0.22,
                      display: 'block',
                      textAlign: 'center',
                      fontSize: compactTrackList ? '0.54rem' : '0.58rem',
                      letterSpacing: '0.02em',
                      color: alpha('#b8daf8', 0.92),
                    }}
                  >
                    {compactTrackList ? band.label.slice(0, 3) : band.label}
                  </Typography>
                </Box>
              );
            })}
          </Stack>
        </Box>

        <Stack direction="row" alignItems="center" spacing={0.65}>
          <Tooltip title="Previous track">
            <IconButton
              size="small"
              onClick={() => handleStepTrack(-1)}
              sx={{
                ...panelActionButtonSx,
                border: '1px solid',
                borderColor: alpha('#8ce6ff', 0.35),
              }}
            >
              <SkipPreviousRoundedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title={isPlaying ? 'Pause' : 'Play'}>
            <IconButton
              size="small"
              onClick={handleTogglePlay}
              sx={{
                ...panelActionButtonSx,
                border: '1px solid',
                borderColor: alpha('#9befff', 0.52),
                backgroundColor: alpha('#113a5f', 0.74),
              }}
            >
              {isPlaying ? (
                <PauseRoundedIcon fontSize="small" />
              ) : (
                <PlayArrowRoundedIcon fontSize="small" />
              )}
            </IconButton>
          </Tooltip>
          <Tooltip title="Next track">
            <IconButton
              size="small"
              onClick={() => handleStepTrack(1)}
              sx={{
                ...panelActionButtonSx,
                border: '1px solid',
                borderColor: alpha('#8ce6ff', 0.35),
              }}
            >
              <SkipNextRoundedIcon fontSize="small" />
            </IconButton>
          </Tooltip>

          <Typography variant="caption" sx={{ color: alpha('#c6dffc', 0.93), ml: 0.35 }}>
            {formatTime(currentTime)} / {formatTime(duration)}
          </Typography>
        </Stack>

        <Slider
          size="small"
          value={progressPercent}
          onChange={handleSeek}
          min={0}
          max={100}
          step={0.25}
          aria-label="Playback progress"
          sx={{
            color: '#8beeff',
            px: 0.4,
            '& .MuiSlider-thumb': {
              width: 11,
              height: 11,
            },
            '& .MuiSlider-track': {
              border: 'none',
            },
            '& .MuiSlider-rail': {
              opacity: 0.3,
              backgroundColor: '#5a7896',
            },
          }}
        />

        <Stack direction="row" spacing={0.7} alignItems="center">
          <VolumeUpRoundedIcon fontSize="small" sx={{ color: '#9ce9ff' }} />
          <Slider
            size="small"
            value={Math.round(volume * 100)}
            onChange={handleVolume}
            min={0}
            max={100}
            step={1}
            aria-label="Volume"
            sx={{
              color: '#95ebff',
              '& .MuiSlider-thumb': {
                width: 10,
                height: 10,
              },
            }}
          />
          <Typography
            variant="caption"
            sx={{ color: alpha('#bfd7f4', 0.9), minWidth: 30, textAlign: 'right' }}
          >
            {Math.round(volume * 100)}%
          </Typography>
        </Stack>

        <Box sx={{ display: 'flex', gap: 0.55, flexWrap: 'wrap' }}>
          {FREE_SYNTHWAVE_TRACKS.map((track, index) => {
            const active = index === trackIndex;
            return (
              <Chip
                key={track.id}
                size="small"
                label={compactTrackList ? `${index + 1}` : `${index + 1}. ${track.title}`}
                clickable
                onClick={() => switchTrack(index, isPlaying)}
                variant={active ? 'filled' : 'outlined'}
                sx={{
                  ...panelChipSx,
                  height: 22,
                  color: active ? '#022138' : '#d4e9ff',
                  borderColor: alpha(active ? '#93ebff' : '#86d9ff', active ? 0.88 : 0.42),
                  backgroundColor: active
                    ? alpha('#93ebff', 0.86)
                    : alpha('#0d2b4a', 0.52),
                  '& .MuiChip-label': {
                    fontWeight: active ? 700 : 500,
                  },
                }}
              />
            );
          })}
        </Box>

        {playbackError && (
          <Typography
            variant="caption"
            sx={{
              color: '#ffb8c7',
              border: `1px solid ${alpha('#ff8fa8', 0.42)}`,
              borderRadius: 1,
              px: 0.7,
              py: 0.45,
              backgroundColor: alpha('#51263a', 0.45),
            }}
          >
            {playbackError}
          </Typography>
        )}

        <Collapse in={showCredits}>
          <Stack
            spacing={0.6}
            sx={{
              ...panelInsetSx,
              ...panelScrollSx,
              mt: 0.2,
              p: 0.75,
              maxHeight: 138,
              overflowY: 'auto',
            }}
          >
            <Typography variant="caption" sx={{ ...panelMetaTextSx, color: '#c8e8ff' }}>
              Free music credits (Wikimedia Commons)
            </Typography>
            {FREE_SYNTHWAVE_TRACKS.map((track) => (
              <Stack key={`${track.id}-credit`} spacing={0.2}>
                <Typography variant="caption" sx={{ color: '#d7ebff', lineHeight: 1.2 }}>
                  {track.title} — {track.artist}
                </Typography>
                <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap">
                  <Link
                    href={track.sourcePage}
                    target="_blank"
                    rel="noreferrer"
                    underline="hover"
                    sx={{ fontSize: '0.68rem', color: '#8ceaff', lineHeight: 1.2 }}
                  >
                    Source
                  </Link>
                  <OpenInNewRoundedIcon sx={{ fontSize: '0.75rem', color: alpha('#8ceaff', 0.9) }} />
                  <Link
                    href={track.licenseUrl}
                    target="_blank"
                    rel="noreferrer"
                    underline="hover"
                    sx={{ fontSize: '0.68rem', color: '#9beec4', lineHeight: 1.2 }}
                  >
                    {track.licenseLabel}
                  </Link>
                </Stack>
              </Stack>
            ))}
          </Stack>
        </Collapse>
      </Stack>

      <audio
        ref={audioRef}
        preload="metadata"
        src={activeTrack.sourceUrl}
        crossOrigin="anonymous"
        onPlay={() => {
          setIsPlaying(true);
          startSpectrumLoop();
        }}
        onPause={() => {
          setIsPlaying(false);
          stopSpectrumLoop();
          emitSpectrum(null);
        }}
        onTimeUpdate={() => {
          const audio = audioRef.current;
          if (!audio) {
            return;
          }
          setCurrentTime(audio.currentTime);
        }}
        onLoadedMetadata={() => {
          const audio = audioRef.current;
          if (!audio) {
            return;
          }
          setDuration(audio.duration || 0);
        }}
        onEnded={() => {
          handleStepTrack(1, true);
        }}
        onError={() => {
          setPlaybackError('The selected track is unavailable right now. Switch to another one.');
          setIsPlaying(false);
          stopSpectrumLoop();
          emitSpectrum(null);
        }}
      />
    </Paper>
  );
}
