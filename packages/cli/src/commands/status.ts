import { Command } from 'commander';
import { Frihet } from '@frihet/sdk';
import { getApiKey, getBaseUrl } from '../config.js';
import { bold, dim, eur, green, red, yellow, error } from '../output.js';

export const statusCommand = new Command('status')
  .description('Quick business health check')
  .option('--month <month>', 'Month (YYYY-MM, defaults to current)')
  .action(async (opts: { month?: string }) => {
    try {
      const f = new Frihet({ apiKey: getApiKey(), baseUrl: getBaseUrl() });

      const [ctx, summary] = await Promise.all([
        f.intelligence.context(),
        f.intelligence.monthly(opts.month),
      ]);

      const business = ctx.business as Record<string, string> | undefined;
      const plan = ctx.plan as Record<string, string> | undefined;
      const month = ctx.currentMonth as Record<string, number> | undefined;

      console.log(bold(`${business?.businessName ?? 'Your Business'}`));
      console.log(dim(`Plan: ${plan?.plan ?? 'Free'} | ${summary.month ?? 'Current month'}\n`));

      // Revenue
      const rev = summary.revenue?.total ?? 0;
      const exp = summary.expenses?.total ?? 0;
      const net = summary.profit?.net ?? (rev - exp);
      console.log(`Revenue:   ${green(eur(rev))}`);
      console.log(`Expenses:  ${eur(exp)}`);
      console.log(`Net:       ${net >= 0 ? green(eur(net)) : red(eur(net))}`);

      // Overdue
      const overdue = (month as Record<string, number> | undefined);
      const overdueCount = overdue?.overdueCount ?? 0;
      const overdueTotal = overdue?.overdueTotal ?? 0;
      if (overdueCount > 0) {
        console.log(`\nOverdue:   ${red(`${overdueCount} invoices (${eur(overdueTotal)})`)}`);
      }

      // Tax liability
      if (summary.taxLiability) {
        const vatPayable = (summary.taxLiability as Record<string, number>).vatPayable ?? 0;
        if (vatPayable > 0) {
          console.log(`\nEstimated VAT: ${yellow(eur(vatPayable))}`);
        }
      }

      // Top clients
      if (summary.topClients?.length) {
        console.log(dim('\nTop clients:'));
        for (const tc of summary.topClients.slice(0, 3)) {
          console.log(`  ${tc.name}: ${eur(tc.total)}`);
        }
      }

      console.log(dim('\nhttps://app.frihet.io/dashboard'));
    } catch (err) {
      error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });
