export function stringToColor(input: string): string {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = input.charCodeAt(index) + ((hash << 5) - hash);
  }

  const hue = Math.abs(hash) % 360;
  const saturation = 52 + (Math.abs(hash >> 3) % 16);
  const lightness = 58 + (Math.abs(hash >> 5) % 12);
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}
