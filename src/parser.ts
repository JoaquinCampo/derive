// Recursive descent parser for mathematical expressions.
// Converts a string like "2*x^2 + sin(x)" into an Expr AST.

import { Expr, num, v, add, sub, mul, div, pow, neg, fn } from './expr'

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

export class ParseError extends Error {
  constructor(
    message: string,
    public pos: number,
    public input: string,
  ) {
    super(`Parse error at position ${pos}: ${message}`)
    this.name = 'ParseError'
  }
}

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

type Token =
  | { type: 'number'; value: number; pos: number }
  | { type: 'ident'; name: string; pos: number }
  | { type: 'op'; op: string; pos: number }
  | { type: 'lparen'; pos: number }
  | { type: 'rparen'; pos: number }
  | { type: 'comma'; pos: number }

const KNOWN_FUNCTIONS = new Set([
  'sin', 'cos', 'tan', 'ln', 'log', 'sqrt', 'abs', 'exp',
])

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

function tokenize(input: string): Token[] {
  const tokens: Token[] = []
  let i = 0

  while (i < input.length) {
    // Skip whitespace
    if (input[i] === ' ' || input[i] === '\t') {
      i++
      continue
    }

    // Numbers: integer or float, including leading dot like .5
    if (isDigit(input[i]) || (input[i] === '.' && i + 1 < input.length && isDigit(input[i + 1]))) {
      const start = i
      // Integer part
      while (i < input.length && isDigit(input[i])) i++
      // Fractional part
      if (i < input.length && input[i] === '.' && (i + 1 >= input.length || input[i + 1] !== '.')) {
        i++ // consume dot
        while (i < input.length && isDigit(input[i])) i++
      }
      tokens.push({ type: 'number', value: parseFloat(input.slice(start, i)), pos: start })
      continue
    }

    // Identifiers (variable names or function names)
    if (isAlpha(input[i])) {
      const start = i
      while (i < input.length && isAlphaNum(input[i])) i++
      tokens.push({ type: 'ident', name: input.slice(start, i), pos: start })
      continue
    }

    // Operators
    if ('+-*/^'.includes(input[i])) {
      tokens.push({ type: 'op', op: input[i], pos: i })
      i++
      continue
    }

    // Parentheses
    if (input[i] === '(') {
      tokens.push({ type: 'lparen', pos: i })
      i++
      continue
    }
    if (input[i] === ')') {
      tokens.push({ type: 'rparen', pos: i })
      i++
      continue
    }

    // Comma
    if (input[i] === ',') {
      tokens.push({ type: 'comma', pos: i })
      i++
      continue
    }

    throw new ParseError(`Unexpected character '${input[i]}'`, i, input)
  }

  return tokens
}

function isDigit(ch: string): boolean {
  return ch >= '0' && ch <= '9'
}

function isAlpha(ch: string): boolean {
  return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_'
}

function isAlphaNum(ch: string): boolean {
  return isAlpha(ch) || isDigit(ch)
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------
// Precedence (lowest → highest):
//   1. additive:  +, -
//   2. multiplicative:  *, /
//   3. implicit multiplication:  2x, 2(x+1)
//   4. unary:  -x
//   5. exponentiation:  ^ (right-associative)
//   6. atoms:  numbers, variables, function calls, parenthesized exprs

class Parser {
  private tokens: Token[]
  private pos = 0

  constructor(
    tokens: Token[],
    private input: string,
  ) {
    this.tokens = tokens
  }

  // --- Helpers ---

  private peek(): Token | undefined {
    return this.tokens[this.pos]
  }

  private advance(): Token {
    return this.tokens[this.pos++]
  }

  private expect(type: string, label?: string): Token {
    const tok = this.peek()
    if (!tok) {
      throw new ParseError(
        `Expected ${label ?? type} but reached end of input`,
        this.input.length,
        this.input,
      )
    }
    if (tok.type !== type) {
      throw new ParseError(
        `Expected ${label ?? type} but got '${tokenLabel(tok)}'`,
        tok.pos,
        this.input,
      )
    }
    return this.advance()
  }

  // --- Grammar rules ---

  /** Top-level: parse full expression, then ensure nothing is left over. */
  parse(): Expr {
    if (this.tokens.length === 0) {
      throw new ParseError('Empty expression', 0, this.input)
    }
    const expr = this.additive()
    if (this.pos < this.tokens.length) {
      const tok = this.peek()!
      throw new ParseError(`Unexpected token '${tokenLabel(tok)}'`, tok.pos, this.input)
    }
    return expr
  }

  /** additive = multiplicative (('+' | '-') multiplicative)* */
  private additive(): Expr {
    let left = this.multiplicative()
    while (this.isOp('+') || this.isOp('-')) {
      const op = this.advance() as Token & { op: string }
      const right = this.multiplicative()
      left = op.op === '+' ? add(left, right) : sub(left, right)
    }
    return left
  }

  /** multiplicative = implicitMul (('*' | '/') implicitMul)* */
  private multiplicative(): Expr {
    let left = this.implicitMul()
    while (this.isOp('*') || this.isOp('/')) {
      const op = this.advance() as Token & { op: string }
      const right = this.implicitMul()
      left = op.op === '*' ? mul(left, right) : div(left, right)
    }
    return left
  }

  /**
   * Implicit multiplication: handles cases like `2x`, `3sin(x)`, `2(x+1)`.
   * Triggers when a unary expression is immediately followed by:
   *   - a number (rare, e.g. in sub-expressions)
   *   - an identifier
   *   - an opening parenthesis
   * but NOT by an operator, closing paren, comma, or end of input.
   */
  private implicitMul(): Expr {
    let left = this.unary()
    while (this.canStartImplicitMul()) {
      const right = this.unary()
      left = mul(left, right)
    }
    return left
  }

  /** Can the next token begin an implicit multiplication factor? */
  private canStartImplicitMul(): boolean {
    const tok = this.peek()
    if (!tok) return false
    return tok.type === 'number' || tok.type === 'ident' || tok.type === 'lparen'
  }

  /** unary = '-' unary | exponentiation */
  private unary(): Expr {
    if (this.isOp('-')) {
      this.advance()
      const expr = this.unary()
      return neg(expr)
    }
    // Unary + is a no-op
    if (this.isOp('+')) {
      this.advance()
      return this.unary()
    }
    return this.exponentiation()
  }

  /** exponentiation = atom ('^' unary)? — right-associative */
  private exponentiation(): Expr {
    const base = this.atom()
    if (this.isOp('^')) {
      this.advance()
      // Right-associative: parse the exponent as a unary (which recurses into exponentiation)
      const exponent = this.unary()
      return pow(base, exponent)
    }
    return base
  }

  /**
   * atom = NUMBER
   *      | IDENT '(' expr ')'   — function call
   *      | IDENT                 — variable
   *      | '(' expr ')'
   */
  private atom(): Expr {
    const tok = this.peek()

    if (!tok) {
      throw new ParseError('Unexpected end of input', this.input.length, this.input)
    }

    // Number literal
    if (tok.type === 'number') {
      this.advance()
      return num(tok.value)
    }

    // Identifier: could be a function call or a variable
    if (tok.type === 'ident') {
      this.advance()
      const name = tok.name

      // Function call: ident followed by '('
      if (KNOWN_FUNCTIONS.has(name) && this.peek()?.type === 'lparen') {
        this.advance() // consume '('
        const arg = this.additive()
        this.expect('rparen', "')'")
        return fn(name, arg)
      }

      // Variable
      return v(name)
    }

    // Parenthesized expression
    if (tok.type === 'lparen') {
      this.advance()
      const expr = this.additive()
      this.expect('rparen', "')'")
      return expr
    }

    throw new ParseError(`Unexpected token '${tokenLabel(tok)}'`, tok.pos, this.input)
  }

  // --- Utilities ---

  private isOp(op: string): boolean {
    const tok = this.peek()
    return tok?.type === 'op' && tok.op === op
  }
}

/** Human-readable label for a token (used in error messages). */
function tokenLabel(tok: Token): string {
  switch (tok.type) {
    case 'number': return String(tok.value)
    case 'ident': return tok.name
    case 'op': return tok.op
    case 'lparen': return '('
    case 'rparen': return ')'
    case 'comma': return ','
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Parse a math expression string into an Expr AST. */
export function parse(input: string): Expr {
  const tokens = tokenize(input)
  const parser = new Parser(tokens, input)
  return parser.parse()
}
