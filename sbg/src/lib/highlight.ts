export type TokenKind = 'key' | 'string' | 'number' | 'literal' | 'plain'

export interface Token {
  text: string
  kind: TokenKind
}

const PATTERN =
  /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g

/** 极简 JSON 词法着色，替代 shiki / Monaco（后者动辄 1MB 以上） */
export function tokenizeJson(source: string): Token[] {
  const tokens: Token[] = []
  let cursor = 0
  let match: RegExpExecArray | null
  PATTERN.lastIndex = 0

  while ((match = PATTERN.exec(source)) !== null) {
    if (match.index > cursor) {
      tokens.push({ text: source.slice(cursor, match.index), kind: 'plain' })
    }
    if (match[1] !== undefined) {
      tokens.push({ text: match[1], kind: match[2] ? 'key' : 'string' })
      if (match[2]) tokens.push({ text: match[2], kind: 'plain' })
    } else if (match[3] !== undefined) {
      tokens.push({ text: match[3], kind: 'literal' })
    } else if (match[4] !== undefined) {
      tokens.push({ text: match[4], kind: 'number' })
    }
    cursor = match.index + match[0].length
  }

  if (cursor < source.length) tokens.push({ text: source.slice(cursor), kind: 'plain' })
  return tokens
}
