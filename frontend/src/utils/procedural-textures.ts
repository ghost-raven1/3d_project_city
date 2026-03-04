import { CanvasTexture, RepeatWrapping } from 'three';
import { CityPalette } from './city-dna';

function createRng(seed: number): () => number {
  let state = seed | 0;

  return () => {
    state = (state * 1664525 + 1013904223) | 0;
    return (state >>> 0) / 4294967296;
  };
}

function hexToRgba(hex: string, alpha: number): string {
  const value = hex.replace('#', '').trim();
  const full = value.length === 3 ? value.split('').map((part) => `${part}${part}`).join('') : value;
  const r = Number.parseInt(full.slice(0, 2), 16);
  const g = Number.parseInt(full.slice(2, 4), 16);
  const b = Number.parseInt(full.slice(4, 6), 16);

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function createRoadTexture(seed: number, accent: string): CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    const fallback = new CanvasTexture(canvas);
    fallback.wrapS = RepeatWrapping;
    fallback.wrapT = RepeatWrapping;
    fallback.repeat.set(8, 2);
    return fallback;
  }

  const rng = createRng(seed);

  const gradient = ctx.createLinearGradient(0, 0, 0, size);
  gradient.addColorStop(0, '#dce8f7');
  gradient.addColorStop(0.5, '#d2e1f4');
  gradient.addColorStop(1, '#cadbf1');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  for (let index = 0; index < 1800; index += 1) {
    const x = rng() * size;
    const y = rng() * size;
    const w = 0.8 + rng() * 1.8;
    const opacity = 0.015 + rng() * 0.024;
    ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
    ctx.fillRect(x, y, w, w);
  }

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
  ctx.lineWidth = 2;
  for (let index = 0; index < 22; index += 1) {
    const y = (index / 22) * size;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y + (rng() - 0.5) * 2);
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
  ctx.lineWidth = 4;
  for (let y = 10; y < size; y += 34) {
    ctx.beginPath();
    ctx.moveTo(size * 0.48, y);
    ctx.lineTo(size * 0.52, y + 16);
    ctx.stroke();
  }

  ctx.strokeStyle = hexToRgba(accent, 0.22);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(size * 0.04, size * 0.12);
  ctx.lineTo(size * 0.04, size * 0.88);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(size * 0.96, size * 0.12);
  ctx.lineTo(size * 0.96, size * 0.88);
  ctx.stroke();

  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(8, 2);
  texture.needsUpdate = true;
  return texture;
}

export function createTerrainTexture(seed: number, palette: CityPalette): CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    const fallback = new CanvasTexture(canvas);
    fallback.wrapS = RepeatWrapping;
    fallback.wrapT = RepeatWrapping;
    fallback.repeat.set(6, 6);
    return fallback;
  }

  const rng = createRng(seed * 7 + 17);

  const gradient = ctx.createRadialGradient(
    size * 0.48,
    size * 0.46,
    size * 0.08,
    size * 0.5,
    size * 0.5,
    size * 0.58,
  );
  gradient.addColorStop(0, '#edf6ff');
  gradient.addColorStop(1, '#dceaf9');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = hexToRgba(palette.gridCell, 0.14);
  ctx.lineWidth = 1;
  for (let step = 0; step < size; step += 16) {
    ctx.beginPath();
    ctx.moveTo(0, step);
    ctx.lineTo(size, step);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(step, 0);
    ctx.lineTo(step, size);
    ctx.stroke();
  }

  for (let index = 0; index < 2400; index += 1) {
    const x = rng() * size;
    const y = rng() * size;
    const radius = 0.3 + rng() * 1.6;
    const alpha = 0.015 + rng() * 0.03;
    ctx.fillStyle = `rgba(194, 218, 246, ${alpha})`;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = hexToRgba(palette.accent, 0.09);
  ctx.lineWidth = 2;
  for (let index = 0; index < 22; index += 1) {
    const startX = rng() * size;
    const startY = rng() * size;
    const endX = startX + (rng() - 0.5) * 120;
    const endY = startY + (rng() - 0.5) * 120;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();
  }

  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(6, 6);
  texture.needsUpdate = true;
  return texture;
}
