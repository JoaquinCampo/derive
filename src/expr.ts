// Expression AST — the core data structure.
// Every mathematical expression is a tree of these nodes.

export type Expr =
  | { tag: 'num'; value: number }
  | { tag: 'var'; name: string }
  | { tag: 'add'; left: Expr; right: Expr }
  | { tag: 'sub'; left: Expr; right: Expr }
  | { tag: 'mul'; left: Expr; right: Expr }
  | { tag: 'div'; left: Expr; right: Expr }
  | { tag: 'pow'; base: Expr; exp: Expr }
  | { tag: 'neg'; expr: Expr }
  | { tag: 'fn'; name: string; arg: Expr }

// Constructors — shorter than writing object literals everywhere

export const num = (value: number): Expr => ({ tag: 'num', value })
export const v = (name: string): Expr => ({ tag: 'var', name })
export const add = (left: Expr, right: Expr): Expr => ({ tag: 'add', left, right })
export const sub = (left: Expr, right: Expr): Expr => ({ tag: 'sub', left, right })
export const mul = (left: Expr, right: Expr): Expr => ({ tag: 'mul', left, right })
export const div = (left: Expr, right: Expr): Expr => ({ tag: 'div', left, right })
export const pow = (base: Expr, exp: Expr): Expr => ({ tag: 'pow', base, exp })
export const neg = (expr: Expr): Expr => ({ tag: 'neg', expr })
export const fn = (name: string, arg: Expr): Expr => ({ tag: 'fn', name, arg })

// Structural equality
export function equal(a: Expr, b: Expr): boolean {
  if (a.tag !== b.tag) return false
  switch (a.tag) {
    case 'num': return a.value === (b as typeof a).value
    case 'var': return a.name === (b as typeof a).name
    case 'add': case 'sub': case 'mul': case 'div': {
      const bb = b as typeof a
      return equal(a.left, bb.left) && equal(a.right, bb.right)
    }
    case 'pow': {
      const bb = b as typeof a
      return equal(a.base, bb.base) && equal(a.exp, bb.exp)
    }
    case 'neg': return equal(a.expr, (b as typeof a).expr)
    case 'fn': {
      const bb = b as typeof a
      return a.name === bb.name && equal(a.arg, bb.arg)
    }
  }
}

// Check if an expression contains a variable
export function containsVar(expr: Expr, varName: string): boolean {
  switch (expr.tag) {
    case 'num': return false
    case 'var': return expr.name === varName
    case 'add': case 'sub': case 'mul': case 'div':
      return containsVar(expr.left, varName) || containsVar(expr.right, varName)
    case 'pow':
      return containsVar(expr.base, varName) || containsVar(expr.exp, varName)
    case 'neg': return containsVar(expr.expr, varName)
    case 'fn': return containsVar(expr.arg, varName)
  }
}

// Check if an expression is a constant (no variables)
export function isConstant(expr: Expr): boolean {
  switch (expr.tag) {
    case 'num': return true
    case 'var': return false
    case 'add': case 'sub': case 'mul': case 'div':
      return isConstant(expr.left) && isConstant(expr.right)
    case 'pow':
      return isConstant(expr.base) && isConstant(expr.exp)
    case 'neg': return isConstant(expr.expr)
    case 'fn': return isConstant(expr.arg)
  }
}
