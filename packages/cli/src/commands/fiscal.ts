import { Command } from 'commander';
import { Frihet } from '@frihet/sdk';
import { getApiKey, getBaseUrl } from '../config.js';
import { bold, dim, green, red, yellow, error, outputJson, shouldOutputJson } from '../output.js';

function client(): Frihet {
  return new Frihet({ apiKey: getApiKey(), baseUrl: getBaseUrl() });
}

function fiscalStatusColor(status: string | null | undefined, accepted?: boolean): string {
  if (accepted === true || status === 'accepted') return green(status ?? 'accepted');
  if (status === 'rejected' || status === 'error' || status === 'halted') return red(status);
  if (status === 'pending' || status === 'submitted') return yellow(status);
  return status ?? dim('--');
}

const verifactuStatus = new Command('verifactu-status')
  .description('Check VeriFactu submission status for an invoice (read-only)')
  .argument('<invoiceId>', 'Invoice ID')
  .option('--json', 'Output as JSON')
  .action(async (invoiceId: string) => {
    try {
      const result = await client().fiscal.verifactuStatus(invoiceId);

      if (shouldOutputJson()) {
        outputJson(result);
        return;
      }

      console.log(bold(`VeriFactu — ${result.invoiceId}`));
      console.log(`Status:    ${fiscalStatusColor(result.status, result.accepted)}`);
      console.log(`Accepted:  ${result.accepted ? green('yes') : red('no')}`);
      console.log(`CSV:       ${result.csv ?? dim('--')}`);
      console.log(`Submitted: ${result.submittedAt ?? dim('--')}`);
      console.log(`Sandbox:   ${result.sandbox ? yellow('yes') : 'no'}`);
      console.log(`Retries:   ${result.retryCount}`);
      if (result.lastError) console.log(`Error:     ${red(result.lastError)}`);
      if (result.aeatWarnings?.length) {
        console.log(yellow(`\nAEAT warnings (${result.aeatWarnings.length}):`));
        for (const w of result.aeatWarnings) {
          console.log(`  ${w.code ?? '--'}: ${w.description ?? ''}`);
        }
      }
    } catch (err) {
      error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

const faceStatus = new Command('face-status')
  .description('Check FACe B2G submission status for an invoice (read-only)')
  .argument('<invoiceId>', 'Invoice ID')
  .option('--json', 'Output as JSON')
  .action(async (invoiceId: string) => {
    try {
      const result = await client().invoices.faceStatus(invoiceId);

      if (shouldOutputJson()) {
        outputJson(result);
        return;
      }

      console.log(bold(`FACe — ${invoiceId}`));
      console.log(`Registro:  ${result.numeroRegistro}`);
      console.log(`Estado:    ${result.estadoTramitacion ?? dim('--')}`);
      console.log(`Codigo:    ${result.codigo ?? dim('--')}`);
      console.log(`Desc:      ${result.descripcion ?? dim('--')}`);
      if (result.motivo) console.log(`Motivo:    ${yellow(result.motivo)}`);
    } catch (err) {
      error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

const ticketbaiStatus = new Command('ticketbai-status')
  .description('Check TicketBAI submission status for an invoice (read-only)')
  .argument('<invoiceId>', 'Invoice ID')
  .option('--json', 'Output as JSON')
  .action(async (invoiceId: string) => {
    try {
      const result = await client().invoices.ticketBaiStatus(invoiceId);

      if (shouldOutputJson()) {
        outputJson(result);
        return;
      }

      console.log(bold(`TicketBAI — ${invoiceId}`));
      console.log(`Status:    ${fiscalStatusColor(result.estado, result.accepted)}`);
      console.log(`Accepted:  ${result.accepted ? green('yes') : red('no')}`);
      console.log(`TBAI ID:   ${result.tbaiIdentifier}`);
      console.log(`CSV:       ${result.csv}`);
      console.log(`Submitted: ${result.submittedAt ?? dim('--')}`);
      if (result.qrUrl) console.log(`QR URL:    ${dim(result.qrUrl)}`);
      if (result.errors?.length) {
        console.log(red(`\nErrors (${result.errors.length}):`));
        for (const e of result.errors) {
          console.log(`  ${e}`);
        }
      }
    } catch (err) {
      error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

export const fiscalCommand = new Command('fiscal')
  .description('Check fiscal compliance status (VeriFactu, FACe, TicketBAI — read-only)')
  .addCommand(verifactuStatus)
  .addCommand(faceStatus)
  .addCommand(ticketbaiStatus);
