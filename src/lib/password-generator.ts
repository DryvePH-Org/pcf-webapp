// Readable characters only (no 0/O, 1/l/I), so the password can be read out or typed.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

// A strong password in two readable halves, for example "Kd7mQpa-X4nTvze". Uses the browser's secure random numbers.
export function generatePassword() {
  const bytes = new Uint32Array(14);
  crypto.getRandomValues(bytes);
  const chars = Array.from(bytes, (n) => ALPHABET[n % ALPHABET.length]);
  return `${chars.slice(0, 7).join("")}-${chars.slice(7).join("")}`;
}
