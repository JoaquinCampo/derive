import { Expr, num, v, add, sub, mul, div, pow, neg, fn, containsVar, isConstant, equal } from './expr.js'
import { simplify } from './simplify.js'

// A single step in a differentiation proof
export type Step = {
  rule: string        // name of the rule applied
  input: Expr         // what we're differentiating
  result: Expr        // the result
  explanation: string // human-readable explanation
  children?: Step[][] // sub-derivations (for product rule, chain rule, etc.)
}

// Differentiate an expression with respect to a variable, recording every step.
export function differentiate(expr: Expr, varName: string): { result: Expr; steps: Step[] } {
  const steps: Step[] = []
  const result = diff(expr, varName, steps)
  const simplified = simplify(result)
  return { result: simplified, steps }
}

function diff(expr: Expr, x: string, steps: Step[]): Expr {
  // Constant rule: d/dx(c) = 0
  if (!containsVar(expr, x)) {
    const step: Step = {
      rule: 'constant',
      input: expr,
      result: num(0),
      explanation: `The derivative of a constant is 0`
    }
    steps.push(step)
    return num(0)
  }

  switch (expr.tag) {
    case 'num': {
      const step: Step = {
        rule: 'constant',
        input: expr,
        result: num(0),
        explanation: `d/d${x}(${expr.value}) = 0`
      }
      steps.push(step)
      return num(0)
    }

    case 'var': {
      if (expr.name === x) {
        const step: Step = {
          rule: 'variable',
          input: expr,
          result: num(1),
          explanation: `d/d${x}(${x}) = 1`
        }
        steps.push(step)
        return num(1)
      } else {
        const step: Step = {
          rule: 'constant',
          input: expr,
          result: num(0),
          explanation: `d/d${x}(${expr.name}) = 0 (treating ${expr.name} as constant)`
        }
        steps.push(step)
        return num(0)
      }
    }

    case 'add': {
      const leftSteps: Step[] = []
      const rightSteps: Step[] = []
      const dl = diff(expr.left, x, leftSteps)
      const dr = diff(expr.right, x, rightSteps)
      const result = simplify(add(dl, dr))
      const step: Step = {
        rule: 'sum',
        input: expr,
        result,
        explanation: `Sum rule: differentiate each term separately`,
        children: [leftSteps, rightSteps]
      }
      steps.push(step)
      return result
    }

    case 'sub': {
      const leftSteps: Step[] = []
      const rightSteps: Step[] = []
      const dl = diff(expr.left, x, leftSteps)
      const dr = diff(expr.right, x, rightSteps)
      const result = simplify(sub(dl, dr))
      const step: Step = {
        rule: 'difference',
        input: expr,
        result,
        explanation: `Difference rule: differentiate each term separately`,
        children: [leftSteps, rightSteps]
      }
      steps.push(step)
      return result
    }

    case 'neg': {
      const innerSteps: Step[] = []
      const di = diff(expr.expr, x, innerSteps)
      const result = simplify(neg(di))
      const step: Step = {
        rule: 'negation',
        input: expr,
        result,
        explanation: `d/d${x}(-f) = -(d/d${x}(f))`,
        children: [innerSteps]
      }
      steps.push(step)
      return result
    }

    case 'mul': {
      // Constant multiple: if one side is constant, skip full product rule
      if (isConstant(expr.left)) {
        const rightSteps: Step[] = []
        const dr = diff(expr.right, x, rightSteps)
        const result = simplify(mul(expr.left, dr))
        const step: Step = {
          rule: 'constant multiple',
          input: expr,
          result,
          explanation: `Constant multiple rule: pull the constant out`,
          children: [rightSteps]
        }
        steps.push(step)
        return result
      }
      if (isConstant(expr.right)) {
        const leftSteps: Step[] = []
        const dl = diff(expr.left, x, leftSteps)
        const result = simplify(mul(expr.right, dl))
        const step: Step = {
          rule: 'constant multiple',
          input: expr,
          result,
          explanation: `Constant multiple rule: pull the constant out`,
          children: [leftSteps]
        }
        steps.push(step)
        return result
      }

      // Product rule: d/dx(f · g) = f' · g + f · g'
      const leftSteps: Step[] = []
      const rightSteps: Step[] = []
      const dl = diff(expr.left, x, leftSteps)
      const dr = diff(expr.right, x, rightSteps)
      const result = simplify(add(mul(dl, expr.right), mul(expr.left, dr)))
      const step: Step = {
        rule: 'product',
        input: expr,
        result,
        explanation: `Product rule: d/d${x}(f · g) = f' · g + f · g'`,
        children: [leftSteps, rightSteps]
      }
      steps.push(step)
      return result
    }

    case 'div': {
      // Constant denominator: just differentiate the numerator
      if (isConstant(expr.right)) {
        const numSteps: Step[] = []
        const dn = diff(expr.left, x, numSteps)
        const result = simplify(div(dn, expr.right))
        const step: Step = {
          rule: 'constant divisor',
          input: expr,
          result,
          explanation: `Divide by a constant: differentiate the numerator only`,
          children: [numSteps]
        }
        steps.push(step)
        return result
      }

      // Quotient rule: d/dx(f/g) = (f'g - fg') / g²
      const numSteps: Step[] = []
      const denSteps: Step[] = []
      const dn = diff(expr.left, x, numSteps)
      const dd = diff(expr.right, x, denSteps)
      const result = simplify(
        div(
          sub(mul(dn, expr.right), mul(expr.left, dd)),
          pow(expr.right, num(2))
        )
      )
      const step: Step = {
        rule: 'quotient',
        input: expr,
        result,
        explanation: `Quotient rule: d/d${x}(f/g) = (f'g - fg') / g²`,
        children: [numSteps, denSteps]
      }
      steps.push(step)
      return result
    }

    case 'pow': {
      // Case 1: x^n where n is a constant — power rule
      if (isConstant(expr.exp)) {
        if (expr.base.tag === 'var' && expr.base.name === x) {
          // Simple power rule: d/dx(x^n) = n·x^(n-1)
          const result = simplify(mul(expr.exp, pow(expr.base, sub(expr.exp, num(1)))))
          const step: Step = {
            rule: 'power',
            input: expr,
            result,
            explanation: `Power rule: d/d${x}(${x}^n) = n · ${x}^(n-1)`
          }
          steps.push(step)
          return result
        }

        // Generalized power rule with chain rule: d/dx(f(x)^n) = n·f(x)^(n-1)·f'(x)
        const innerSteps: Step[] = []
        const di = diff(expr.base, x, innerSteps)
        const result = simplify(mul(mul(expr.exp, pow(expr.base, sub(expr.exp, num(1)))), di))
        const step: Step = {
          rule: 'power + chain',
          input: expr,
          result,
          explanation: `Power rule with chain rule: d/d${x}(f^n) = n · f^(n-1) · f'`,
          children: [innerSteps]
        }
        steps.push(step)
        return result
      }

      // Case 2: a^x where a is constant — exponential rule
      if (isConstant(expr.base)) {
        const innerSteps: Step[] = []
        const di = diff(expr.exp, x, innerSteps)
        // d/dx(a^g(x)) = a^g(x) · ln(a) · g'(x)
        const result = simplify(mul(mul(expr, fn('ln', expr.base)), di))
        const step: Step = {
          rule: 'exponential',
          input: expr,
          result,
          explanation: `Exponential rule: d/d${x}(a^f) = a^f · ln(a) · f'`,
          children: [innerSteps]
        }
        steps.push(step)
        return result
      }

      // Case 3: f(x)^g(x) — logarithmic differentiation
      // d/dx(f^g) = f^g · (g'·ln(f) + g·f'/f)
      const baseSteps: Step[] = []
      const expSteps: Step[] = []
      const db = diff(expr.base, x, baseSteps)
      const de = diff(expr.exp, x, expSteps)
      const result = simplify(
        mul(
          expr,
          add(
            mul(de, fn('ln', expr.base)),
            mul(expr.exp, div(db, expr.base))
          )
        )
      )
      const step: Step = {
        rule: 'logarithmic differentiation',
        input: expr,
        result,
        explanation: `f^g where both depend on ${x}: d/d${x}(f^g) = f^g · (g'·ln(f) + g·f'/f)`,
        children: [baseSteps, expSteps]
      }
      steps.push(step)
      return result
    }

    case 'fn': {
      const innerSteps: Step[] = []
      const di = diff(expr.arg, x, innerSteps)
      let outer: Expr

      switch (expr.name) {
        case 'sin':
          outer = fn('cos', expr.arg)
          break
        case 'cos':
          outer = neg(fn('sin', expr.arg))
          break
        case 'tan':
          // d/dx(tan(u)) = sec²(u) = 1/cos²(u)
          outer = div(num(1), pow(fn('cos', expr.arg), num(2)))
          break
        case 'ln':
          outer = div(num(1), expr.arg)
          break
        case 'log':
          // d/dx(log₁₀(u)) = 1/(u·ln(10))
          outer = div(num(1), mul(expr.arg, fn('ln', num(10))))
          break
        case 'sqrt':
          // d/dx(√u) = 1/(2√u)
          outer = div(num(1), mul(num(2), fn('sqrt', expr.arg)))
          break
        case 'exp':
          outer = fn('exp', expr.arg)
          break
        case 'abs':
          // d/dx(|u|) = u/|u| (undefined at 0, but we'll return this)
          outer = div(expr.arg, fn('abs', expr.arg))
          break
        default:
          throw new Error(`Unknown function: ${expr.name}`)
      }

      // If the inner derivative is 1 (i.e., the argument is just x), skip chain rule mention
      const isSimpleArg = equal(di, num(1))
      const result = simplify(isSimpleArg ? outer : mul(outer, di))

      const ruleName = isSimpleArg ? expr.name : `${expr.name} + chain`
      const explanation = isSimpleArg
        ? `d/d${x}(${expr.name}(${x})) = ${describeDerivative(expr.name)}`
        : `Chain rule: d/d${x}(${expr.name}(u)) = ${describeDerivative(expr.name)} · u'`

      const step: Step = {
        rule: ruleName,
        input: expr,
        result,
        explanation,
        children: isSimpleArg ? undefined : [innerSteps]
      }
      steps.push(step)
      return result
    }
  }
}

function describeDerivative(fnName: string): string {
  switch (fnName) {
    case 'sin': return 'cos(u)'
    case 'cos': return '-sin(u)'
    case 'tan': return '1/cos²(u)'
    case 'ln': return '1/u'
    case 'log': return '1/(u · ln(10))'
    case 'sqrt': return '1/(2√u)'
    case 'exp': return 'exp(u)'
    case 'abs': return 'u/|u|'
    default: return `${fnName}'(u)`
  }
}
