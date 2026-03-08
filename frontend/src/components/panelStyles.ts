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
    'linear-gradient(166deg, rgba(5,18,35,0.86) 0%, rgba(6,22,44,0.82) 55%, rgba(4,14,29,0.9) 100%), repeating-linear-gradient(180deg, rgba(125,220,255,0.03) 0px, rgba(125,220,255,0.03) 1px, transparent 1px, transparent 8px)',
  border: `1px solid ${alpha('#77d9ff', 0.34)}`,
  boxShadow: `0 18px 44px ${alpha('#030d20', 0.52)}, inset 0 1px 0 ${alpha('#b5f2ff', 0.14)}`,
  borderRadius: 2.2,
  animation: `${panelAppear} ${UI_MOTION.panelEnterMs}ms ${UI_MOTION.easeStandard}`,
  transition: `box-shadow ${UI_MOTION.hoverMs}ms ease, border-color ${UI_MOTION.hoverMs}ms ease, transform ${UI_MOTION.hoverMs}ms ease`,
  '&:hover': {
    borderColor: alpha('#8fe8ff', 0.5),
    boxShadow: `0 20px 52px ${alpha('#041326', 0.58)}, inset 0 1px 0 ${alpha('#d0f7ff', 0.22)}`,
    transform: 'translateY(-1px)',
  },
};

export const panelSectionSx = {
  borderRadius: 1.7,
  border: `1px solid ${alpha('#77d6ff', 0.32)}`,
  background:
    'linear-gradient(165deg, rgba(7,22,42,0.72) 0%, rgba(8,27,51,0.68) 100%)',
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
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: '#b4f2ff',
};

export const panelMetaTextSx = {
  color: alpha('#c4dcf8', 0.9),
  letterSpacing: '0.03em',
};

export const panelInsetSx = {
  borderRadius: 1,
  border: `1px solid ${alpha('#82ddff', 0.22)}`,
  backgroundColor: alpha('#0a2744', 0.42),
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
  borderColor: alpha('#7fdfff', 0.4),
  backgroundColor: alpha('#0a2a4b', 0.6),
  '&:hover': {
    borderColor: alpha('#a7eeff', 0.82),
    backgroundColor: alpha('#123a62', 0.76),
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
