const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

export function bold(s: string): string { return `${BOLD}${s}${RESET}`; }
export function dim(s: string): string { return `${DIM}${s}${RESET}`; }
export function green(s: string): string { return `${GREEN}${s}${RESET}`; }
export function red(s: string): string { return `${RED}${s}${RESET}`; }
export function yellow(s: string): string { return `${YELLOW}${s}${RESET}`; }
export function cyan(s: string): string { return `${CYAN}${s}${RESET}`; }

export function eur(amount: number | undefined): string {
  if (amount === undefined || amount === null) return dim('--');
  return `EUR ${amount.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function table(rows: string[][], headers?: string[]): void {
  const allRows = headers ? [headers, ...rows] : rows;
  const colWidths: number[] = [];

  for (const row of allRows) {
    for (let i = 0; i < row.length; i++) {
      const stripped = stripAnsi(row[i] ?? '');
      colWidths[i] = Math.max(colWidths[i] ?? 0, stripped.length);
    }
  }

  for (let r = 0; r < allRows.length; r++) {
    const row = allRows[r]!;
    const line = row.map((cell, i) => {
      const stripped = stripAnsi(cell);
      const pad = (colWidths[i] ?? 0) - stripped.length;
      return cell + ' '.repeat(Math.max(0, pad));
    }).join('  ');
    console.log(line);

    if (r === 0 && headers) {
      console.log(colWidths.map(w => dim('-'.repeat(w))).join('  '));
    }
  }
}

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

export function success(msg: string): void {
  console.log(`${green('OK')} ${msg}`);
}

export function error(msg: string): void {
  console.error(`${red('Error')} ${msg}`);
}

export function outputJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

export function shouldOutputJson(): boolean {
  return process.argv.includes('--json');
}
