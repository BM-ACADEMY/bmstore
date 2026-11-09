/** Swatch colours for common saree/textile colour names (English and Tamil). Unknown names fall back to a chip. */
const MAP: Record<string, string> = {
  maroon: '#7a1f2b', arakku: '#7a1f2b', red: '#c8102e', kumkum: '#c8102e', சிவப்பு: '#c8102e', green: '#1f6f43', 'bottle green': '#0f4c35', பச்சை: '#1f6f43',
  blue: '#1f3a93', 'peacock blue': '#0e6e8c', navy: '#1b2a5a', நீலம்: '#1f3a93', yellow: '#e8b920', mustard: '#d4a017', mango: '#f2a900', மஞ்சள்: '#e8b920',
  pink: '#e2618f', blush: '#e8a6b8', rose: '#d4647a', magenta: '#b5176f', purple: '#5b2a86', violet: '#6b3fa0', orange: '#e2731b', saffron: '#f4a300',
  cream: '#f3e9d2', ivory: '#f7f1e3', white: '#ffffff', வெள்ளை: '#ffffff', black: '#1a1a1a', கருப்பு: '#1a1a1a', grey: '#8a8a8a', gray: '#8a8a8a', silver: '#c0c0c0', gold: '#c9973b', beige: '#d8c3a5', brown: '#6b4226', peach: '#f5b89a', teal: '#0f766e', 'sea green': '#2e8b7a', lavender: '#b39ddb', wine: '#5e1a2e', onion: '#c96f8a', 'onion pink': '#c96f8a', turquoise: '#30b0c7', coral: '#f07167', olive: '#6b7a2a', copper: '#b87333', rust: '#b7410e', sandal: '#e5c8a6', 'off white': '#f4efe6', coffee: '#4b3621', 'rose gold': '#b76e79', 'antique gold': '#a67c2e', antique: '#a67c2e', oxidised: '#5a5a5a', oxidized: '#5a5a5a', platinum: '#d9d9d6', bronze: '#8c6a3f', 'matte gold': '#c7a462', ஜிமிக்கி: '#c9973b', lime: '#a3c42d', 'sky blue': '#87ceeb', 'royal blue': '#2b4fd6', 'parrot green': '#5fb72f',
};
export function swatchColour(value: string): string | null {
  const v = value.trim().toLowerCase();
  if (MAP[v]) return MAP[v];
  for (const k of Object.keys(MAP).sort((a, b) => b.length - a.length)) if (v.includes(k)) return MAP[k];
  return null;
}
