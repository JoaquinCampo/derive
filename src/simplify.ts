// Expression simplifier — algebraic simplification applied bottom-up.

import { Expr, equal, num, mul, sub, neg } from './expr'

// Helper: check if expr is num with a specific value
function isNum(e: Expr, val: number): boolean {
  return e.tag === 'num' && e.value === val
}

// Extract coefficient and base from a term: 3*x → [3, x], x → [1, x]
function extractCoeff(e: Expr): [number, Expr] {
  if (e.tag === 'mul' && e.left.tag === 'num') return [e.left.value, e.right]
  if (e.tag === 'mul' && e.right.tag === 'num') return [e.right.value, e.left]
  if (e.tag === 'neg') {
    const [c, base] = extractCoeff(e.expr)
    return [-c, base]
  }
  return [1, e]
}

// Single bottom-up simplification pass
function simplifyOnce(expr: Expr): Expr {
  // First, recurse into children
  switch (expr.tag) {
    case 'num':
    case 'var':
      return expr

    case 'add': {
      const left = simplifyOnce(expr.left)
      const right = simplifyOnce(expr.right)
      return simplifyAdd({ tag: 'add', left, right })
    }
    case 'sub': {
      const left = simplifyOnce(expr.left)
      const right = simplifyOnce(expr.right)
      return simplifySub({ tag: 'sub', left, right })
    }
    case 'mul': {
      const left = simplifyOnce(expr.left)
      const right = simplifyOnce(expr.right)
      return simplifyMul({ tag: 'mul', left, right })
    }
    case 'div': {
      const left = simplifyOnce(expr.left)
      const right = simplifyOnce(expr.right)
      return simplifyDiv({ tag: 'div', left, right })
    }
    case 'pow': {
      const base = simplifyOnce(expr.base)
      const exp = simplifyOnce(expr.exp)
      return simplifyPow({ tag: 'pow', base, exp })
    }
    case 'neg': {
      const inner = simplifyOnce(expr.expr)
      return simplifyNeg({ tag: 'neg', expr: inner })
    }
    case 'fn': {
      const arg = simplifyOnce(expr.arg)
      return { tag: 'fn', name: expr.name, arg }
    }
  }
}

function simplifyAdd(e: Expr & { tag: 'add' }): Expr {
  const { left, right } = e

  // Constant folding: num + num
  if (left.tag === 'num' && right.tag === 'num') return num(left.value + right.value)

  // Identity: x + 0, 0 + x
  if (isNum(right, 0)) return left
  if (isNum(left, 0)) return right

  // x + neg(y) → x - y
  if (right.tag === 'neg') return sub(left, right.expr)

  // neg(x) + y → y - x
  if (left.tag === 'neg') return sub(right, left.expr)

  // Like terms: x + x → 2*x
  if (equal(left, right)) return mul(num(2), left)

  // Like terms: a*x + b*x → (a+b)*x
  const [aCoeff, aBase] = extractCoeff(left)
  const [bCoeff, bBase] = extractCoeff(right)
  if (equal(aBase, bBase) && (aCoeff !== 1 || bCoeff !== 1)) {
    const sum = aCoeff + bCoeff
    if (sum === 0) return num(0)
    if (sum === 1) return aBase
    return mul(num(sum), aBase)
  }

  return e
}

function simplifySub(e: Expr & { tag: 'sub' }): Expr {
  const { left, right } = e

  // Constant folding: num - num
  if (left.tag === 'num' && right.tag === 'num') return num(left.value - right.value)

  // Identity: x - 0
  if (isNum(right, 0)) return left

  // x - x → 0
  if (equal(left, right)) return num(0)

  // x - neg(y) → x + y (will be handled on next pass as add)
  // 0 - x → neg(x)
  if (isNum(left, 0)) return neg(right)

  return e
}

function simplifyMul(e: Expr & { tag: 'mul' }): Expr {
  const { left, right } = e

  // Constant folding: num * num
  if (left.tag === 'num' && right.tag === 'num') return num(left.value * right.value)

  // Zero: x * 0, 0 * x
  if (isNum(right, 0)) return num(0)
  if (isNum(left, 0)) return num(0)

  // Identity: x * 1, 1 * x
  if (isNum(right, 1)) return left
  if (isNum(left, 1)) return right

  // neg simplification: neg(a) * neg(b) → a * b
  if (left.tag === 'neg' && right.tag === 'neg') return mul(left.expr, right.expr)

  // neg(a) * b → neg(a * b), a * neg(b) → neg(a * b)
  if (left.tag === 'neg') return neg(mul(left.expr, right))
  if (right.tag === 'neg') return neg(mul(left, right.expr))

  // Flatten nested constant multiplication: a * (b * x) → (a*b) * x
  if (left.tag === 'num' && right.tag === 'mul' && right.left.tag === 'num') {
    return mul(num(left.value * right.left.value), right.right)
  }
  if (left.tag === 'num' && right.tag === 'mul' && right.right.tag === 'num') {
    return mul(num(left.value * right.right.value), right.left)
  }
  if (right.tag === 'num' && left.tag === 'mul' && left.left.tag === 'num') {
    return mul(num(right.value * left.left.value), left.right)
  }

  // x * (1/x) → 1, x * (a/x) → a
  if (right.tag === 'div' && equal(left, right.right)) return right.left
  // (1/x) * x → 1, (a/x) * x → a
  if (left.tag === 'div' && equal(right, left.right)) return left.left

  // x * x → x²
  if (equal(left, right)) return { tag: 'pow', base: left, exp: num(2) }

  return e
}

function simplifyDiv(e: Expr & { tag: 'div' }): Expr {
  const { left, right } = e

  // Constant folding: num / num (only if clean result)
  if (left.tag === 'num' && right.tag === 'num' && right.value !== 0) {
    const result = left.value / right.value
    if (Number.isInteger(result) || (Number.isFinite(result) && Math.abs(result) < 1e6)) {
      // Only fold if it's a "nice" number (integer or clean decimal)
      const rounded = Math.round(result * 1e10) / 1e10
      if (rounded === result) return num(result)
    }
  }

  // Identity: x / 1
  if (isNum(right, 1)) return left

  // Zero: 0 / x
  if (isNum(left, 0)) return num(0)

  // x / x → 1
  if (equal(left, right)) return num(1)

  return e
}

function simplifyPow(e: Expr & { tag: 'pow' }): Expr {
  const { base, exp } = e

  // Constant folding: num ^ num (only for small results)
  if (base.tag === 'num' && exp.tag === 'num') {
    if (Number.isInteger(exp.value) && exp.value >= 0 && exp.value <= 10) {
      const result = Math.pow(base.value, exp.value)
      if (Number.isFinite(result) && Math.abs(result) <= 1e12) return num(result)
    }
  }

  // x ^ 1 → x
  if (isNum(exp, 1)) return base

  // x ^ 0 → 1
  if (isNum(exp, 0)) return num(1)

  // 0 ^ x → 0 (for positive exponent)
  if (isNum(base, 0) && exp.tag === 'num' && exp.value > 0) return num(0)

  // 1 ^ x → 1
  if (isNum(base, 1)) return num(1)

  return e
}

function simplifyNeg(e: Expr & { tag: 'neg' }): Expr {
  const inner = e.expr

  // neg(neg(x)) → x
  if (inner.tag === 'neg') return inner.expr

  // neg(num(n)) → num(-n)
  if (inner.tag === 'num') return num(-inner.value)

  // neg(sub(a, b)) → sub(b, a)
  if (inner.tag === 'sub') return sub(inner.right, inner.left)

  return e
}

// Main entry point: apply simplifyOnce repeatedly until stable
export function simplify(expr: Expr): Expr {
  let current = expr
  for (let i = 0; i < 100; i++) {
    const next = simplifyOnce(current)
    if (equal(current, next)) return next
    current = next
  }
  return current
}
