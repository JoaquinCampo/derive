// Pretty-printer for expressions.
// Converts Expr AST to readable strings with minimal parentheses.

import { Expr } from './expr'

// Operator precedence levels
const enum Prec {
  Add = 1,  // +, -
  Mul = 2,  // *, /
  Neg = 3,  // unary -
  Pow = 4,  // ^
  Atom = 5, // numbers, variables, function calls
}

const SUPERSCRIPTS = '⁰¹²³⁴⁵⁶⁷⁸⁹'

function superscript(n: number): string {
  return String(n).split('').map(ch => SUPERSCRIPTS[+ch]).join('')
}

function isSmallInt(e: Expr): e is { tag: 'num'; value: number } {
  return e.tag === 'num' && Number.isInteger(e.value) && e.value >= 0 && e.value <= 9
}

// Check if mul should use implicit notation (no · operator)
// e.g. 2x, 2sin(x), xy — but not 2·3 or (x+1)y without parens
function isImplicitMul(left: Expr, right: Expr): boolean {
  // num * var: 2x
  if (left.tag === 'num' && right.tag === 'var') return true
  // num * fn: 2sin(x)
  if (left.tag === 'num' && right.tag === 'fn') return true
  // var * var: xy
  if (left.tag === 'var' && right.tag === 'var') return true
  // num * pow(var, ...): 2x²
  if (left.tag === 'num' && right.tag === 'pow' && right.base.tag === 'var') return true
  // var * pow: x·x² — keep explicit for clarity
  return false
}

// ANSI color codes
const C = {
  cyan:    '\x1b[36m',
  yellow:  '\x1b[33m',
  white:   '\x1b[37m',
  magenta: '\x1b[35m',
  reset:   '\x1b[0m',
}

type Colorizer = {
  num: (s: string) => string
  var_: (s: string) => string
  op: (s: string) => string
  fn_: (s: string) => string
}

const plain: Colorizer = {
  num: s => s,
  var_: s => s,
  op: s => s,
  fn_: s => s,
}

const colored: Colorizer = {
  num: s => `${C.cyan}${s}${C.reset}`,
  var_: s => `${C.yellow}${s}${C.reset}`,
  op: s => `${C.white}${s}${C.reset}`,
  fn_: s => `${C.magenta}${s}${C.reset}`,
}

function wrap(s: string, needsParens: boolean, c: Colorizer): string {
  return needsParens ? `${c.op('(')}${s}${c.op(')')}` : s
}

function precOf(e: Expr): Prec {
  switch (e.tag) {
    case 'num': case 'var': case 'fn': return Prec.Atom
    case 'add': case 'sub': return Prec.Add
    case 'mul': case 'div': return Prec.Mul
    case 'neg': return Prec.Neg
    case 'pow': return Prec.Pow
  }
}

function fmt(e: Expr, parentPrec: Prec, isRight: boolean, c: Colorizer): string {
  const s = fmtInner(e, c)
  const myPrec = precOf(e)

  // Decide if we need parentheses
  let needsParens = false
  if (myPrec < parentPrec) {
    needsParens = true
  } else if (myPrec === parentPrec && isRight) {
    // Right-associativity matters for sub and div:
    // a - (b - c) needs parens, a - (b + c) also needs parens
    if (e.tag === 'add' || e.tag === 'sub') needsParens = true
    if (e.tag === 'mul' || e.tag === 'div') needsParens = true
  }

  return wrap(s, needsParens, c)
}

function fmtInner(e: Expr, c: Colorizer): string {
  switch (e.tag) {
    case 'num': {
      const s = e.value < 0 ? `${e.value}` : `${e.value}`
      return c.num(s)
    }

    case 'var':
      return c.var_(e.name)

    case 'add':
      return `${fmt(e.left, Prec.Add, false, c)} ${c.op('+')} ${fmt(e.right, Prec.Add, true, c)}`

    case 'sub':
      return `${fmt(e.left, Prec.Add, false, c)} ${c.op('-')} ${fmt(e.right, Prec.Add, true, c)}`

    case 'mul': {
      if (isImplicitMul(e.left, e.right)) {
        // No operator, no space: 2x, xy
        return `${fmt(e.left, Prec.Mul, false, c)}${fmt(e.right, Prec.Mul, true, c)}`
      }
      return `${fmt(e.left, Prec.Mul, false, c)} ${c.op('·')} ${fmt(e.right, Prec.Mul, true, c)}`
    }

    case 'div':
      return `${fmt(e.left, Prec.Mul, false, c)} ${c.op('/')} ${fmt(e.right, Prec.Mul, true, c)}`

    case 'pow': {
      const base = fmt(e.base, Prec.Pow, false, c)
      if (isSmallInt(e.exp)) {
        return `${base}${c.op(superscript(e.exp.value))}`
      }
      // Complex exponent: use caret with parens around the exponent
      const exp = fmtInner(e.exp, c)
      return `${base}${c.op('^')}${c.op('(')}${exp}${c.op(')')}`
    }

    case 'neg': {
      const inner = fmt(e.expr, Prec.Neg, false, c)
      return `${c.op('-')}${inner}`
    }

    case 'fn': {
      const arg = fmtInner(e.arg, c)
      return `${c.fn_(e.name)}${c.op('(')}${arg}${c.op(')')}`
    }
  }
}

/** Convert an expression to a readable string with minimal parentheses. */
export function format(expr: Expr): string {
  return fmtInner(expr, plain)
}

/** Convert an expression to an ANSI-colored string. */
export function formatColored(expr: Expr): string {
  return fmtInner(expr, colored)
}
