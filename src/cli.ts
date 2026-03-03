#!/usr/bin/env bun
import { parse } from './parser.js'
import { format, formatColored } from './printer.js'
import { differentiate } from './diff.js'
import { simplify } from './simplify.js'
import { evaluate, parseVarBindings, EvalError } from './eval.js'
import { formatSteps, formatResult } from './steps.js'

const RESET = '\x1b[0m'
const BOLD = '\x1b[1m'
const DIM = '\x1b[2m'
const RED = '\x1b[31m'
const GREEN = '\x1b[32m'
const CYAN = '\x1b[36m'
const YELLOW = '\x1b[33m'
const MAGENTA = '\x1b[35m'

const HELP = `
${BOLD}derive${RESET} — a symbolic math engine that shows its work

${BOLD}Usage:${RESET}
  derive diff <expr> [--var=x] [--steps]   Differentiate an expression
  derive eval <expr> <var=val>...           Evaluate an expression
  derive simplify <expr>                    Simplify an expression
  derive repl                               Interactive mode
  derive help                               Show this message

${BOLD}Examples:${RESET}
  ${DIM}$${RESET} derive diff "x^3 + 2*x^2 - 5*x + 3"
  ${DIM}$${RESET} derive diff "sin(x^2)" --steps
  ${DIM}$${RESET} derive diff "x*ln(x)" --var=x --steps
  ${DIM}$${RESET} derive eval "x^2 + 2*x + 1" x=3
  ${DIM}$${RESET} derive simplify "(x + 0) * 1 + 0"
  ${DIM}$${RESET} derive repl
`

const REPL_HELP = `
${BOLD}Commands:${RESET}
  ${CYAN}:diff${RESET} <expr>         Differentiate (default action)
  ${CYAN}:eval${RESET} <expr> x=n     Evaluate with variable values
  ${CYAN}:simplify${RESET} <expr>     Simplify an expression
  ${CYAN}:var${RESET} <name>          Set differentiation variable (default: x)
  ${CYAN}:steps${RESET}              Toggle step-by-step output
  ${CYAN}:help${RESET}               Show this message
  ${CYAN}:quit${RESET}               Exit

  Or just type an expression to differentiate it.
`

function error(msg: string): never {
  console.error(`${RED}Error:${RESET} ${msg}`)
  process.exit(1)
}

function cmdDiff(exprStr: string, varName: string, showSteps: boolean) {
  try {
    const expr = parse(exprStr)
    const { result, steps } = differentiate(expr, varName)

    if (showSteps) {
      console.log(formatSteps(expr, varName, result, steps))
    } else {
      console.log()
      console.log(formatResult(expr, varName, result))
      console.log()
    }
  } catch (e: any) {
    error(e.message)
  }
}

function cmdEval(exprStr: string, bindings: string[]) {
  try {
    const expr = parse(exprStr)
    const vars = parseVarBindings(bindings)
    const result = evaluate(expr, vars)

    const varsStr = Object.entries(vars)
      .map(([k, v]) => `${YELLOW}${k}${RESET}=${CYAN}${v}${RESET}`)
      .join(', ')

    console.log()
    console.log(`  ${formatColored(expr)}  ${DIM}where${RESET} ${varsStr}`)
    console.log(`  ${GREEN}${BOLD}= ${result}${RESET}`)
    console.log()
  } catch (e: any) {
    error(e.message)
  }
}

function cmdSimplify(exprStr: string) {
  try {
    const expr = parse(exprStr)
    const result = simplify(expr)

    console.log()
    console.log(`  ${formatColored(expr)}`)
    console.log(`  ${GREEN}${BOLD}= ${formatColored(result)}${RESET}`)
    console.log()
  } catch (e: any) {
    error(e.message)
  }
}

async function cmdRepl() {
  const stdin = process.stdin
  const stdout = process.stdout

  let varName = 'x'
  let showSteps = true

  console.log(`${BOLD}derive${RESET} ${DIM}v0.1.0${RESET} — type an expression to differentiate, or ${CYAN}:help${RESET}`)
  console.log()

  const rl = await (async () => {
    const readline = await import('readline')
    return readline.createInterface({ input: stdin, output: stdout })
  })()

  const prompt = () => `${MAGENTA}∂${RESET} `

  rl.setPrompt(prompt())
  rl.prompt()

  rl.on('line', (line: string) => {
    const input = line.trim()
    if (!input) {
      rl.prompt()
      return
    }

    try {
      if (input === ':quit' || input === ':q' || input === ':exit') {
        rl.close()
        return
      }

      if (input === ':help' || input === ':h') {
        console.log(REPL_HELP)
      } else if (input === ':steps') {
        showSteps = !showSteps
        console.log(`  ${DIM}Step-by-step output: ${showSteps ? 'on' : 'off'}${RESET}`)
      } else if (input.startsWith(':var ')) {
        varName = input.slice(5).trim()
        console.log(`  ${DIM}Differentiating with respect to: ${varName}${RESET}`)
      } else if (input.startsWith(':eval ')) {
        const parts = input.slice(6).trim().split(/\s+/)
        // Find where the expression ends and bindings begin (look for x=n pattern)
        const bindingIdx = parts.findIndex(p => /^[a-zA-Z]+=/.test(p))
        if (bindingIdx === -1) {
          console.error(`  ${RED}Usage: :eval <expr> var=value ...${RESET}`)
        } else {
          const exprStr = parts.slice(0, bindingIdx).join(' ')
          const bindings = parts.slice(bindingIdx)
          cmdEval(exprStr, bindings)
        }
      } else if (input.startsWith(':simplify ') || input.startsWith(':s ')) {
        const exprStr = input.startsWith(':s ') ? input.slice(3) : input.slice(10)
        cmdSimplify(exprStr.trim())
      } else if (input.startsWith(':diff ') || input.startsWith(':d ')) {
        const exprStr = input.startsWith(':d ') ? input.slice(3) : input.slice(6)
        cmdDiff(exprStr.trim(), varName, showSteps)
      } else if (input.startsWith(':')) {
        console.error(`  ${RED}Unknown command: ${input.split(' ')[0]}${RESET}`)
      } else {
        // Default: differentiate the expression
        cmdDiff(input, varName, showSteps)
      }
    } catch (e: any) {
      console.error(`  ${RED}${e.message}${RESET}`)
    }

    console.log()
    rl.prompt()
  })

  rl.on('close', () => {
    console.log()
    process.exit(0)
  })
}

// Main
const args = process.argv.slice(2)
const cmd = args[0]

if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
  console.log(HELP)
  process.exit(0)
}

if (cmd === 'repl') {
  cmdRepl()
} else if (cmd === 'diff') {
  const exprStr = args[1]
  if (!exprStr) error('Missing expression. Usage: derive diff <expr>')
  const varFlag = args.find(a => a.startsWith('--var='))
  const varName = varFlag ? varFlag.slice(6) : 'x'
  const showSteps = args.includes('--steps') || args.includes('-s')
  cmdDiff(exprStr, varName, showSteps)
} else if (cmd === 'eval') {
  const exprStr = args[1]
  if (!exprStr) error('Missing expression. Usage: derive eval <expr> var=val ...')
  const bindings = args.slice(2)
  if (bindings.length === 0) error('Missing variable bindings. Usage: derive eval <expr> x=5')
  cmdEval(exprStr, bindings)
} else if (cmd === 'simplify') {
  const exprStr = args[1]
  if (!exprStr) error('Missing expression. Usage: derive simplify <expr>')
  cmdSimplify(exprStr)
} else {
  // Try treating the entire command line as an expression to differentiate
  try {
    cmdDiff(args.join(' '), 'x', false)
  } catch {
    error(`Unknown command: ${cmd}. Run 'derive help' for usage.`)
  }
}
