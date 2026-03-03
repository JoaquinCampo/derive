# Derive

A symbolic differentiation engine for the terminal. It parses mathematical expressions, differentiates them symbolically, and shows the work — naming each rule applied and building toward the final result.

```
$ derive diff "x^3 - 3*x^2 + 2*x" --steps

  d/dx( x³ - 3x² + 2x )

    1. sum rule
       Sum rule: differentiate each term separately
       → 3x² - 6x + 2

    2. difference rule
       Difference rule: differentiate each term separately
       → 3x² - 6x

    3. constant multiple rule
       Constant multiple rule: pull the constant out

  = 3x² - 6x + 2
```

## Install

Requires [Bun](https://bun.sh).

```sh
git clone https://github.com/JoaquinCampo/derive.git
cd derive
```

No dependencies to install — it's all TypeScript, no external packages.

## Usage

```sh
bun src/cli.ts diff <expr> [--steps] [--var=x]
bun src/cli.ts eval <expr> <var=val>...
bun src/cli.ts simplify <expr>
bun src/cli.ts repl
```

Or with the alias:

```sh
alias derive="bun $(pwd)/src/cli.ts"
```

## Examples

**Product rule** — `x · ln(x)`:

```
$ derive diff "x*ln(x)" --steps

  d/dx( x · ln(x) )

    1. product rule
       Product rule: d/dx(f · g) = f' · g + f · g'
       → ln(x) + 1

    2. ln rule
       d/dx(ln(x)) = 1/u

  = ln(x) + 1
```

**Chain rule** — `exp(x²)`:

```
$ derive diff "exp(x^2)" --steps

  d/dx( exp(x²) )

    1. exp + chain rule
       Chain rule: d/dx(exp(u)) = exp(u) · u'
       → exp(x²) · 2x

    2. power rule
       Power rule: d/dx(x^n) = n · x^(n-1)

  = exp(x²) · 2x
```

**Trig product** — `sin(x) · cos(x)`:

```
$ derive diff "sin(x)*cos(x)" --steps

  d/dx( sin(x) · cos(x) )

    1. product rule
       Product rule: d/dx(f · g) = f' · g + f · g'
       → cos(x)² - sin(x)²

    2. sin rule
       d/dx(sin(x)) = cos(u)
       → cos(x)

    3. cos rule
       d/dx(cos(x)) = -sin(u)

  = cos(x)² - sin(x)²
```

**Evaluate** an expression at a point:

```
$ derive eval "x^2 - 4" x=3

  x² - 4  where x=3
  = 5
```

**Simplify** an expression:

```
$ derive simplify "x*1 + 0 + 2*x"

  x · 1 + 0 + 2x
  = 3x
```

## CLI commands

| Command | Description |
|---------|-------------|
| `diff <expr>` | Differentiate (default variable: `x`) |
| `eval <expr> x=n` | Evaluate with variable bindings |
| `simplify <expr>` | Algebraic simplification |
| `repl` | Interactive mode |
| `help` | Show usage |

**Flags:** `--steps` / `-s` for step-by-step output, `--var=t` to differentiate with respect to a different variable.

## REPL commands

Start with `derive repl`, then:

| Command | Description |
|---------|-------------|
| `<expr>` | Differentiate (default action) |
| `:diff <expr>` | Differentiate explicitly |
| `:eval <expr> x=n` | Evaluate |
| `:simplify <expr>` | Simplify |
| `:var <name>` | Change differentiation variable |
| `:steps` | Toggle step-by-step output |
| `:help` | Show commands |
| `:quit` | Exit |

## Supported syntax

**Operators:** `+`, `-`, `*`, `/`, `^`
**Functions:** `sin`, `cos`, `tan`, `ln`, `log`, `sqrt`, `exp`, `abs`
**Implicit multiplication:** `2x`, `3sin(x)`, `2(x+1)`
**Parentheses** for grouping

## How it works

The engine is built from five independent modules:

1. **Parser** (`src/parser.ts`) — A recursive descent parser that tokenizes input and produces a typed AST. Handles operator precedence, right-associative exponentiation, and implicit multiplication.

2. **Printer** (`src/printer.ts`) — Converts the AST back to readable notation with minimal parentheses, Unicode superscripts for small exponents (x² instead of x^2), and optional ANSI coloring.

3. **Differentiator** (`src/diff.ts`) — Recursive symbolic differentiation over the AST. Implements the standard rules (power, product, quotient, chain) and records each step with the rule name and explanation. Detects constant subexpressions to skip unnecessary work.

4. **Simplifier** (`src/simplify.ts`) — Bottom-up algebraic simplification applied repeatedly until the expression stabilizes. Handles constant folding, identity elimination (x + 0, x · 1), like-term collection, and double negation.

5. **Evaluator** (`src/eval.ts`) — Substitutes variable values and computes the numeric result.

The expression AST (`src/expr.ts`) is a tagged union — every node carries a `tag` discriminant, making pattern matching exhaustive and the tree easy to traverse.

## License

MIT
