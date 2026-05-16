/**
 * Banking helpers — bank rule simulation (D2-BANK2).
 */

import type {
  BankRuleSimulateResult,
  CreateBankRuleParams,
} from '../types/banking.js';
import type { RequestOptions } from '../types.js';
import type { HttpClientLike } from './leaves.js';

/**
 * Extended transport surface for endpoints that require a POST and JSON body.
 */
export interface HttpClientPostable extends HttpClientLike {}

/**
 * Simulate a bank rule against the user's historical transactions WITHOUT
 * persisting the rule. Returns the match count plus a sample so the UI can
 * preview the impact before saving.
 *
 * Maps to `POST /v1/bank/rules/simulate`.
 *
 * @example
 * ```ts
 * const { matched, sample } = await bankRuleSimulate(client, {
 *   name: 'AWS hosting',
 *   priority: 100,
 *   isActive: true,
 *   conditions: [{ field: 'counterparty', operator: 'contains', value: 'AMAZON WEB' }],
 *   action: 'categorize_expense',
 *   actionConfig: { category: 'hosting' },
 * });
 * ```
 */
export function bankRuleSimulate(
  client: HttpClientPostable,
  ruleData: CreateBankRuleParams,
  opts?: RequestOptions,
): Promise<BankRuleSimulateResult> {
  return client.post<BankRuleSimulateResult>('/bank/rules/simulate', ruleData, opts);
}
