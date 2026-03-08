export type NarratorActionType =
  | 'repo_loaded'
  | 'mode_change'
  | 'focus_file'
  | 'timeline_shift'
  | 'compare_toggle'
  | 'tour_mode'
  | 'ui_interaction'
  | 'chat_question'
  | 'manual';

export type NarratorManualCue = 'story' | 'joke' | 'hype' | 'retro';

export type NarratorUiPanelTarget =
  | 'chat'
  | 'narrator'
  | 'insights'
  | 'branch_map'
  | 'minimap'
  | 'file_card';

export type NarratorUiAction =
  | { type: 'set_view_mode'; value: 'overview' | 'architecture' | 'risk' | 'stack' }
  | { type: 'set_tour_mode'; value: 'orbit' | 'drone' | 'walk' | 'coaster' }
  | { type: 'set_compare_enabled'; value: 'on' | 'off' }
  | { type: 'set_compare_mode'; value: 'ghost' | 'split' }
  | { type: 'set_panel_visibility'; target: NarratorUiPanelTarget; value: 'on' | 'off' }
  | { type: 'set_branch_only_mode'; value: 'on' | 'off' }
  | { type: 'select_file'; value: string };

export interface NarratorActionPayload {
  requestId?: string;
  type: NarratorActionType;
  repoUrl?: string;
  viewMode?: 'overview' | 'architecture' | 'risk' | 'stack';
  timelineLabel?: string;
  selectedPath?: string | null;
  compareEnabled?: boolean;
  compareLabel?: string | null;
  tourMode?: 'orbit' | 'drone' | 'walk' | 'coaster' | null;
  interaction?: string | null;
  interactionValue?: string | null;
  sourceMessageId?: string | null;
  question?: string | null;
  manualCue?: NarratorManualCue;
  stats?: {
    totalFiles?: number;
    totalCommits?: number;
    topLanguage?: string | null;
    hotspotPath?: string | null;
  };
}

export interface NarratorStory {
  id: string;
  action: NarratorActionType;
  requestId: string | null;
  text: string;
  createdAt: string;
  uiActions?: NarratorUiAction[];
}

export type NarratorAckStatus =
  | 'accepted'
  | 'throttled'
  | 'busy'
  | 'invalid'
  | 'disabled';

export interface NarratorAckPayload {
  requestId: string | null;
  status: NarratorAckStatus;
  retryAfterMs?: number;
  message?: string;
}

export interface NarratorStatusPayload {
  status: 'idle' | 'thinking' | 'error';
  message?: string;
  requestId: string | null;
}
