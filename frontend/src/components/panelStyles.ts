import { alpha, keyframes } from '@mui/material/styles';
import { UI_MOTION } from '../theme/motion';

const panelAppear = keyframes`
  0% {
    opacity: 0;
    transform: translate3d(0, 7px, 0) scale(0.99);
  }
  100% {
    opacity: 1;
    transform: translate3d(0, 0, 0) scale(1);
  }
`;

export const panelSurfaceSx = {
  backdropFilter: 'blur(15px) saturate(155%)',
  background:
    'linear-gradient(166deg, rgba(3,14,30,0.9) 0%, rgba(5,20,42,0.86) 58%, rgba(3,12,26,0.92) 100%), repeating-linear-gradient(180deg, rgba(122,231,255,0.045) 0px, rgba(122,231,255,0.045) 1px, transparent 1px, transparent 7px)',
  border: `1px solid ${alpha('#6feaff', 0.42)}`,
  boxShadow: `0 18px 44px ${alpha('#020914', 0.62)}, inset 0 1px 0 ${alpha('#b5f2ff', 0.2)}, inset 0 0 0 1px ${alpha('#48b7ff', 0.14)}`,
  borderRadius: 1.4,
  animation: `${panelAppear} ${UI_MOTION.panelEnterMs}ms ${UI_MOTION.easeStandard}`,
  transition: `box-shadow ${UI_MOTION.hoverMs}ms ease, border-color ${UI_MOTION.hoverMs}ms ease, transform ${UI_MOTION.hoverMs}ms ease`,
  '&:hover': {
    borderColor: alpha('#9bf2ff', 0.66),
    boxShadow: `0 20px 52px ${alpha('#041326', 0.62)}, inset 0 1px 0 ${alpha('#d0f7ff', 0.3)}, inset 0 0 0 1px ${alpha('#57c0ff', 0.2)}`,
    transform: 'translateY(-1px)',
  },
};

export const panelSectionSx = {
  borderRadius: 1.2,
  border: `1px solid ${alpha('#6de8ff', 0.36)}`,
  background:
    'linear-gradient(165deg, rgba(6,19,38,0.8) 0%, rgba(8,25,49,0.74) 100%)',
};

export const panelScrollSx = {
  scrollbarWidth: 'thin',
  scrollbarColor: `${alpha('#6cdcff', 0.64)} ${alpha('#0a1e39', 0.8)}`,
  '&::-webkit-scrollbar': {
    width: 8,
    height: 8,
  },
  '&::-webkit-scrollbar-track': {
    backgroundColor: alpha('#0a1e39', 0.76),
    borderRadius: 999,
  },
  '&::-webkit-scrollbar-thumb': {
    backgroundColor: alpha('#6cdcff', 0.62),
    borderRadius: 999,
    border: `2px solid ${alpha('#091a32', 0.96)}`,
  },
  '&::-webkit-scrollbar-thumb:hover': {
    backgroundColor: alpha('#8be7ff', 0.82),
  },
};

export const panelTitleSx = {
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: '#c9f8ff',
};

export const panelMetaTextSx = {
  color: alpha('#c4dcf8', 0.9),
  letterSpacing: '0.03em',
};

export const panelInsetSx = {
  borderRadius: 0.85,
  border: `1px solid ${alpha('#82ddff', 0.3)}`,
  backgroundColor: alpha('#082442', 0.52),
};

export const panelChipSx = {
  maxWidth: '100%',
  borderColor: alpha('#89ddff', 0.46),
  backgroundColor: alpha('#0b2746', 0.56),
  '& .MuiChip-label': {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    letterSpacing: '0.03em',
  },
};

export const panelActionButtonSx = {
  borderColor: alpha('#7fdfff', 0.52),
  backgroundColor: alpha('#0b2c4f', 0.68),
  '&:hover': {
    borderColor: alpha('#b5f4ff', 0.9),
    backgroundColor: alpha('#13406d', 0.86),
  },
};

export const panelEmptyStateSx = {
  borderRadius: 1.1,
  border: `1px dashed ${alpha('#8cddff', 0.3)}`,
  backgroundColor: alpha('#0a233f', 0.42),
  px: 1,
  py: 0.8,
};

export const panelCardHoverSx = {
  transition: `transform ${UI_MOTION.hoverMs}ms ease, box-shadow ${UI_MOTION.hoverMs}ms ease, border-color ${UI_MOTION.hoverMs}ms ease`,
  '&:hover': {
    transform: 'translateY(-1px)',
    borderColor: alpha('#93e9ff', 0.44),
    boxShadow: `0 10px 20px ${alpha('#041426', 0.38)}`,
  },
};
