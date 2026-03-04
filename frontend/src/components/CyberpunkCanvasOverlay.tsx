import { useEffect, useMemo, useRef } from 'react';

type OverlayMode = 'overview' | 'architecture' | 'risk' | 'stack';

interface CyberpunkCanvasOverlayProps {
  enabled: boolean;
  accentColor: string;
  seed: number;
  mode: OverlayMode;
  intensity?: number;
}

interface RGB {
  r: number;
  g: number;
  b: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hexToRgb(color: string): RGB {
  const normalized = color.replace('#', '').trim();
  if (normalized.length !== 3 && normalized.length !== 6) {
    return { r: 46, g: 200, b: 255 };
  }

  const expanded =
    normalized.length === 3
      ? normalized
        .split('')
        .map((char) => `${char}${char}`)
        .join('')
      : normalized;

  const int = Number.parseInt(expanded, 16);
  if (Number.isNaN(int)) {
    return { r: 46, g: 200, b: 255 };
  }

  return {
    r: (int >> 16) & 255,
    g: (int >> 8) & 255,
    b: int & 255,
  };
}

function mixRgb(a: RGB, b: RGB, t: number): RGB {
  const ratio = clamp(t, 0, 1);
  return {
    r: Math.round(a.r + (b.r - a.r) * ratio),
    g: Math.round(a.g + (b.g - a.g) * ratio),
    b: Math.round(a.b + (b.b - a.b) * ratio),
  };
}

function rgba(rgb: RGB, alpha: number): string {
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${clamp(alpha, 0, 1)})`;
}

function modeTint(mode: OverlayMode): RGB {
  if (mode === 'risk') {
    return { r: 255, g: 92, b: 125 };
  }
  if (mode === 'stack') {
    return { r: 112, g: 168, b: 255 };
  }
  if (mode === 'architecture') {
    return { r: 126, g: 244, b: 255 };
  }
  return { r: 82, g: 222, b: 255 };
}

function buildNoiseTile(seed: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 96;
  const context = canvas.getContext('2d');
  if (!context) {
    return canvas;
  }

  const rng = createRng(seed);
  const image = context.createImageData(canvas.width, canvas.height);
  const { data } = image;

  for (let index = 0; index < data.length; index += 4) {
    const bright = 136 + Math.floor(rng() * 110);
    const alpha = Math.floor(16 + rng() * 52);
    data[index] = bright;
    data[index + 1] = bright;
    data[index + 2] = bright;
    data[index + 3] = alpha;
  }

  context.putImageData(image, 0, 0);
  return canvas;
}

export function CyberpunkCanvasOverlay({
  enabled,
  accentColor,
  seed,
  mode,
  intensity = 1,
}: CyberpunkCanvasOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const noiseTile = useMemo(() => buildNoiseTile(seed + 911), [seed]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }

    let rafId = 0;
    let width = 1;
    let height = 1;
    let dpr = 1;

    const baseColor = hexToRgb(accentColor);
    const tintColor = mixRgb(baseColor, modeTint(mode), 0.5);
    const blendColor = mixRgb(baseColor, tintColor, 0.6);
    const fx = clamp(intensity, 0.45, 1.45);

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      width = Math.max(1, Math.floor(bounds.width));
      height = Math.max(1, Math.floor(bounds.height));
      dpr = Math.min(1.7, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, width, height);
    };

    resize();
    const resizeObserver = new ResizeObserver(() => resize());
    resizeObserver.observe(canvas);

    if (!enabled) {
      context.clearRect(0, 0, width, height);
      return () => {
        resizeObserver.disconnect();
      };
    }

    const startedAt = performance.now();
    const streakCount = 10;

    const draw = (now: number) => {
      const elapsed = (now - startedAt) / 1000;
      const pulse = 0.52 + Math.sin(elapsed * 1.1 + seed * 0.01) * 0.48;
      context.clearRect(0, 0, width, height);

      const topGlow = context.createLinearGradient(0, 0, 0, height * 0.42);
      topGlow.addColorStop(0, rgba(tintColor, 0.13 * fx));
      topGlow.addColorStop(0.55, rgba(baseColor, 0.055 * fx));
      topGlow.addColorStop(1, 'rgba(0,0,0,0)');
      context.fillStyle = topGlow;
      context.fillRect(0, 0, width, height);

      const vignette = context.createRadialGradient(
        width * 0.5,
        height * 0.55,
        Math.min(width, height) * 0.25,
        width * 0.5,
        height * 0.55,
        Math.max(width, height) * 0.8,
      );
      vignette.addColorStop(0, 'rgba(0,0,0,0)');
      vignette.addColorStop(1, 'rgba(7,12,30,0.34)');
      context.fillStyle = vignette;
      context.fillRect(0, 0, width, height);

      context.save();
      context.lineWidth = 1;
      context.strokeStyle = rgba(blendColor, (0.032 + pulse * 0.025) * fx);
      const scanOffset = (elapsed * 28 + (seed % 11)) % 4;
      for (let y = -scanOffset; y < height + 4; y += 4) {
        context.beginPath();
        context.moveTo(0, y + 0.5);
        context.lineTo(width, y + 0.5);
        context.stroke();
      }
      context.restore();

      context.save();
      context.globalAlpha = 0.072 * fx;
      const tileW = noiseTile.width;
      const tileH = noiseTile.height;
      const shiftX = ((elapsed * 14 + seed * 0.3) % tileW) - tileW;
      const shiftY = ((elapsed * 9 + seed * 0.22) % tileH) - tileH;
      for (let x = shiftX; x < width + tileW; x += tileW) {
        for (let y = shiftY; y < height + tileH; y += tileH) {
          context.drawImage(noiseTile, x, y);
        }
      }
      context.restore();

      context.save();
      for (let index = 0; index < streakCount; index += 1) {
        const speed = 0.055 + index * 0.011;
        const phase = (elapsed * speed + (seed % 100) * 0.004 + index * 0.17) % 1;
        const x = -160 + phase * (width + 320);
        const yBase = ((index + 1) / (streakCount + 1)) * height;
        const y = yBase + Math.sin(elapsed * 1.8 + index) * (11 + index * 0.6);
        const length = 70 + (index % 5) * 24;
        const tilt = 0.19 + (index % 3) * 0.035;
        const gradient = context.createLinearGradient(x, y, x + length, y - length * tilt);
        gradient.addColorStop(0, 'rgba(0,0,0,0)');
        gradient.addColorStop(0.45, rgba(baseColor, 0.06 * fx));
        gradient.addColorStop(1, rgba(tintColor, 0.21 * fx));
        context.strokeStyle = gradient;
        context.lineWidth = 1 + (index % 3) * 0.35;
        context.beginPath();
        context.moveTo(x, y);
        context.lineTo(x + length, y - length * tilt);
        context.stroke();
      }
      context.restore();

      const glitch = Math.sin(elapsed * 2.8 + seed * 0.13);
      if (glitch > 0.86) {
        const bandCount = 2 + Math.floor((glitch - 0.86) * 20);
        context.save();
        for (let index = 0; index < bandCount; index += 1) {
          const y = ((Math.floor(elapsed * 60) * 37 + index * 97 + seed) % height) | 0;
          const h = 1 + ((index + seed) % 3);
          context.fillStyle = rgba(mixRgb(baseColor, tintColor, 0.75), 0.1 * fx);
          context.fillRect(0, y, width, h);
        }
        context.restore();
      }

      context.save();
      const borderGlow = context.createLinearGradient(0, 0, width, height);
      borderGlow.addColorStop(0, rgba(baseColor, 0.22 * fx));
      borderGlow.addColorStop(0.5, rgba(tintColor, 0.12 * fx));
      borderGlow.addColorStop(1, rgba(baseColor, 0.2 * fx));
      context.strokeStyle = borderGlow;
      context.lineWidth = 1.2;
      context.strokeRect(0.6, 0.6, width - 1.2, height - 1.2);
      context.restore();

      rafId = window.requestAnimationFrame(draw);
    };

    rafId = window.requestAnimationFrame(draw);

    return () => {
      window.cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      context.clearRect(0, 0, width, height);
    };
  }, [accentColor, enabled, intensity, mode, noiseTile, seed]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 3,
        opacity: enabled ? 1 : 0,
        transition: 'opacity 220ms ease',
      }}
    />
  );
}

