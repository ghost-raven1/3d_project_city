import { FormEvent, useMemo, useState } from 'react';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import DataObjectRoundedIcon from '@mui/icons-material/DataObjectRounded';
import ImageRoundedIcon from '@mui/icons-material/ImageRounded';
import SummarizeRoundedIcon from '@mui/icons-material/SummarizeRounded';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import VisibilityOffRoundedIcon from '@mui/icons-material/VisibilityOffRounded';
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import {
  Alert,
  Autocomplete,
  Badge,
  Box,
  Button,
  Chip,
  Container,
  Drawer,
  FormControlLabel,
  IconButton,
  InputAdornment,
  LinearProgress,
  MenuItem,
  Paper,
  Slider,
  Stack,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import { RepositoryResult } from '../types/repository';
import { TimelineBounds } from '../utils/city';
import { CityDNA } from '../utils/city-dna';
import { ShareButton } from './ShareButton';

interface TopControlPanelProps {
  repoUrl: string;
  isBusy: boolean;
  progress: number;
  message: string;
  error: string | null;
  data: RepositoryResult | null;
  timelineBounds: TimelineBounds | null;
  timelineTs: number | null;
  timelineLabel: string;
  cityDna: CityDNA | null;
  githubToken: string;
  languageFilter: string;
  authorFilter: string;
  districtFilter: string;
  branchFilter: string;
  riskFilter: 'all' | 'low' | 'medium' | 'high';
  pathFilter: string;
  viewMode: 'overview' | 'architecture' | 'risk' | 'stack';
  compareEnabled: boolean;
  compareMode: 'ghost' | 'split';
  compareTs: number | null;
  compareLabel: string;
  compareSummary: {
    filesDelta: number;
    roadsDelta: number;
    riskDelta: number;
    hubsDelta: number;
  } | null;
  languageOptions: string[];
  authorOptions: string[];
  districtOptions: string[];
  branchOptions: string[];
  jumpOptions: string[];
  autoTour: boolean;
  liveWatch: boolean;
  showAtmosphere: boolean;
  showWeather: boolean;
  showBuilders: boolean;
  showCyberpunkOverlay: boolean;
  timeOfDay: 'auto' | 'dawn' | 'day' | 'sunset' | 'night';
  weatherMode: 'auto' | 'clear' | 'mist' | 'rain' | 'storm';
  dynamicAtmosphere: boolean;
  constructionMode: boolean;
  constructionSpeed: number;
  constructionProgress: number;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onRepoUrlChange: (value: string) => void;
  onGithubTokenChange: (value: string) => void;
  onStartParsing: () => void;
  onTimelineChange: (value: number) => void;
  onAutoTourChange: (value: boolean) => void;
  onLiveWatchChange: (value: boolean) => void;
  onShowAtmosphereChange: (value: boolean) => void;
  onShowWeatherChange: (value: boolean) => void;
  onShowBuildersChange: (value: boolean) => void;
  onShowCyberpunkOverlayChange: (value: boolean) => void;
  onTimeOfDayChange: (value: 'auto' | 'dawn' | 'day' | 'sunset' | 'night') => void;
  onWeatherModeChange: (value: 'auto' | 'clear' | 'mist' | 'rain' | 'storm') => void;
  onDynamicAtmosphereChange: (value: boolean) => void;
  onConstructionModeChange: (value: boolean) => void;
  onConstructionSpeedChange: (value: number) => void;
  onLanguageFilterChange: (value: string) => void;
  onAuthorFilterChange: (value: string) => void;
  onDistrictFilterChange: (value: string) => void;
  onBranchFilterChange: (value: string) => void;
  onRiskFilterChange: (value: 'all' | 'low' | 'medium' | 'high') => void;
  onPathFilterChange: (value: string) => void;
  onViewModeChange: (value: 'overview' | 'architecture' | 'risk' | 'stack') => void;
  onCompareEnabledChange: (value: boolean) => void;
  onCompareModeChange: (value: 'ghost' | 'split') => void;
  onCompareTsChange: (value: number) => void;
  onExportSummary: () => void;
  onExportPng: () => void;
  onExportJson: () => void;
  onExportHotspots: () => void;
  onJumpToFile: (path: string) => void;
}

export function TopControlPanel({
  repoUrl,
  isBusy,
  progress,
  message,
  error,
  data,
  timelineBounds,
  timelineTs,
  timelineLabel,
  cityDna,
  githubToken,
  languageFilter,
  authorFilter,
  districtFilter,
  branchFilter,
  riskFilter,
  pathFilter,
  viewMode,
  compareEnabled,
  compareMode,
  compareTs,
  compareLabel,
  compareSummary,
  languageOptions,
  authorOptions,
  districtOptions,
  branchOptions,
  jumpOptions,
  autoTour,
  liveWatch,
  showAtmosphere,
  showWeather,
  showBuilders,
  showCyberpunkOverlay,
  timeOfDay,
  weatherMode,
  dynamicAtmosphere,
  constructionMode,
  constructionSpeed,
  constructionProgress,
  collapsed,
  onToggleCollapsed,
  onRepoUrlChange,
  onGithubTokenChange,
  onStartParsing,
  onTimelineChange,
  onAutoTourChange,
  onLiveWatchChange,
  onShowAtmosphereChange,
  onShowWeatherChange,
  onShowBuildersChange,
  onShowCyberpunkOverlayChange,
  onTimeOfDayChange,
  onWeatherModeChange,
  onDynamicAtmosphereChange,
  onConstructionModeChange,
  onConstructionSpeedChange,
  onLanguageFilterChange,
  onAuthorFilterChange,
  onDistrictFilterChange,
  onBranchFilterChange,
  onRiskFilterChange,
  onPathFilterChange,
  onViewModeChange,
  onCompareEnabledChange,
  onCompareModeChange,
  onCompareTsChange,
  onExportSummary,
  onExportPng,
  onExportJson,
  onExportHotspots,
  onJumpToFile,
}: TopControlPanelProps) {
  const [tokenVisible, setTokenVisible] = useState(false);
  const stackChips = data?.stack
    ? [
        ...data.stack.runtimes.slice(0, 2),
        ...data.stack.frameworks.slice(0, 3),
        ...data.stack.infrastructure.slice(0, 2),
      ]
    : [];

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (languageFilter !== 'all') {
      count += 1;
    }
    if (authorFilter !== 'all') {
      count += 1;
    }
    if (districtFilter !== 'all') {
      count += 1;
    }
    if (branchFilter !== 'all') {
      count += 1;
    }
    if (riskFilter !== 'all') {
      count += 1;
    }
    if (pathFilter.trim().length > 0) {
      count += 1;
    }

    return count;
  }, [authorFilter, branchFilter, districtFilter, languageFilter, pathFilter, riskFilter]);

  const hasTimeline = Boolean(data && timelineBounds && timelineTs !== null);
  const drawerOpen = !collapsed;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onStartParsing();
  };

  return (
    <>
      <Box
        sx={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 20,
          pointerEvents: 'none',
        }}
      >
        <Container maxWidth="xl" sx={{ pt: { xs: 0.8, md: 1.1 }, pb: 0 }}>
          <Paper
            elevation={6}
            sx={{
              p: 1,
              borderRadius: 2.5,
              backdropFilter: 'blur(10px)',
              backgroundColor: 'rgba(248,252,255,0.87)',
              border: '1px solid rgba(120,150,190,0.24)',
              pointerEvents: 'auto',
            }}
          >
            <Stack spacing={0.9}>
              <Stack
                direction={{ xs: 'column', md: 'row' }}
                spacing={0.9}
                alignItems={{ xs: 'stretch', md: 'center' }}
              >
                <Stack direction="row" spacing={0.7} alignItems="center" flexWrap="wrap">
                  <Typography variant="subtitle1" fontWeight={900}>
                    3D Repository City
                  </Typography>
                  {hasTimeline && (
                    <Chip size="small" label={timelineLabel} color="primary" variant="outlined" />
                  )}
                  {data && (
                    <Chip
                      size="small"
                      label={`${data.files.length} files · ${data.imports.length} roads`}
                      variant="outlined"
                    />
                  )}
                </Stack>

                <Box
                  component="form"
                  onSubmit={handleSubmit}
                  sx={{
                    display: 'flex',
                    gap: 0.8,
                    flex: 1,
                    minWidth: 0,
                    alignItems: 'center',
                  }}
                >
                  <TextField
                    fullWidth
                    size="small"
                    placeholder="https://github.com/facebook/react"
                    value={repoUrl}
                    onChange={(event) => onRepoUrlChange(event.target.value)}
                  />
                  <Button
                    type="submit"
                    variant="contained"
                    disabled={isBusy || !repoUrl.trim()}
                    sx={{ whiteSpace: 'nowrap' }}
                  >
                    Построить
                  </Button>
                </Box>

                <Stack direction="row" spacing={0.4} alignItems="center" flexWrap="wrap">
                  {isBusy && (
                    <Chip
                      size="small"
                      color="warning"
                      label={`${Math.round(progress)}%`}
                      sx={{ fontWeight: 700 }}
                    />
                  )}

                  <Tooltip title="Controls, timeline and filters">
                    <IconButton size="small" onClick={onToggleCollapsed}>
                      <Badge
                        color="secondary"
                        badgeContent={activeFilterCount > 0 ? activeFilterCount : 0}
                        overlap="circular"
                      >
                        <TuneRoundedIcon fontSize="small" />
                      </Badge>
                    </IconButton>
                  </Tooltip>

                  <ShareButton repoUrl={repoUrl} compact />

                  <Tooltip title="Copy executive summary">
                    <IconButton size="small" onClick={onExportSummary}>
                      <SummarizeRoundedIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Export scene PNG">
                    <IconButton size="small" onClick={onExportPng}>
                      <ImageRoundedIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Export JSON report">
                    <IconButton size="small" onClick={onExportJson}>
                      <DataObjectRoundedIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Export risk hotspots">
                    <IconButton size="small" onClick={onExportHotspots}>
                      <WarningAmberRoundedIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Stack>
              </Stack>

              {isBusy && (
                <Box>
                  <LinearProgress
                    variant="determinate"
                    value={Math.max(1, Math.min(100, progress))}
                    sx={{ height: 6, borderRadius: 6 }}
                  />
                  <Typography variant="caption" color="text.secondary">
                    {message || 'Parsing repository...'}
                  </Typography>
                </Box>
              )}

              {collapsed && error && <Alert severity="error">{error}</Alert>}
            </Stack>
          </Paper>
        </Container>
      </Box>

      <Drawer
        anchor="right"
        open={drawerOpen}
        onClose={onToggleCollapsed}
        ModalProps={{ keepMounted: true }}
        PaperProps={{
          sx: {
            width: { xs: '100%', sm: 420, md: 470 },
            p: 1.5,
            backgroundColor: 'rgba(250,253,255,0.97)',
            backdropFilter: 'blur(10px)',
          },
        }}
      >
        <Stack spacing={1.2} sx={{ height: '100%', overflowY: 'auto' }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="h6" fontWeight={900}>
              Controls
            </Typography>
            <IconButton size="small" onClick={onToggleCollapsed}>
              <CloseRoundedIcon fontSize="small" />
            </IconButton>
          </Stack>

          {error && <Alert severity="error">{error}</Alert>}

          <Paper variant="outlined" sx={{ p: 1.2 }}>
            <Stack spacing={0.8}>
              <Typography variant="subtitle2" fontWeight={800}>
                GitHub token (optional)
              </Typography>
              <TextField
                size="small"
                fullWidth
                type={tokenVisible ? 'text' : 'password'}
                value={githubToken}
                placeholder="github_pat_..."
                onChange={(event) => onGithubTokenChange(event.target.value)}
                helperText="Used only for API requests from this browser session."
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        size="small"
                        onClick={() => setTokenVisible((value) => !value)}
                        edge="end"
                      >
                        {tokenVisible ? (
                          <VisibilityOffRoundedIcon fontSize="small" />
                        ) : (
                          <VisibilityRoundedIcon fontSize="small" />
                        )}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />
              {githubToken.trim().length > 0 && (
                <Stack direction="row" spacing={0.6}>
                  <Chip size="small" color="success" label="Custom token enabled" />
                  <Button size="small" onClick={() => onGithubTokenChange('')}>
                    Clear
                  </Button>
                </Stack>
              )}
            </Stack>
          </Paper>

          {data && (
            <Paper variant="outlined" sx={{ p: 1.2 }}>
              <Stack direction="row" spacing={0.6} flexWrap="wrap">
                <Chip size="small" label={`Files: ${data.files.length}`} color="primary" variant="outlined" />
                <Chip size="small" label={`Roads: ${data.imports.length}`} color="secondary" variant="outlined" />
                <Chip
                  size="small"
                  label={`Branches: ${data.branches?.length ?? 0}`}
                  color="success"
                  variant="outlined"
                />
                {data.analysis && (
                  <Chip
                    size="small"
                    label={`GitHub req: ${data.analysis.diagnostics.githubRequests}`}
                    variant="outlined"
                  />
                )}
              </Stack>

              {(cityDna || stackChips.length > 0) && (
                <Stack direction="row" spacing={0.6} flexWrap="wrap" mt={0.9}>
                  {cityDna && (
                    <>
                      <Chip size="small" label={`Layout: ${cityDna.layout}`} variant="outlined" />
                      <Chip size="small" label={`Style: ${cityDna.architecture}`} variant="outlined" />
                      <Chip size="small" label={`Lang: ${cityDna.metrics.primaryLanguage}`} variant="outlined" />
                    </>
                  )}
                  {stackChips.map((chip) => (
                    <Chip key={chip} size="small" label={chip} color="info" variant="outlined" />
                  ))}
                </Stack>
              )}
            </Paper>
          )}

          {hasTimeline && timelineBounds && timelineTs !== null && (
            <Paper variant="outlined" sx={{ p: 1.2 }}>
              <Stack spacing={1}>
                <Typography variant="subtitle2" fontWeight={800}>
                  Time Machine
                </Typography>

                <Slider
                  min={timelineBounds.min}
                  max={timelineBounds.max}
                  value={timelineTs}
                  onChange={(_, value) => onTimelineChange(value as number)}
                  valueLabelDisplay="auto"
                  valueLabelFormat={(value) =>
                    new Date(value).toLocaleDateString(undefined, {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })
                  }
                />

                <ToggleButtonGroup
                  size="small"
                  value={viewMode}
                  exclusive
                  onChange={(_, value) => {
                    if (value) {
                      onViewModeChange(value as 'overview' | 'architecture' | 'risk' | 'stack');
                    }
                  }}
                >
                  <ToggleButton value="overview">Overview</ToggleButton>
                  <ToggleButton value="architecture">Architecture</ToggleButton>
                  <ToggleButton value="risk">Risk</ToggleButton>
                  <ToggleButton value="stack">Stack</ToggleButton>
                </ToggleButtonGroup>

                <FormControlLabel
                  control={
                    <Switch
                      checked={compareEnabled}
                      onChange={(_, checked) => onCompareEnabledChange(checked)}
                    />
                  }
                  label="Compare dates"
                  sx={{ m: 0 }}
                />

                {compareEnabled && compareTs !== null && (
                  <Stack spacing={0.8}>
                    <ToggleButtonGroup
                      size="small"
                      value={compareMode}
                      exclusive
                      onChange={(_, value) => {
                        if (value) {
                          onCompareModeChange(value as 'ghost' | 'split');
                        }
                      }}
                    >
                      <ToggleButton value="ghost">Ghost</ToggleButton>
                      <ToggleButton value="split">Split</ToggleButton>
                    </ToggleButtonGroup>
                    <Typography variant="caption" color="text.secondary">
                      Baseline: {compareLabel}
                    </Typography>
                    <Slider
                      min={timelineBounds.min}
                      max={timelineTs}
                      value={compareTs}
                      onChange={(_, value) => onCompareTsChange(value as number)}
                      valueLabelDisplay="auto"
                      valueLabelFormat={(value) =>
                        new Date(value).toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })
                      }
                    />
                    {compareSummary && (
                      <Stack direction="row" spacing={0.6} flexWrap="wrap">
                        <Chip
                          size="small"
                          variant="outlined"
                          label={`Δ files ${compareSummary.filesDelta >= 0 ? '+' : ''}${compareSummary.filesDelta}`}
                        />
                        <Chip
                          size="small"
                          variant="outlined"
                          label={`Δ roads ${compareSummary.roadsDelta >= 0 ? '+' : ''}${compareSummary.roadsDelta}`}
                        />
                        <Chip
                          size="small"
                          variant="outlined"
                          label={`Δ risk ${compareSummary.riskDelta >= 0 ? '+' : ''}${Math.round(compareSummary.riskDelta * 100)}%`}
                        />
                        <Chip
                          size="small"
                          variant="outlined"
                          label={`Δ hubs ${compareSummary.hubsDelta >= 0 ? '+' : ''}${compareSummary.hubsDelta}`}
                        />
                      </Stack>
                    )}
                  </Stack>
                )}
              </Stack>
            </Paper>
          )}

          <Paper variant="outlined" sx={{ p: 1.2 }}>
            <Stack spacing={0.6}>
              <Typography variant="subtitle2" fontWeight={800}>
                Scene toggles
              </Typography>
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
                <TextField
                  select
                  size="small"
                  label="Time of day"
                  value={timeOfDay}
                  disabled={dynamicAtmosphere}
                  onChange={(event) =>
                    onTimeOfDayChange(
                      event.target.value as 'auto' | 'dawn' | 'day' | 'sunset' | 'night',
                    )
                  }
                  sx={{ minWidth: 150 }}
                >
                  <MenuItem value="auto">Auto</MenuItem>
                  <MenuItem value="dawn">Dawn</MenuItem>
                  <MenuItem value="day">Day</MenuItem>
                  <MenuItem value="sunset">Sunset</MenuItem>
                  <MenuItem value="night">Night</MenuItem>
                </TextField>

                <TextField
                  select
                  size="small"
                  label="Weather"
                  value={weatherMode}
                  disabled={dynamicAtmosphere}
                  onChange={(event) =>
                    onWeatherModeChange(
                      event.target.value as 'auto' | 'clear' | 'mist' | 'rain' | 'storm',
                    )
                  }
                  sx={{ minWidth: 150 }}
                >
                  <MenuItem value="auto">Auto</MenuItem>
                  <MenuItem value="clear">Clear</MenuItem>
                  <MenuItem value="mist">Mist</MenuItem>
                  <MenuItem value="rain">Rain</MenuItem>
                  <MenuItem value="storm">Storm</MenuItem>
                </TextField>
              </Stack>
              <FormControlLabel
                control={
                  <Switch
                    checked={dynamicAtmosphere}
                    onChange={(_, checked) => onDynamicAtmosphereChange(checked)}
                  />
                }
                label="Dynamic atmosphere cycle"
                sx={{ m: 0 }}
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={constructionMode}
                    onChange={(_, checked) => onConstructionModeChange(checked)}
                  />
                }
                label="Construction timelapse"
                sx={{ m: 0 }}
              />
              {constructionMode && (
                <Stack spacing={0.3}>
                  <Typography variant="caption" color="text.secondary">
                    Build speed: {constructionSpeed.toFixed(1)}x
                  </Typography>
                  <Slider
                    size="small"
                    min={0.5}
                    max={3}
                    step={0.1}
                    value={constructionSpeed}
                    onChange={(_, value) => onConstructionSpeedChange(value as number)}
                  />
                  <Typography variant="caption" color="text.secondary">
                    Build progress: {Math.round(constructionProgress * 100)}%
                  </Typography>
                  <LinearProgress
                    variant="determinate"
                    value={Math.max(1, Math.min(100, constructionProgress * 100))}
                    sx={{ height: 5, borderRadius: 4 }}
                  />
                </Stack>
              )}
              <FormControlLabel
                control={<Switch checked={autoTour} onChange={(_, checked) => onAutoTourChange(checked)} />}
                label="Auto tour"
                sx={{ m: 0 }}
              />
              <FormControlLabel
                control={<Switch checked={liveWatch} onChange={(_, checked) => onLiveWatchChange(checked)} />}
                label="Live watch (2m)"
                sx={{ m: 0 }}
              />
              <FormControlLabel
                control={
                  <Switch checked={showAtmosphere} onChange={(_, checked) => onShowAtmosphereChange(checked)} />
                }
                label="Atmosphere"
                sx={{ m: 0 }}
              />
              <FormControlLabel
                control={<Switch checked={showWeather} onChange={(_, checked) => onShowWeatherChange(checked)} />}
                label="Code weather"
                sx={{ m: 0 }}
              />
              <FormControlLabel
                control={<Switch checked={showBuilders} onChange={(_, checked) => onShowBuildersChange(checked)} />}
                label="Builders"
                sx={{ m: 0 }}
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={showCyberpunkOverlay}
                    onChange={(_, checked) => onShowCyberpunkOverlayChange(checked)}
                  />
                }
                label="Cyberpunk FX overlay"
                sx={{ m: 0 }}
              />
            </Stack>
          </Paper>

          {data && (
            <Paper variant="outlined" sx={{ p: 1.2 }}>
              <Stack spacing={1}>
                <Typography variant="subtitle2" fontWeight={800}>
                  Filters and search
                </Typography>

                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
                  <TextField
                    select
                    size="small"
                    label="Language"
                    value={languageFilter}
                    onChange={(event) => onLanguageFilterChange(event.target.value)}
                    sx={{ minWidth: 140 }}
                  >
                    <MenuItem value="all">All languages</MenuItem>
                    {languageOptions.map((value) => (
                      <MenuItem key={value} value={value}>
                        {value}
                      </MenuItem>
                    ))}
                  </TextField>

                  <TextField
                    select
                    size="small"
                    label="Author"
                    value={authorFilter}
                    onChange={(event) => onAuthorFilterChange(event.target.value)}
                    sx={{ minWidth: 160 }}
                  >
                    <MenuItem value="all">All authors</MenuItem>
                    {authorOptions.map((value) => (
                      <MenuItem key={value} value={value}>
                        {value}
                      </MenuItem>
                    ))}
                  </TextField>
                </Stack>

                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
                  <TextField
                    select
                    size="small"
                    label="District"
                    value={districtFilter}
                    onChange={(event) => onDistrictFilterChange(event.target.value)}
                    sx={{ minWidth: 140 }}
                  >
                    <MenuItem value="all">All districts</MenuItem>
                    {districtOptions.map((value) => (
                      <MenuItem key={value} value={value}>
                        {value}
                      </MenuItem>
                    ))}
                  </TextField>

                  <TextField
                    select
                    size="small"
                    label="Branch"
                    value={branchFilter}
                    onChange={(event) => onBranchFilterChange(event.target.value)}
                    sx={{ minWidth: 160 }}
                  >
                    <MenuItem value="all">All branches</MenuItem>
                    {branchOptions.map((value) => (
                      <MenuItem key={value} value={value}>
                        {value}
                      </MenuItem>
                    ))}
                  </TextField>

                  <TextField
                    select
                    size="small"
                    label="Risk"
                    value={riskFilter}
                    onChange={(event) => onRiskFilterChange(event.target.value as 'all' | 'low' | 'medium' | 'high')}
                    sx={{ minWidth: 120 }}
                  >
                    <MenuItem value="all">All risk</MenuItem>
                    <MenuItem value="high">High</MenuItem>
                    <MenuItem value="medium">Medium</MenuItem>
                    <MenuItem value="low">Low</MenuItem>
                  </TextField>
                </Stack>

                <TextField
                  size="small"
                  label="Path filter"
                  placeholder="src/components/Button.tsx"
                  value={pathFilter}
                  onChange={(event) => onPathFilterChange(event.target.value)}
                />

                <Autocomplete
                  size="small"
                  options={jumpOptions}
                  onChange={(_, value) => {
                    if (value) {
                      onJumpToFile(value);
                    }
                  }}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Jump to file"
                      placeholder="Select file to focus"
                    />
                  )}
                />
              </Stack>
            </Paper>
          )}

          <Paper variant="outlined" sx={{ p: 1.2 }}>
            <Stack direction="row" spacing={0.7} flexWrap="wrap">
              <Button size="small" variant="outlined" startIcon={<SummarizeRoundedIcon />} onClick={onExportSummary}>
                Summary
              </Button>
              <Button size="small" variant="outlined" startIcon={<ImageRoundedIcon />} onClick={onExportPng}>
                PNG
              </Button>
              <Button size="small" variant="outlined" startIcon={<DataObjectRoundedIcon />} onClick={onExportJson}>
                JSON
              </Button>
              <Button
                size="small"
                variant="outlined"
                color="warning"
                startIcon={<WarningAmberRoundedIcon />}
                onClick={onExportHotspots}
              >
                Hotspots
              </Button>
            </Stack>
          </Paper>
        </Stack>
      </Drawer>
    </>
  );
}
