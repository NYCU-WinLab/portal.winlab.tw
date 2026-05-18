// Typing passages, grouped by language. Each language is a "level" in
// game_scores so each one keeps its own leaderboard (English vs 繁中 vs … are
// not directly comparable — different units, different keyboards).

export interface TypingLanguage {
  id: number
  label: string
  code: "en" | "zh-Hant" | "de" | "fr" | "it" | "es"
  passages: string[]
}

export const TYPING_LANGUAGES: TypingLanguage[] = [
  {
    id: 0,
    label: "English",
    code: "en",
    passages: [
      "The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs. How vexingly quick daft zebras jump.",
      "Programming is the art of telling another human what one wants the computer to do. Clean code always looks like it was written by someone who cares.",
      "Science is not only a disciple of reason but also one of romance and passion. The universe is under no obligation to make sense to you.",
    ],
  },
  {
    id: 1,
    label: "繁體中文",
    code: "zh-Hant",
    passages: [
      "千里之行，始於足下。九層之台，起於累土。天行健，君子以自強不息。",
      "學而時習之，不亦說乎。有朋自遠方來，不亦樂乎。人不知而不慍，不亦君子乎。",
      "海內存知己，天涯若比鄰。無為在歧路，兒女共沾巾。莫愁前路無知己，天下誰人不識君。",
    ],
  },
  {
    id: 2,
    label: "Deutsch",
    code: "de",
    passages: [
      "Der frühe Vogel fängt den Wurm, doch der zweite bekommt den Käse. Wer rastet, der rostet.",
      "Wer den Pfennig nicht ehrt, ist des Talers nicht wert. Übung macht den Meister, sagt das Sprichwort.",
      "Geteiltes Leid ist halbes Leid, geteilte Freude ist doppelte Freude. Was Hänschen nicht lernt, lernt Hans nimmermehr.",
    ],
  },
  {
    id: 3,
    label: "Français",
    code: "fr",
    passages: [
      "Un voyage de mille lieues commence toujours par un premier pas, dit le proverbe le plus connu.",
      "Tous pour un, un pour tous, voilà notre devise. L'union fait la force, telle est notre conviction.",
      "Bien faire et laisser dire, voilà la sagesse la plus simple du monde. À cœur vaillant rien d'impossible.",
    ],
  },
  {
    id: 4,
    label: "Italiano",
    code: "it",
    passages: [
      "Chi va piano va sano e va lontano, dice un antico proverbio italiano molto saggio.",
      "Ogni medaglia ha il suo rovescio, e ogni successo nasconde una caduta. La fortuna aiuta gli audaci.",
      "Tra il dire e il fare c'è di mezzo il mare, ricordatelo sempre. Chi cerca trova, chi domanda intende.",
    ],
  },
  {
    id: 5,
    label: "Español",
    code: "es",
    passages: [
      "El que persevera alcanza, y quien madruga encuentra el camino abierto al éxito.",
      "Más vale tarde que nunca, pero también vale más nunca tarde, dice el refrán antiguo.",
      "Camarón que se duerme se lo lleva la corriente. No por mucho madrugar amanece más temprano.",
    ],
  },
]

export function getTypingLanguage(id: number): TypingLanguage {
  return TYPING_LANGUAGES[id] ?? TYPING_LANGUAGES[0]!
}

// Used to compute WPM. English/European languages use whitespace-separated
// words; Chinese counts CJK characters since it has no word boundaries.
export function countUnits(text: string, code: TypingLanguage["code"]): number {
  if (code === "zh-Hant") {
    return [...text].filter((ch) => /[一-鿿]/.test(ch)).length
  }
  return text.trim().split(/\s+/).length
}
