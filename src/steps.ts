import { Step } from './diff.js'
import { format, formatColored } from './printer.js'
import { Expr } from './expr.js'

// ANSI color codes
const RESET = '\x1b[0m'
const BOLD = '\x1b[1m'
const DIM = '\x1b[2m'
const CYAN = '\x1b[36m'
const YELLOW = '\x1b[33m'
const GREEN = '\x1b[32m'
const MAGENTA = '\x1b[35m'
const WHITE = '\x1b[37m'
const GRAY = '\x1b[90m'

// Format a differentiation result with steps for terminal display
export function formatSteps(
  original: Expr,
  varName: string,
  result: Expr,
  steps: Step[],
  colored: boolean = true
): string {
  const lines: string[] = []
  const fmt = colored ? formatColored : format

  // Header
  lines.push('')
  if (colored) {
    lines.push(`  ${DIM}d/d${varName}${RESET}${BOLD}( ${fmt(original)} ${BOLD})${RESET}`)
  } else {
    lines.push(`  d/d${varName}( ${fmt(original)} )`)
  }
  lines.push('')

  // Steps
  const topSteps = flattenSteps(steps)
  for (let i = 0; i < topSteps.length; i++) {
    const step = topSteps[i]
    const num = `${i + 1}.`
    const pad = ' '.repeat(4)

    if (colored) {
      lines.push(`${pad}${CYAN}${num}${RESET} ${GRAY}${step.rule} rule${RESET}`)
      lines.push(`${pad}   ${DIM}${step.explanation}${RESET}`)
      if (i < topSteps.length - 1) {
        lines.push(`${pad}   ${DIM}→${RESET} ${fmt(step.result)}`)
      }
    } else {
      lines.push(`${pad}${num} ${step.rule} rule`)
      lines.push(`${pad}   ${step.explanation}`)
      if (i < topSteps.length - 1) {
        lines.push(`${pad}   → ${fmt(step.result)}`)
      }
    }
    lines.push('')
  }

  // Result
  if (colored) {
    lines.push(`  ${BOLD}${GREEN}= ${fmt(result)}${RESET}`)
  } else {
    lines.push(`  = ${fmt(result)}`)
  }
  lines.push('')

  return lines.join('\n')
}

// Flatten nested steps into a readable sequence.
// We want the top-level narrative, not every sub-derivation.
function flattenSteps(steps: Step[]): Step[] {
  const flat: Step[] = []
  for (const step of steps) {
    // For compound rules (product, quotient, chain), show the main step
    // and optionally show interesting sub-steps
    flat.push(step)

    // Include sub-steps for complex rules to show the work
    if (step.children) {
      for (const childSteps of step.children) {
        for (const child of childSteps) {
          // Only include non-trivial sub-steps
          if (child.rule !== 'constant' && child.rule !== 'variable') {
            flat.push(child)
          }
        }
      }
    }
  }
  return flat
}

// Simple one-line formatting for quick display
export function formatResult(
  original: Expr,
  varName: string,
  result: Expr,
  colored: boolean = true
): string {
  const fmt = colored ? formatColored : format
  if (colored) {
    return `  ${DIM}d/d${varName}${RESET}( ${fmt(original)} ) ${GREEN}${BOLD}= ${fmt(result)}${RESET}`
  }
  return `  d/d${varName}( ${fmt(original)} ) = ${fmt(result)}`
}
