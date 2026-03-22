type PersonalityLike = {
  key: string;
  label: string;
};

const PERSONALITY_LABELS_ES_BY_KEY: Record<string, string> = {
  chaotic: "Caótica",
  cozy: "Acogedora",
  cryptid: "Críptida",
  egg: "Huevo",
  hype: "Hype Beast",
  noir: "Noir",
  philosopher: "Filósofa",
};

export function getSiteMochiPersonalityDisplayLabel(
  personality: PersonalityLike | null | undefined,
  isSpanish: boolean,
) {
  if (!personality) return "";
  if (!isSpanish) return personality.label;
  return PERSONALITY_LABELS_ES_BY_KEY[personality.key] || personality.label;
}
