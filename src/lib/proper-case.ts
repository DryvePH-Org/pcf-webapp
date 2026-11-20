// Tidy capitalization for what is written into a Google Sheet, because people type "juan dela cruz", "GAS FOR VAN"
// or "grab to makati". Text that already has careful mixed capitals (McDonald's, iPhone) is left alone.

const SMALL_WORDS = new Set(["a", "an", "and", "as", "at", "by", "de", "del", "dela", "for", "in", "of", "on", "or", "the", "to", "via", "y"]);
const KEEP_UPPER = new Set(["PH", "PCF", "PCV", "TIN", "VAT", "ID", "LBC", "SM", "NBI", "SSS", "BIR", "LTO", "ATM", "GCash".toUpperCase(), "II", "III", "IV", "VI", "VII", "VIII", "IX"]);

const hasLetters = (value: string) => /\p{L}/u.test(value);
const isAllLower = (value: string) => hasLetters(value) && value === value.toLowerCase();
const isAllUpper = (value: string) => hasLetters(value) && value === value.toUpperCase();
const upFirst = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

// "o'brien" -> "O'Brien", "ana-maria" -> "Ana-Maria"
function capitalizeWord(word: string): string {
  return word
    .split(/([-'’/])/)
    .map((part, index, parts) => {
      if (index % 2 === 1 || !part) return part;
      // the s in "McDonald's" or the t in "don't" stays small
      const afterApostrophe = index > 0 && /['’]/.test(parts[index - 1]);
      return afterApostrophe && part.length <= 2 ? part.toLowerCase() : upFirst(part.toLowerCase());
    })
    .join("");
}

function isCareful(word: string): boolean {
  // a capital that is not the first letter, together with lowercase letters: McDonald's, iPhone, JuanCarlos
  return /\p{Ll}/u.test(word) && /\p{Lu}/u.test(word.slice(1));
}

/** Names, departments, suppliers: every word capitalized, small joining words kept lower after the first. */
export function titleCase(input: string): string {
  const value = input.replace(/\s+/g, " ").trim();
  if (!value) return value;
  const shouting = isAllUpper(value);
  let seen = 0;
  return value
    .split(" ")
    .map((token) => {
      const index = seen++;
      const core = token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
      if (!core || /\d/.test(core) || isCareful(core)) return token;
      const bare = core.replace(/\./g, "");
      // short capitals are usually initials or acronyms (SM, LBC, J.R.) unless the whole text was shouted
      if (isAllUpper(core) && (KEEP_UPPER.has(bare) || (!shouting && core.length <= 4) || /^(\p{Lu}\.)+\p{Lu}?\.?$/u.test(core))) return token;
      if (shouting && core.length <= 2 && !/\./.test(core) && !KEEP_UPPER.has(bare)) {
        return token.replace(core, SMALL_WORDS.has(core.toLowerCase()) && index > 0 ? core.toLowerCase() : capitalizeWord(core));
      }
      const lowered = core.toLowerCase();
      const fixed = SMALL_WORDS.has(lowered) && index > 0 ? lowered : capitalizeWord(core);
      return token.replace(core, fixed);
    })
    .join(" ");
}

/** Descriptions: a capital at the start of each sentence; text typed all in lowercase or all in capitals is calmed down. */
export function sentenceCase(input: string): string {
  const value = input.replace(/\s+/g, " ").trim();
  if (!value) return value;
  const shouting = isAllUpper(value);
  const calm = shouting || isAllLower(value);
  const words = value.split(" ").map((token) => {
    const core = token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
    if (!core || /\d/.test(core) || isCareful(core)) return token;
    if (isAllUpper(core) && (KEEP_UPPER.has(core.replace(/\./g, "")) || (!shouting && core.length > 1))) return token;
    if (shouting && core.length <= 3 && KEEP_UPPER.has(core)) return token;
    return calm ? token.replace(core, core.toLowerCase()) : token;
  });
  let startOfSentence = true;
  return words
    .map((token) => {
      const out = startOfSentence ? token.replace(/\p{L}/u, (letter) => letter.toUpperCase()) : token;
      startOfSentence = /[.!?]$/.test(token);
      return out;
    })
    .join(" ");
}

/** Vehicle plates are written in capitals. */
export function plateCase(input: string): string {
  return input.replace(/\s+/g, " ").trim().toUpperCase();
}
