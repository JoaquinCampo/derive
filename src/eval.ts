import { Expr } from './expr.js'

export class EvalError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EvalError'
  }
}

const mathFns: Record<string, (x: number) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  ln: Math.log,
  log: Math.log10,
  sqrt: (x) => {
    if (x < 0) throw new EvalError('sqrt of negative number')
    return Math.sqrt(x)
  },
  abs: Math.abs,
  exp: Math.exp,
}

export function evaluate(expr: Expr, vars: Record<string, number> = {}): number {
  switch (expr.tag) {
    case 'num':
      return expr.value
    case 'var':
      if (!(expr.name in vars)) throw new EvalError(`undefined variable '${expr.name}'`)
      return vars[expr.name]
    case 'add':
      return evaluate(expr.left, vars) + evaluate(expr.right, vars)
    case 'sub':
      return evaluate(expr.left, vars) - evaluate(expr.right, vars)
    case 'mul':
      return evaluate(expr.left, vars) * evaluate(expr.right, vars)
    case 'div': {
      const right = evaluate(expr.right, vars)
      if (right === 0) throw new EvalError('division by zero')
      return evaluate(expr.left, vars) / right
    }
    case 'pow':
      return Math.pow(evaluate(expr.base, vars), evaluate(expr.exp, vars))
    case 'neg':
      return -evaluate(expr.expr, vars)
    case 'fn': {
      const fn = mathFns[expr.name]
      if (!fn) throw new EvalError(`unknown function '${expr.name}'`)
      return fn(evaluate(expr.arg, vars))
    }
  }
}

export function parseVarBindings(args: string[]): Record<string, number> {
  const vars: Record<string, number> = {}
  for (const arg of args) {
    const eq = arg.indexOf('=')
    if (eq <= 0) throw new EvalError(`malformed variable assignment: '${arg}'`)
    const name = arg.slice(0, eq).trim()
    const val = Number(arg.slice(eq + 1).trim())
    if (!name || isNaN(val)) throw new EvalError(`malformed variable assignment: '${arg}'`)
    vars[name] = val
  }
  return vars
}
