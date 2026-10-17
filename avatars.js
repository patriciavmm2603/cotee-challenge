// Original flat-vector character presets for Cotee Challenge.
// 12 characters, men and women across ages, drawn in code (no stock art).
const AVATARS = [
  { skin: "#f1c9a5", hair: "long",  hairColor: "#4a3226", shirt: "#1E7A78" },
  { skin: "#6b4226", hair: "short", hairColor: "#1d1d1d", shirt: "#D98F3C" },
  { skin: "#f1c9a5", hair: "bun",   hairColor: "#c9c9c9", shirt: "#3E9B5F" },
  { skin: "#e8b88a", hair: "bald",  hairColor: "#000000", shirt: "#1E7A78" },
  { skin: "#6b4226", hair: "curly", hairColor: "#1d1d1d", shirt: "#D98F3C" },
  { skin: "#c98e5f", hair: "short", hairColor: "#b5b5b5", shirt: "#1E7A78" },
  { skin: "#c98e5f", hair: "long",  hairColor: "#5a3a22", shirt: "#3E9B5F" },
  { skin: "#f1c9a5", hair: "short", hairColor: "#6e4a2f", shirt: "#3E9B5F" },
  { skin: "#e8b88a", hair: "short", hairColor: "#e8e8e8", shirt: "#D98F3C" },
  { skin: "#6b4226", hair: "short", hairColor: "#9a9a9a", shirt: "#1E7A78" },
  { skin: "#5a3a22", hair: "long",  hairColor: "#141414", shirt: "#1E7A78" },
  { skin: "#c98e5f", hair: "curly", hairColor: "#2b2b2b", shirt: "#D98F3C" }
];

function avatarSVG(p, size) {
  size = size || 96;
  const hc = p.hairColor;
  let hair = "";
  if (p.hair === "short" || p.hair === "long" || p.hair === "bun") {
    hair += '<path d="M27 45 C27 28 36 22 50 22 C64 22 73 28 73 45 C70 36 64 33 50 33 C36 33 30 36 27 45 Z" fill="' + hc + '"/>';
  }
  if (p.hair === "long") {
    hair += '<rect x="24" y="40" width="10" height="36" rx="5" fill="' + hc + '"/>'
          + '<rect x="66" y="40" width="10" height="36" rx="5" fill="' + hc + '"/>';
  }
  if (p.hair === "bun") {
    hair += '<circle cx="50" cy="17" r="9" fill="' + hc + '"/>';
  }
  if (p.hair === "curly") {
    hair += '<circle cx="32" cy="30" r="10" fill="' + hc + '"/>'
          + '<circle cx="50" cy="24" r="11" fill="' + hc + '"/>'
          + '<circle cx="68" cy="30" r="10" fill="' + hc + '"/>';
  }
  return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Character">'
    + '<rect x="20" y="68" width="60" height="32" rx="16" fill="' + p.shirt + '"/>'
    + '<rect x="43" y="56" width="14" height="18" rx="7" fill="' + p.skin + '"/>'
    + '<circle cx="50" cy="44" r="24" fill="' + p.skin + '"/>'
    + hair
    + '<circle cx="41" cy="44" r="2.6" fill="#2b2b2b"/>'
    + '<circle cx="59" cy="44" r="2.6" fill="#2b2b2b"/>'
    + '<path d="M42 54 Q50 60 58 54" stroke="#2b2b2b" stroke-width="2.5" fill="none" stroke-linecap="round"/>'
    + '</svg>';
}

function avatarFor(id, size) {
  const p = AVATARS[Number(id) % AVATARS.length] || AVATARS[0];
  return avatarSVG(p, size);
}

// Character creator: mix-and-match parts (the presets above are just prefilled combos).
const SKIN_TONES = ["#f1c9a5", "#e8b88a", "#c98e5f", "#6b4226", "#5a3a22"];
const HAIR_STYLES = ["short", "long", "bun", "curly", "bald"];
const HAIR_COLORS = ["#1d1d1d", "#4a3226", "#6e4a2f", "#8a4b2a", "#b5b5b5", "#e8e8e8"];
const SHIRT_COLORS = ["#1E7A78", "#D98F3C", "#3E9B5F", "#0D3B40", "#7A3B8F", "#C9A227"];

function blankCharacter() {
  return { skin: SKIN_TONES[0], hair: HAIR_STYLES[0], hairColor: HAIR_COLORS[0], shirt: SHIRT_COLORS[0] };
}
