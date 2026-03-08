import React from 'react';
import ReactDOM from 'react-dom/client';
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material';
import { alpha } from '@mui/material/styles';
import App from './App';
import './index.css';
import { UI_MOTION } from './theme/motion';

const bodyFont = '"Oxanium", "Space Grotesk", "Segoe UI", sans-serif';
const displayFont = '"Orbitron", "Oxanium", "Space Grotesk", "Segoe UI", sans-serif';
const monoFont = '"JetBrains Mono", "SFMono-Regular", Consolas, monospace';

const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#44e7ff',
      light: '#8ef5ff',
      dark: '#1da7c8',
      contrastText: '#03131f',
    },
    secondary: {
      main: '#ff9d52',
      light: '#ffc588',
      dark: '#d6782f',
    },
    info: {
      main: '#7ea8ff',
    },
    success: {
      main: '#64eeb8',
    },
    warning: {
      main: '#ffbe68',
    },
    error: {
      main: '#ff7f9d',
    },
    background: {
      default: '#030812',
      paper: '#071629',
    },
    text: {
      primary: '#e7f6ff',
      secondary: '#94b7d7',
    },
    divider: alpha('#79d8ff', 0.24),
  },
  shape: {
    borderRadius: 14,
  },
  typography: {
    fontFamily: bodyFont,
    h1: { fontFamily: displayFont, fontWeight: 800, letterSpacing: '0.03em' },
    h2: { fontFamily: displayFont, fontWeight: 800, letterSpacing: '0.03em' },
    h3: { fontFamily: displayFont, fontWeight: 700, letterSpacing: '0.03em' },
    h4: { fontFamily: displayFont, fontWeight: 700, letterSpacing: '0.03em' },
    h5: { fontFamily: displayFont, fontWeight: 700, letterSpacing: '0.03em' },
    h6: { fontFamily: displayFont, fontWeight: 700, letterSpacing: '0.04em' },
    subtitle1: { fontFamily: displayFont, letterSpacing: '0.03em' },
    subtitle2: { fontFamily: displayFont, letterSpacing: '0.03em' },
    button: { fontFamily: displayFont, fontWeight: 700, letterSpacing: '0.06em' },
    overline: { fontFamily: displayFont, letterSpacing: '0.12em' },
    caption: { letterSpacing: '0.02em' },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          fontFamily: bodyFont,
          textRendering: 'optimizeLegibility',
          WebkitFontSmoothing: 'antialiased',
          letterSpacing: '0.01em',
        },
        code: {
          fontFamily: monoFont,
        },
        pre: {
          fontFamily: monoFont,
        },
        '::selection': {
          backgroundColor: 'rgba(76, 189, 255, 0.28)',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          borderRadius: 10,
          letterSpacing: '0.05em',
          transition: `transform ${UI_MOTION.hoverMs}ms ease, box-shadow ${UI_MOTION.hoverMs}ms ease, border-color ${UI_MOTION.hoverMs}ms ease`,
          '&.Mui-focusVisible': {
            outline: `2px solid ${alpha('#97ecff', 0.7)}`,
            outlineOffset: 2,
          },
        },
        contained: {
          background:
            'linear-gradient(96deg, rgba(56,210,255,0.96) 0%, rgba(109,255,226,0.94) 50%, rgba(124,150,255,0.9) 100%)',
          color: '#031426',
          boxShadow: `0 8px 24px ${alpha('#2fd4ff', 0.34)}`,
          '&:hover': {
            background:
              'linear-gradient(96deg, rgba(44,194,244,0.96) 0%, rgba(88,245,213,0.94) 50%, rgba(107,133,239,0.92) 100%)',
            transform: 'translateY(-1px)',
          },
        },
        outlined: {
          borderColor: alpha('#7edfff', 0.46),
          backgroundColor: alpha('#081d35', 0.48),
          '&:hover': {
            borderColor: alpha('#a7ecff', 0.84),
            backgroundColor: alpha('#0d2643', 0.66),
            transform: 'translateY(-1px)',
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          border: `1px solid ${alpha('#74d8ff', 0.18)}`,
          transition: `box-shadow ${UI_MOTION.hoverMs}ms ease, border-color ${UI_MOTION.hoverMs}ms ease`,
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          border: `1px solid ${alpha('#74d8ff', 0.2)}`,
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundImage: 'none',
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 999,
          backgroundColor: alpha('#0a2441', 0.72),
        },
        label: {
          fontFamily: displayFont,
          letterSpacing: '0.04em',
          fontWeight: 600,
        },
      },
    },
    MuiInputBase: {
      styleOverrides: {
        root: {
          borderRadius: 10,
        },
        input: {
          fontFamily: bodyFont,
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          backgroundColor: alpha('#071c34', 0.72),
          '& .MuiOutlinedInput-notchedOutline': {
            borderColor: alpha('#79d9ff', 0.38),
          },
          '&:hover .MuiOutlinedInput-notchedOutline': {
            borderColor: alpha('#9fe8ff', 0.7),
          },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderColor: alpha('#66e8ff', 0.92),
            boxShadow: `0 0 0 2px ${alpha('#4bdfff', 0.18)}`,
          },
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          color: '#cfe9ff',
          transition: `transform ${UI_MOTION.focusMs}ms ease, background-color ${UI_MOTION.focusMs}ms ease`,
          '&:hover': {
            backgroundColor: alpha('#0e2742', 0.84),
            transform: 'translateY(-1px)',
          },
          '&.Mui-focusVisible': {
            outline: `2px solid ${alpha('#97ecff', 0.62)}`,
            outlineOffset: 1,
          },
        },
      },
    },
    MuiToggleButtonGroup: {
      styleOverrides: {
        grouped: {
          borderColor: alpha('#73d7ff', 0.34),
          '&:not(:first-of-type)': {
            marginLeft: -1,
          },
        },
      },
    },
    MuiToggleButton: {
      styleOverrides: {
        root: {
          borderColor: alpha('#72d6ff', 0.32),
          color: '#c9e7ff',
          textTransform: 'none',
          fontFamily: displayFont,
          letterSpacing: '0.05em',
          transition: `transform ${UI_MOTION.focusMs}ms ease, background-color ${UI_MOTION.focusMs}ms ease`,
          '&:hover': {
            backgroundColor: alpha('#0f2b4a', 0.65),
            transform: 'translateY(-1px)',
          },
          '&.Mui-selected': {
            color: '#ecfbff',
            borderColor: alpha('#98ecff', 0.7),
            background:
              'linear-gradient(96deg, rgba(28,74,110,0.74) 0%, rgba(19,102,126,0.76) 100%)',
            boxShadow: `0 0 20px ${alpha('#44d7ff', 0.2)}`,
          },
          '&.Mui-selected:hover': {
            background:
              'linear-gradient(96deg, rgba(31,84,124,0.82) 0%, rgba(22,111,137,0.86) 100%)',
          },
        },
      },
    },
    MuiSwitch: {
      styleOverrides: {
        switchBase: {
          '&.Mui-checked': {
            color: '#8cf0ff',
          },
          '&.Mui-checked + .MuiSwitch-track': {
            backgroundColor: alpha('#4ee0ff', 0.52),
          },
        },
        track: {
          backgroundColor: alpha('#7d93b4', 0.35),
        },
      },
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: {
          backgroundColor: alpha('#87a2c5', 0.24),
        },
      },
    },
    MuiDivider: {
      styleOverrides: {
        root: {
          borderColor: alpha('#7ad8ff', 0.2),
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderBottom: `1px solid ${alpha('#77b5ea', 0.2)}`,
        },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: alpha('#051223', 0.96),
          border: `1px solid ${alpha('#7cdfff', 0.32)}`,
          color: '#d6eeff',
          letterSpacing: '0.02em',
          backdropFilter: 'blur(8px)',
        },
        arrow: {
          color: alpha('#051223', 0.96),
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          border: `1px solid ${alpha('#7cdfff', 0.24)}`,
        },
      },
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  </React.StrictMode>,
);
