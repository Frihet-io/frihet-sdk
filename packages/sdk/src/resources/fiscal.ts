import type { HttpClient } from '../client.js';
import type { RequestOptions, VerifactuStatusResult } from '../types.js';

const enc = encodeURIComponent;

/**
 * Fiscal compliance read/status endpoints (`/v1/fiscal/*`).
 */
export class Fiscal {
  constructor(private readonly _client: HttpClient) {}

  /**
   * Read the stored AEAT VeriFactu submission status for an invoice
   * (`GET /v1/fiscal/verifactu/:invoiceId/status`).
   * Read-only: reflects stored tracking fields and throws 404 when the invoice
   * does not exist or has no VeriFactu submission record.
   */
  verifactuStatus(invoiceId: string, opts?: RequestOptions): Promise<VerifactuStatusResult> {
    return this._client.get(`/fiscal/verifactu/${enc(invoiceId)}/status`, undefined, opts);
  }
}
