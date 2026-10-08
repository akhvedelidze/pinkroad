export function normalizeAnswer(answer: string): string {
  return answer.normalize('NFC').trim().replace(/\s+/g, ' ')
}

export function createSalt(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** SHA-256 of salt and answer. The answer itself is not recoverable from the hash. */
export async function hashAnswer(answer: string, salt: string): Promise<string> {
  const encoded = new TextEncoder().encode(`${salt}\n${normalizeAnswer(answer)}`)
  const digest = await crypto.subtle.digest('SHA-256', encoded)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}
