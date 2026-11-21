/**
 * Banking rule helpers (`GET/POST /v1/banking/rules`).
 *
 * NOTE: `bankRuleSimulate` (`POST /v1/bank/rules/simulate`) was an optimistic
 * D4-C placeholder whose route does not exist on the Frihet API. Per runtime-
 * truth policy it is retained for source compatibility and fails closed locally
 * with {@link CapabilityUnavailableError} before any HTTP request is sent.
 */

import { CapabilityUnavailableError } from '../error.js';
import type {
  BankRule,
  BankRuleListParams,
  BankRuleSimulateResult,
  CreateBankRuleApiParams,
  CreateBankRuleParams,
} from '../types/banking.js';
import type { Page, RequestOptions } from '../types.js';
import type { HttpClientLike } from './leaves.js';

/**
 * Extended transport surface for endpoints that require a POST and JSON body.
 */
export interface HttpClientPostable extends HttpClientLike {}

/**
 * Minimal transport surface for paginated GET requests.
 */
export interface HttpClientPageable {
  getPage<T>(
    path: string,
    query?: Record<string, string | number | boolean | undefined>,
    opts?: RequestOptions,
  ): Promise<Page<T>>;
}

/**
 * List workspace bank rules ordered by priority descending.
 *
 * Maps to `GET /v1/banking/rules`.
 */
export function listBankRules(
  client: HttpClientPageable,
  params?: BankRuleListParams,
  opts?: RequestOptions,
): Promise<Page<BankRule>> {
  return client.getPage<BankRule>(
    '/banking/rules',
    params as Record<string, string | number | boolean | undefined>,
    opts,
  );
}

/**
 * Create a workspace bank rule in the live evaluator vocabulary
 * (`bankConditions` + `action` + `actionConfig`).
 *
 * Maps to `POST /v1/banking/rules`.
 */
export function createBankRule(
  client: HttpClientPostable,
  ruleData: CreateBankRuleApiParams,
  opts?: RequestOptions,
): Promise<BankRule> {
  return client.post<BankRule>('/banking/rules', ruleData, opts);
}

/**
 * @deprecated The Frihet API does not serve `POST /v1/bank/rules/simulate`.
 * Retained for source compatibility; fails locally with
 * {@link CapabilityUnavailableError} before any HTTP request is sent.
 * Use `frihet.banking.listRules()` / `frihet.banking.createRule()` (or
 * {@link listBankRules} / {@link createBankRule}) for the live `/v1/banking/rules`
 * endpoints.
 */
export function bankRuleSimulate(
  client: HttpClientPostable,
  ruleData: CreateBankRuleParams,
  opts?: RequestOptions,
): Promise<BankRuleSimulateResult> {
  void client;
  void ruleData;
  void opts;
  return Promise.reject(
    new CapabilityUnavailableError(
      'bankRuleSimulate (POST /bank/rules/simulate)',
      'absent',
      'Use GET/POST /v1/banking/rules via frihet.banking.listRules() or frihet.banking.createRule().',
    ),
  );
}
