import { describe, test, expect } from 'bun:test'
import { parse, ParseError } from './parser'
import { format } from './printer'
import { simplify } from './simplify'
import { differentiate } from './diff'
import { evaluate, EvalError } from './eval'
import { num, v, add, sub, mul, div, pow, neg, fn, equal } from './expr'

// Helper: parse, differentiate w.r.t. x, return simplified result
function d(expr: string): string {
  const parsed = parse(expr)
  const { result } = differentiate(parsed, 'x')
  return format(result)
}

// Helper: numerical derivative via central difference
function numericalDerivative(
  exprStr: string,
  x0: number,
  h = 1e-7,
): number {
  const expr = parse(exprStr)
  const fPlus = evaluate(expr, { x: x0 + h })
  const fMinus = evaluate(expr, { x: x0 - h })
  return (fPlus - fMinus) / (2 * h)
}

// Helper: verify symbolic derivative matches numerical at a point
function expectDerivativeCorrect(
  exprStr: string,
  x0: number,
  tolerance = 1e-5,
) {
  const parsed = parse(exprStr)
  const { result } = differentiate(parsed, 'x')
  const symbolic = evaluate(result, { x: x0 })
  const numerical = numericalDerivative(exprStr, x0)
  expect(symbolic).toBeCloseTo(numerical, tolerance)
}

// ===================================================================
// Parser tests
// ===================================================================

describe('Parser', () => {
  describe('numbers', () => {
    test('integer', () => {
      expect(parse('42')).toEqual(num(42))
    })

    test('float', () => {
      expect(parse('3.14')).toEqual(num(3.14))
    })

    test('leading dot', () => {
      expect(parse('.5')).toEqual(num(0.5))
    })

    test('zero', () => {
      expect(parse('0')).toEqual(num(0))
    })
  })

  describe('variables', () => {
    test('single letter', () => {
      expect(parse('x')).toEqual(v('x'))
    })

    test('multi-letter', () => {
      expect(parse('theta')).toEqual(v('theta'))
    })
  })

  describe('binary operators', () => {
    test('addition', () => {
      expect(parse('x + 1')).toEqual(add(v('x'), num(1)))
    })

    test('subtraction', () => {
      expect(parse('x - 1')).toEqual(sub(v('x'), num(1)))
    })

    test('multiplication', () => {
      expect(parse('x * 2')).toEqual(mul(v('x'), num(2)))
    })

    test('division', () => {
      expect(parse('x / 2')).toEqual(div(v('x'), num(2)))
    })

    test('precedence: + vs *', () => {
      // 2 + 3 * x should parse as 2 + (3 * x)
      expect(parse('2 + 3 * x')).toEqual(add(num(2), mul(num(3), v('x'))))
    })

    test('precedence: * vs ^', () => {
      // 2 * x ^ 3 should parse as 2 * (x ^ 3)
      expect(parse('2 * x ^ 3')).toEqual(mul(num(2), pow(v('x'), num(3))))
    })

    test('left associativity of +', () => {
      // a + b + c = (a + b) + c
      expect(parse('a + b + c')).toEqual(add(add(v('a'), v('b')), v('c')))
    })

    test('left associativity of *', () => {
      expect(parse('a * b * c')).toEqual(mul(mul(v('a'), v('b')), v('c')))
    })

    test('left associativity of -', () => {
      // a - b - c = (a - b) - c
      expect(parse('a - b - c')).toEqual(sub(sub(v('a'), v('b')), v('c')))
    })
  })

  describe('exponentiation', () => {
    test('right associativity', () => {
      // x ^ 2 ^ 3 = x ^ (2 ^ 3)
      expect(parse('x ^ 2 ^ 3')).toEqual(pow(v('x'), pow(num(2), num(3))))
    })

    test('simple power', () => {
      expect(parse('x ^ 2')).toEqual(pow(v('x'), num(2)))
    })
  })

  describe('implicit multiplication', () => {
    test('number * variable: 2x', () => {
      expect(parse('2x')).toEqual(mul(num(2), v('x')))
    })

    test('number * function: 3sin(x)', () => {
      expect(parse('3sin(x)')).toEqual(mul(num(3), fn('sin', v('x'))))
    })

    test('number * parenthesized: 2(x+1)', () => {
      expect(parse('2(x+1)')).toEqual(mul(num(2), add(v('x'), num(1))))
    })

    test('variable * variable: xy', () => {
      expect(parse('xy')).toEqual(v('xy'))
      // Note: 'xy' is parsed as a single variable name, not x*y
    })

    test('number * var * var: 2x y (with space)', () => {
      // 2x is implicit mul, then space, then y is another implicit mul
      // Actually tokenizer treats 'x' and 'y' as separate if there's a space issue
      // But '2x' becomes mul(2, x), and the parser doesn't know about spaces after tokenizing
      // Let's check what happens:
      // "2 x y" should be 2 * x * y via implicit multiplication
      expect(parse('2 x y')).toEqual(mul(mul(num(2), v('x')), v('y')))
    })
  })

  describe('functions', () => {
    test('sin', () => {
      expect(parse('sin(x)')).toEqual(fn('sin', v('x')))
    })

    test('cos', () => {
      expect(parse('cos(x)')).toEqual(fn('cos', v('x')))
    })

    test('tan', () => {
      expect(parse('tan(x)')).toEqual(fn('tan', v('x')))
    })

    test('ln', () => {
      expect(parse('ln(x)')).toEqual(fn('ln', v('x')))
    })

    test('log', () => {
      expect(parse('log(x)')).toEqual(fn('log', v('x')))
    })

    test('sqrt', () => {
      expect(parse('sqrt(x)')).toEqual(fn('sqrt', v('x')))
    })

    test('exp', () => {
      expect(parse('exp(x)')).toEqual(fn('exp', v('x')))
    })

    test('abs', () => {
      expect(parse('abs(x)')).toEqual(fn('abs', v('x')))
    })

    test('nested function', () => {
      expect(parse('sin(cos(x))')).toEqual(fn('sin', fn('cos', v('x'))))
    })

    test('function of expression', () => {
      expect(parse('sin(x^2)')).toEqual(fn('sin', pow(v('x'), num(2))))
    })
  })

  describe('parentheses', () => {
    test('override precedence', () => {
      expect(parse('(2 + 3) * x')).toEqual(mul(add(num(2), num(3)), v('x')))
    })

    test('nested parentheses', () => {
      expect(parse('((x))')).toEqual(v('x'))
    })
  })

  describe('unary minus', () => {
    test('negation of variable', () => {
      expect(parse('-x')).toEqual(neg(v('x')))
    })

    test('negation of number', () => {
      expect(parse('-5')).toEqual(neg(num(5)))
    })

    test('double negation', () => {
      expect(parse('--x')).toEqual(neg(neg(v('x'))))
    })
  })

  describe('error cases', () => {
    test('empty expression', () => {
      expect(() => parse('')).toThrow(ParseError)
    })

    test('unexpected character', () => {
      expect(() => parse('x @ y')).toThrow(ParseError)
    })

    test('unmatched parenthesis', () => {
      expect(() => parse('(x + 1')).toThrow(ParseError)
    })

    test('trailing operator', () => {
      expect(() => parse('x +')).toThrow(ParseError)
    })
  })
})

// ===================================================================
// Simplifier tests
// ===================================================================

describe('Simplifier', () => {
  // Helper to parse, simplify, and format
  const s = (expr: string) => format(simplify(parse(expr)))

  describe('constant folding', () => {
    test('addition: 2 + 3 = 5', () => {
      expect(s('2 + 3')).toBe('5')
    })

    test('subtraction: 5 - 2 = 3', () => {
      expect(s('5 - 2')).toBe('3')
    })

    test('multiplication: 3 * 4 = 12', () => {
      expect(s('3 * 4')).toBe('12')
    })

    test('division: 10 / 2 = 5', () => {
      expect(s('10 / 2')).toBe('5')
    })

    test('power: 2 ^ 3 = 8', () => {
      expect(s('2 ^ 3')).toBe('8')
    })
  })

  describe('additive identity', () => {
    test('x + 0 = x', () => {
      expect(s('x + 0')).toBe('x')
    })

    test('0 + x = x', () => {
      expect(s('0 + x')).toBe('x')
    })
  })

  describe('multiplicative identity', () => {
    test('x * 1 = x', () => {
      expect(s('x * 1')).toBe('x')
    })

    test('1 * x = x', () => {
      expect(s('1 * x')).toBe('x')
    })
  })

  describe('zero multiplication', () => {
    test('x * 0 = 0', () => {
      expect(s('x * 0')).toBe('0')
    })

    test('0 * x = 0', () => {
      expect(s('0 * x')).toBe('0')
    })
  })

  describe('power rules', () => {
    test('x ^ 0 = 1', () => {
      expect(s('x ^ 0')).toBe('1')
    })

    test('x ^ 1 = x', () => {
      expect(s('x ^ 1')).toBe('x')
    })
  })

  describe('negation', () => {
    test('double negation: --x = x', () => {
      expect(s('--x')).toBe('x')
    })

    test('neg of number: -(3) = -3', () => {
      expect(s('-(3)')).toBe('-3')
    })
  })

  describe('subtraction identity', () => {
    test('x - 0 = x', () => {
      expect(s('x - 0')).toBe('x')
    })

    test('x - x = 0', () => {
      expect(s('x - x')).toBe('0')
    })

    test('0 - x = -x', () => {
      const result = simplify(parse('0 - x'))
      expect(result).toEqual(neg(v('x')))
    })
  })

  describe('division identity', () => {
    test('x / 1 = x', () => {
      expect(s('x / 1')).toBe('x')
    })

    test('0 / x = 0', () => {
      expect(s('0 / x')).toBe('0')
    })

    test('x / x = 1', () => {
      expect(s('x / x')).toBe('1')
    })
  })

  describe('like terms', () => {
    test('x + x = 2x', () => {
      expect(s('x + x')).toBe('2x')
    })

    test('3*x + 2*x = 5x', () => {
      expect(s('3*x + 2*x')).toBe('5x')
    })
  })
})

// ===================================================================
// Differentiation tests
// ===================================================================

describe('Differentiation', () => {
  describe('basic rules', () => {
    test('d/dx(5) = 0', () => {
      expect(d('5')).toBe('0')
    })

    test('d/dx(x) = 1', () => {
      expect(d('x')).toBe('1')
    })

    test('d/dx(y) = 0 (different variable)', () => {
      expect(d('y')).toBe('0')
    })
  })

  describe('power rule', () => {
    test('d/dx(x^2) = 2x', () => {
      expect(d('x^2')).toBe('2x')
    })

    test('d/dx(x^3) = 3x^2', () => {
      const result = d('x^3')
      // Could be "3x²" or "3 · x²" depending on simplification
      expect(result).toContain('3')
      // Verify numerically
      expectDerivativeCorrect('x^3', 2)
    })

    test('d/dx(x^5) numerically correct', () => {
      expectDerivativeCorrect('x^5', 1.5)
    })
  })

  describe('constant multiple rule', () => {
    test('d/dx(3x) = 3', () => {
      // 3x is parsed as mul(3, x), derivative should be 3
      const result = d('3*x')
      expect(result).toBe('3')
    })

    test('d/dx(5*x^2) numerically correct', () => {
      expectDerivativeCorrect('5*x^2', 3)
    })
  })

  describe('sum and difference', () => {
    test('d/dx(x^2 + x) = 2x + 1', () => {
      const result = d('x^2 + x')
      expect(result).toBe('2x + 1')
    })

    test('d/dx(x^3 - x^2) numerically correct', () => {
      expectDerivativeCorrect('x^3 - x^2', 2)
    })
  })

  describe('product rule', () => {
    test('d/dx(x*sin(x)) = sin(x) + x*cos(x)', () => {
      // Verify numerically since symbolic form may vary
      expectDerivativeCorrect('x*sin(x)', 1)
      expectDerivativeCorrect('x*sin(x)', 2)
    })

    test('d/dx(x^2 * ln(x)) numerically correct', () => {
      expectDerivativeCorrect('x^2 * ln(x)', 2)
    })
  })

  describe('quotient rule', () => {
    test('d/dx(1/x) numerically correct', () => {
      // d/dx(1/x) = -1/x^2
      expectDerivativeCorrect('1/x', 2)
      expectDerivativeCorrect('1/x', 0.5)
    })

    test('d/dx(x/(x+1)) numerically correct', () => {
      expectDerivativeCorrect('x/(x+1)', 2)
    })
  })

  describe('chain rule', () => {
    test('d/dx(sin(x^2)) numerically correct', () => {
      // d/dx(sin(x^2)) = cos(x^2) * 2x
      expectDerivativeCorrect('sin(x^2)', 1)
      expectDerivativeCorrect('sin(x^2)', 0.5)
    })

    test('d/dx(cos(3*x)) numerically correct', () => {
      expectDerivativeCorrect('cos(3*x)', 1)
    })

    test('d/dx((x^2 + 1)^3) numerically correct', () => {
      expectDerivativeCorrect('(x^2 + 1)^3', 1)
    })
  })

  describe('function derivatives', () => {
    test('d/dx(sin(x)) = cos(x)', () => {
      const result = d('sin(x)')
      expect(result).toBe('cos(x)')
    })

    test('d/dx(cos(x)) = -sin(x)', () => {
      const result = d('cos(x)')
      expect(result).toBe('-sin(x)')
    })

    test('d/dx(ln(x)) = 1/x', () => {
      const result = d('ln(x)')
      // Could be "1 / x" or similar
      expectDerivativeCorrect('ln(x)', 2)
      // Check the structure contains division by x
      const parsed = parse(result)
      const val = evaluate(parsed, { x: 2 })
      expect(val).toBeCloseTo(0.5)
    })

    test('d/dx(exp(x)) = exp(x)', () => {
      const result = d('exp(x)')
      expect(result).toBe('exp(x)')
    })

    test('d/dx(sqrt(x)) numerically correct', () => {
      expectDerivativeCorrect('sqrt(x)', 4)
    })

    test('d/dx(tan(x)) numerically correct', () => {
      expectDerivativeCorrect('tan(x)', 0.5)
    })
  })

  describe('exponential rule', () => {
    test('d/dx(2^x) numerically correct', () => {
      expectDerivativeCorrect('2^x', 1)
    })

    test('d/dx(exp(x^2)) numerically correct', () => {
      expectDerivativeCorrect('exp(x^2)', 0.5)
    })
  })

  describe('negation', () => {
    test('d/dx(-x) = -1', () => {
      expect(d('-x')).toBe('-1')
    })

    test('d/dx(-x^2) numerically correct', () => {
      expectDerivativeCorrect('-x^2', 3)
    })
  })

  describe('complex expressions - numerical verification', () => {
    test('d/dx(x^3 + 2*x^2 - 5*x + 3)', () => {
      expectDerivativeCorrect('x^3 + 2*x^2 - 5*x + 3', 2)
    })

    test('d/dx(sin(x) * cos(x))', () => {
      expectDerivativeCorrect('sin(x) * cos(x)', 1)
    })

    test('d/dx(ln(x^2 + 1))', () => {
      expectDerivativeCorrect('ln(x^2 + 1)', 2)
    })

    test('d/dx(x * exp(x))', () => {
      expectDerivativeCorrect('x * exp(x)', 1)
    })

    test('d/dx(sin(x)/x)', () => {
      expectDerivativeCorrect('sin(x)/x', 1)
    })
  })
})

// ===================================================================
// Evaluator tests
// ===================================================================

describe('Evaluator', () => {
  describe('basic arithmetic', () => {
    test('number literal', () => {
      expect(evaluate(num(42))).toBe(42)
    })

    test('addition', () => {
      expect(evaluate(add(num(2), num(3)))).toBe(5)
    })

    test('subtraction', () => {
      expect(evaluate(sub(num(10), num(4)))).toBe(6)
    })

    test('multiplication', () => {
      expect(evaluate(mul(num(3), num(7)))).toBe(21)
    })

    test('division', () => {
      expect(evaluate(div(num(15), num(3)))).toBe(5)
    })

    test('power', () => {
      expect(evaluate(pow(num(2), num(10)))).toBe(1024)
    })

    test('negation', () => {
      expect(evaluate(neg(num(5)))).toBe(-5)
    })
  })

  describe('variable substitution', () => {
    test('single variable', () => {
      expect(evaluate(v('x'), { x: 5 })).toBe(5)
    })

    test('expression with variables', () => {
      // x^2 + 2x + 1 at x=3 = 9 + 6 + 1 = 16
      const expr = add(add(pow(v('x'), num(2)), mul(num(2), v('x'))), num(1))
      expect(evaluate(expr, { x: 3 })).toBe(16)
    })

    test('multiple variables', () => {
      // x + y at x=2, y=3
      expect(evaluate(add(v('x'), v('y')), { x: 2, y: 3 })).toBe(5)
    })
  })

  describe('functions', () => {
    test('sin(0) = 0', () => {
      expect(evaluate(fn('sin', num(0)))).toBeCloseTo(0)
    })

    test('cos(0) = 1', () => {
      expect(evaluate(fn('cos', num(0)))).toBeCloseTo(1)
    })

    test('ln(1) = 0', () => {
      expect(evaluate(fn('ln', num(1)))).toBeCloseTo(0)
    })

    test('exp(0) = 1', () => {
      expect(evaluate(fn('exp', num(0)))).toBeCloseTo(1)
    })

    test('sqrt(4) = 2', () => {
      expect(evaluate(fn('sqrt', num(4)))).toBeCloseTo(2)
    })

    test('abs(-7) = 7', () => {
      expect(evaluate(fn('abs', num(-7)))).toBe(7)
    })

    test('log(100) = 2', () => {
      expect(evaluate(fn('log', num(100)))).toBeCloseTo(2)
    })

    test('tan(0) = 0', () => {
      expect(evaluate(fn('tan', num(0)))).toBeCloseTo(0)
    })
  })

  describe('parse and evaluate integration', () => {
    test('2*x + 1 at x=3', () => {
      expect(evaluate(parse('2*x + 1'), { x: 3 })).toBe(7)
    })

    test('sin(x)^2 + cos(x)^2 = 1', () => {
      const expr = parse('sin(x)^2 + cos(x)^2')
      expect(evaluate(expr, { x: 1.5 })).toBeCloseTo(1)
    })
  })

  describe('error cases', () => {
    test('undefined variable', () => {
      expect(() => evaluate(v('x'))).toThrow(EvalError)
    })

    test('division by zero', () => {
      expect(() => evaluate(div(num(1), num(0)))).toThrow(EvalError)
    })

    test('sqrt of negative', () => {
      expect(() => evaluate(fn('sqrt', num(-1)))).toThrow(EvalError)
    })
  })
})

// ===================================================================
// Printer tests
// ===================================================================

describe('Printer', () => {
  describe('basic formatting', () => {
    test('number', () => {
      expect(format(num(42))).toBe('42')
    })

    test('variable', () => {
      expect(format(v('x'))).toBe('x')
    })

    test('negative number', () => {
      expect(format(num(-3))).toBe('-3')
    })
  })

  describe('minimal parentheses', () => {
    test('a + b * c: no parens needed', () => {
      // var * var is implicit multiplication, so bc not b · c
      expect(format(add(v('a'), mul(v('b'), v('c'))))).toBe('a + bc')
    })

    test('(a + b) * c: parens around addition', () => {
      expect(format(mul(add(v('a'), v('b')), v('c')))).toBe('(a + b) · c')
    })

    test('a - (b + c): parens needed for right side of subtraction', () => {
      expect(format(sub(v('a'), add(v('b'), v('c'))))).toBe('a - (b + c)')
    })

    test('a - (b - c): parens needed', () => {
      expect(format(sub(v('a'), sub(v('b'), v('c'))))).toBe('a - (b - c)')
    })

    test('a / (b * c): parens needed', () => {
      // var * var is implicit, so (bc) not (b · c)
      expect(format(div(v('a'), mul(v('b'), v('c'))))).toBe('a / (bc)')
    })
  })

  describe('superscript exponents', () => {
    test('x^2 renders as x\u00B2', () => {
      expect(format(pow(v('x'), num(2)))).toBe('x\u00B2')
    })

    test('x^3 renders as x\u00B3', () => {
      expect(format(pow(v('x'), num(3)))).toBe('x\u00B3')
    })

    test('x^0 renders as x\u2070', () => {
      expect(format(pow(v('x'), num(0)))).toBe('x\u2070')
    })

    test('complex exponent uses caret: x^(n+1)', () => {
      expect(format(pow(v('x'), add(v('n'), num(1))))).toBe('x^(n + 1)')
    })
  })

  describe('implicit multiplication', () => {
    test('2*x renders as 2x', () => {
      expect(format(mul(num(2), v('x')))).toBe('2x')
    })

    test('2*sin(x) renders as 2sin(x)', () => {
      expect(format(mul(num(2), fn('sin', v('x'))))).toBe('2sin(x)')
    })

    test('x*y renders as xy (var*var implicit)', () => {
      expect(format(mul(v('x'), v('y')))).toBe('xy')
    })

    test('2*x^2 renders as 2x\u00B2', () => {
      expect(format(mul(num(2), pow(v('x'), num(2))))).toBe('2x\u00B2')
    })

    test('(a+b)*(c+d) uses explicit dot', () => {
      const expr = mul(add(v('a'), v('b')), add(v('c'), v('d')))
      expect(format(expr)).toBe('(a + b) · (c + d)')
    })
  })

  describe('functions', () => {
    test('sin(x)', () => {
      expect(format(fn('sin', v('x')))).toBe('sin(x)')
    })

    test('ln(x+1)', () => {
      expect(format(fn('ln', add(v('x'), num(1))))).toBe('ln(x + 1)')
    })
  })

  describe('negation', () => {
    test('-x', () => {
      expect(format(neg(v('x')))).toBe('-x')
    })

    test('-(x + 1)', () => {
      expect(format(neg(add(v('x'), num(1))))).toBe('-(x + 1)')
    })
  })
})

// ===================================================================
// Expr utility tests
// ===================================================================

describe('Expr utilities', () => {
  test('equal: structurally identical', () => {
    expect(equal(add(v('x'), num(1)), add(v('x'), num(1)))).toBe(true)
  })

  test('equal: different', () => {
    expect(equal(add(v('x'), num(1)), add(v('x'), num(2)))).toBe(false)
  })

  test('equal: different tags', () => {
    expect(equal(v('x'), num(1))).toBe(false)
  })
})
