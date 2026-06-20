// -- SDK options --

export interface FrihetOptions {
  apiKey: string;
  baseUrl?: string;
  timeout?: number;
}

export interface RequestOptions {
  timeout?: number;
  idempotencyKey?: string;
  signal?: AbortSignal;
}

// -- API response envelope --

export interface Page<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
  nextCursor?: string;
}

// -- Pagination --

export interface ListParams {
  limit?: number;
  offset?: number;
  cursor?: string;
  fields?: string;
}

export interface DateFilterParams extends ListParams {
  from?: string;
  to?: string;
}

// -- Address --

export interface Address {
  street?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

// -- Line items --

export interface LineItem {
  description: string;
  quantity: number;
  unitPrice: number;
}

// -- Invoice --

export interface Invoice {
  id: string;
  documentNumber?: string;
  clientName: string;
  clientId?: string;
  clientAddress?: string | Address;
  clientTaxId?: string;
  clientLocation?: 'peninsula' | 'canarias' | 'ceuta_melilla' | 'eu' | 'world';
  items: LineItem[];
  issueDate?: string;
  dueDate?: string;
  status?: 'draft' | 'sent' | 'paid' | 'partial' | 'overdue' | 'cancelled';
  notes?: string;
  taxRate?: number;
  irpfRate?: number;
  equivalenceSurchargeRate?: number;
  prepayment?: number;
  seriesId?: string;
  total?: number;
  paymentUrl?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface InvoiceListParams extends DateFilterParams {
  status?: Invoice['status'];
  q?: string;
  clientId?: string;
  seriesId?: string;
}

export type CreateInvoiceParams = Pick<Invoice, 'clientName' | 'items'> &
  Partial<Pick<Invoice, 'clientId' | 'clientAddress' | 'clientTaxId' | 'clientLocation' | 'issueDate' | 'dueDate' | 'status' | 'notes' | 'taxRate' | 'irpfRate' | 'equivalenceSurchargeRate' | 'prepayment' | 'seriesId'>>;

export type UpdateInvoiceParams = Partial<CreateInvoiceParams>;

export interface SendInvoiceParams {
  recipientEmail: string;
  recipientName?: string;
  customMessage?: string;
  locale?: 'es' | 'en';
}

// -- Expense --

export interface Expense {
  id: string;
  description: string;
  amount: number;
  category?: string;
  date?: string;
  vendor?: string;
  vendorId?: string;
  invoiceNumber?: string;
  tax?: number;
  taxType?: 'IVA' | 'IGIC' | 'IPSI' | 'Exento';
  irpf?: number;
  isInvestmentGood?: boolean;
  taxDeductible?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface ExpenseListParams extends DateFilterParams {
  q?: string;
  vendorId?: string;
  category?: string;
}

export type CreateExpenseParams = Pick<Expense, 'description' | 'amount'> &
  Partial<Pick<Expense, 'category' | 'date' | 'vendor' | 'vendorId' | 'invoiceNumber' | 'tax' | 'taxType' | 'irpf' | 'isInvestmentGood' | 'taxDeductible'>>;

export type UpdateExpenseParams = Partial<CreateExpenseParams>;

// -- Client --

export interface Client {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  taxId?: string;
  website?: string;
  address?: string | Address;
  fiscalZone?: 'peninsula' | 'canarias' | 'ceuta_melilla' | 'eu' | 'world';
  clientType?: 'company' | 'individual';
  applyEquivalenceSurcharge?: boolean;
  stage?: 'lead' | 'contacted' | 'proposal' | 'active' | 'inactive' | 'lost';
  tags?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface ClientListParams extends ListParams {
  q?: string;
  stage?: Client['stage'];
}

export type CreateClientParams = Pick<Client, 'name'> &
  Partial<Pick<Client, 'email' | 'phone' | 'taxId' | 'website' | 'address' | 'fiscalZone' | 'clientType' | 'applyEquivalenceSurcharge' | 'stage' | 'tags'>>;

export type UpdateClientParams = Partial<CreateClientParams>;

// -- CRM: Client Contacts --

export interface ClientContact {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  role?: string;
  isPrimary?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export type CreateContactParams = Pick<ClientContact, 'name'> &
  Partial<Pick<ClientContact, 'email' | 'phone' | 'role' | 'isPrimary'>>;

export type UpdateContactParams = Partial<CreateContactParams>;

// -- CRM: Client Activities --

export type ActivityType =
  | 'call' | 'email' | 'meeting' | 'note_added' | 'task'
  | 'invoice_created' | 'invoice_sent' | 'invoice_paid' | 'invoice_overdue'
  | 'quote_created' | 'quote_accepted' | 'quote_rejected'
  | 'expense_logged';

export interface ClientActivity {
  id: string;
  type: ActivityType;
  title: string;
  description?: string;
  timestamp: string;
  metadata?: Record<string, string>;
  createdBy?: 'system' | 'user';
  createdAt?: string;
}

export type CreateActivityParams = Pick<ClientActivity, 'title'> & {
  type: 'call' | 'email' | 'meeting' | 'task';
  description?: string;
  metadata?: Record<string, string>;
};

// -- CRM: Client Notes --

export interface ClientNote {
  id: string;
  content: string;
  createdAt?: string;
  updatedAt?: string;
}

export type CreateNoteParams = Pick<ClientNote, 'content'>;
export type UpdateNoteParams = Partial<CreateNoteParams>;

// -- Vendor --

export interface Vendor {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  taxId?: string;
  address?: string | Address;
  createdAt?: string;
  updatedAt?: string;
}

export interface VendorListParams extends ListParams {
  q?: string;
}

export type CreateVendorParams = Pick<Vendor, 'name'> &
  Partial<Pick<Vendor, 'email' | 'phone' | 'taxId' | 'address'>>;

export type UpdateVendorParams = Partial<CreateVendorParams>;

// -- Product --

export interface Product {
  id: string;
  name: string;
  unitPrice: number;
  description?: string;
  sku?: string;
  category?: string;
  taxRate?: number;
  irpfRate?: number;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface ProductListParams extends ListParams {
  q?: string;
  isActive?: boolean;
}

export type CreateProductParams = Pick<Product, 'name' | 'unitPrice'> &
  Partial<Pick<Product, 'description' | 'sku' | 'category' | 'taxRate' | 'irpfRate' | 'isActive'>>;

export type UpdateProductParams = Partial<CreateProductParams>;

// -- Quote --

export interface Quote {
  id: string;
  documentNumber?: string;
  clientName: string;
  clientId?: string;
  items: LineItem[];
  validUntil?: string;
  notes?: string;
  status?: 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired' | 'cancelled';
  taxRate?: number;
  total?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface QuoteListParams extends DateFilterParams {
  status?: Quote['status'];
  q?: string;
  clientId?: string;
  seriesId?: string;
}

export type CreateQuoteParams = Pick<Quote, 'clientName' | 'items'> &
  Partial<Pick<Quote, 'clientId' | 'validUntil' | 'notes' | 'status' | 'taxRate'>>;

export type UpdateQuoteParams = Partial<CreateQuoteParams>;

// -- Webhook --

export type WebhookEvent =
  | 'invoice.created' | 'invoice.updated' | 'invoice.paid' | 'invoice.overdue'
  | 'expense.created' | 'expense.updated'
  | 'quote.created' | 'quote.updated' | 'quote.accepted' | 'quote.rejected'
  | 'client.created' | 'client.updated'
  | 'product.created' | 'product.updated';

export interface Webhook {
  id: string;
  name?: string;
  url: string;
  events: WebhookEvent[];
  status?: 'active' | 'inactive' | 'paused';
  secret?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface WebhookListParams extends ListParams {}

export type CreateWebhookParams = Pick<Webhook, 'url' | 'events'> &
  Partial<Pick<Webhook, 'name' | 'status' | 'secret'>>;

export type UpdateWebhookParams = Partial<CreateWebhookParams>;

// -- Intelligence --

export interface BusinessContext {
  business: Record<string, unknown>;
  defaults: Record<string, unknown>;
  plan: Record<string, unknown>;
  series: Record<string, unknown>[];
  recentActivity: Record<string, unknown>;
  topClients: Record<string, unknown>[];
  currentMonth: Record<string, unknown>;
}

export interface MonthlySummary {
  month: string;
  revenue: { total: number; taxBase: number; tax: number; irpf: number };
  expenses: { total: number; deductible: number; tax: number };
  profit: { gross: number; net: number };
  invoices: Record<string, number>;
  topClients: { name: string; total: number }[];
  expensesByCategory: { category: string; amount: number }[];
  taxLiability: Record<string, number>;
}

export interface QuarterlyTaxes {
  quarter: string;
  periods: string[];
  modelo303: {
    baseImponible: number;
    cuotaRepercutida: number;
    baseDeducible: number;
    cuotaDeducible: number;
    resultado: number;
  };
  modelo130: {
    ingresos: number;
    gastos: number;
    rendimientoNeto: number;
    pagoFraccionado: number;
  };
  summary: Record<string, number>;
}

export interface FinancialSummary {
  revenue: { invoiced: number; paid: number; pending: number; overdue: number };
  expenses: number;
  profit: number;
  counts: Record<string, number>;
  invoiceStatus: Record<string, number>;
  overdue: { count: number; total: number };
}

export interface SummaryParams {
  from?: string;
  to?: string;
}

// -- Action results --

export interface MarkPaidResult {
  success?: boolean;
  message?: string;
  status: string;
  paidAt?: string;
}

export interface SendResult {
  success: boolean;
  messageId: string;
}

// ---------------------------------------------------------------------------
// -- Stay (Hospitality) — Phase 4 app-kit G6 scaffold
// ---------------------------------------------------------------------------

export type StayPropertyType = 'apartment' | 'house' | 'room' | 'villa' | 'hotel_room' | 'hostel_bed';
export type StayReservationStatus = 'pending' | 'confirmed' | 'checked_in' | 'checked_out' | 'cancelled' | 'no_show';
export type StayComplianceReportType = 'ses' | 'alloggiati' | 'mossos' | 'ertzaintza' | 'policía_nacional' | 'custom';
export type StaySettlementStatus = 'draft' | 'confirmed' | 'paid' | 'disputed';
export type StayCleaningTaskStatus = 'pending' | 'in_progress' | 'done' | 'skipped';

// -- Stay (top-level domain entity) --

export interface Stay {
  id: string;
  name: string;
  description?: string;
  status?: 'active' | 'inactive' | 'archived';
  workspaceUid: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface StayListParams extends ListParams {
  q?: string;
  status?: Stay['status'];
}

export type CreateStayParams = Pick<Stay, 'name'> &
  Partial<Pick<Stay, 'description' | 'status'>>;

export type UpdateStayParams = Partial<CreateStayParams>;

// -- StayProperty --

export interface StayProperty {
  id: string;
  stayId?: string;
  name: string;
  type: StayPropertyType;
  address?: string | Address;
  maxGuests?: number;
  bedrooms?: number;
  bathrooms?: number;
  checkInTime?: string;
  checkOutTime?: string;
  licenseNumber?: string;
  taxRate?: number;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface StayPropertyListParams extends ListParams {
  q?: string;
  type?: StayPropertyType;
  isActive?: boolean;
}

export type CreateStayPropertyParams = Pick<StayProperty, 'name' | 'type'> &
  Partial<Pick<StayProperty, 'stayId' | 'address' | 'maxGuests' | 'bedrooms' | 'bathrooms' | 'checkInTime' | 'checkOutTime' | 'licenseNumber' | 'taxRate' | 'isActive'>>;

export type UpdateStayPropertyParams = Partial<CreateStayPropertyParams>;

// -- StayReservation --

export interface StayReservation {
  id: string;
  propertyId: string;
  guestName: string;
  guestEmail?: string;
  guestPhone?: string;
  guestIdNumber?: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  children?: number;
  status: StayReservationStatus;
  totalAmount?: number;
  paidAmount?: number;
  channel?: string;
  channelBookingRef?: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface StayReservationListParams extends DateFilterParams {
  q?: string;
  propertyId?: string;
  status?: StayReservationStatus;
  channel?: string;
}

export type CreateStayReservationParams = Pick<StayReservation, 'propertyId' | 'guestName' | 'checkIn' | 'checkOut' | 'adults'> &
  Partial<Pick<StayReservation, 'guestEmail' | 'guestPhone' | 'guestIdNumber' | 'children' | 'status' | 'totalAmount' | 'paidAmount' | 'channel' | 'channelBookingRef' | 'notes'>>;

export type UpdateStayReservationParams = Partial<CreateStayReservationParams>;

// -- StayExpense (hospitality-specific expenses) --

export interface StayExpense {
  id: string;
  propertyId?: string;
  reservationId?: string;
  description: string;
  amount: number;
  category?: string;
  date?: string;
  vendor?: string;
  taxDeductible?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface StayExpenseListParams extends DateFilterParams {
  q?: string;
  propertyId?: string;
  reservationId?: string;
  category?: string;
}

export type CreateStayExpenseParams = Pick<StayExpense, 'description' | 'amount'> &
  Partial<Pick<StayExpense, 'propertyId' | 'reservationId' | 'category' | 'date' | 'vendor' | 'taxDeductible'>>;

export type UpdateStayExpenseParams = Partial<CreateStayExpenseParams>;

// -- StayCleaningTask --

export interface StayCleaningTask {
  id: string;
  propertyId: string;
  reservationId?: string;
  scheduledDate: string;
  status: StayCleaningTaskStatus;
  assignedTo?: string;
  notes?: string;
  completedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface StayCleaningTaskListParams extends DateFilterParams {
  propertyId?: string;
  status?: StayCleaningTaskStatus;
  assignedTo?: string;
}

export type CreateStayCleaningTaskParams = Pick<StayCleaningTask, 'propertyId' | 'scheduledDate'> &
  Partial<Pick<StayCleaningTask, 'reservationId' | 'status' | 'assignedTo' | 'notes'>>;

export type UpdateStayCleaningTaskParams = Partial<CreateStayCleaningTaskParams>;

// -- StaySettlement (owner payouts) --

export interface StaySettlement {
  id: string;
  propertyId: string;
  periodFrom: string;
  periodTo: string;
  status: StaySettlementStatus;
  grossRevenue?: number;
  managementFee?: number;
  expenses?: number;
  ownerPayout?: number;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface StaySettlementListParams extends DateFilterParams {
  propertyId?: string;
  status?: StaySettlementStatus;
}

export type CreateStaySettlementParams = Pick<StaySettlement, 'propertyId' | 'periodFrom' | 'periodTo'> &
  Partial<Pick<StaySettlement, 'status' | 'grossRevenue' | 'managementFee' | 'expenses' | 'ownerPayout' | 'notes'>>;

export type UpdateStaySettlementParams = Partial<CreateStaySettlementParams>;

// -- StayCompliance (SES/Alloggiati/Policía Nacional police reports) --

export interface StayCompliance {
  id: string;
  reservationId: string;
  propertyId: string;
  reportType: StayComplianceReportType;
  status: 'pending' | 'submitted' | 'accepted' | 'rejected' | 'error';
  submittedAt?: string;
  referenceNumber?: string;
  errorMessage?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface StayComplianceListParams extends DateFilterParams {
  reservationId?: string;
  propertyId?: string;
  reportType?: StayComplianceReportType;
  status?: StayCompliance['status'];
}

export type CreateStayComplianceParams = Pick<StayCompliance, 'reservationId' | 'propertyId' | 'reportType'> &
  Partial<Pick<StayCompliance, 'status'>>;

export type UpdateStayComplianceParams = Partial<Pick<StayCompliance, 'status' | 'referenceNumber' | 'errorMessage'>>;

// -- Batch --

export interface BatchResultItem<T> {
  index: number;
  success: boolean;
  data?: T;
  error?: string;
}

export interface BatchResult<T> {
  data: BatchResultItem<T>[];
  summary: { total: number; succeeded: number; failed: number };
}

// ---------------------------------------------------------------------------
// -- Invoice credit notes + late fees (Spanish factura rectificativa)
// ---------------------------------------------------------------------------

/**
 * Params for creating a credit note (factura rectificativa) against an issued
 * invoice. The invoice must NOT be in `draft` or `cancelled` state.
 * Mirrors the `.strict()` Zod schema in publicApi.ts (POST /invoices/:id/credit-note).
 */
export interface CreateCreditNoteParams {
  /** Rectification reason — maps to AEAT rectificativa type codes server-side. */
  reason: 'refund' | 'discount' | 'error' | 'cancellation' | 'other';
  /** Optional free-text explanation (max 500 chars). */
  reasonDescription?: string;
  /** Full credit (`true`, default) vs partial credit (`false`). */
  fullCredit?: boolean;
  /** Issue date (YYYY-MM-DD). Defaults to today server-side. */
  issueDate?: string;
}

export interface CreditNoteResult {
  success: boolean;
  creditNote: {
    id: string;
    documentNumber: string;
    originalInvoiceId: string;
    reason: CreateCreditNoteParams['reason'];
    fullCredit: boolean;
  };
}

/**
 * Params for applying a late fee to an overdue (or sent) invoice. Both fields
 * are optional — omit `amount` to let the server auto-calculate using the EU
 * Late Payment Directive default rate (8% annual). Mirrors the `.strict()` Zod
 * schema in publicApi.ts (POST /invoices/:id/late-fee).
 */
export interface LateFeeParams {
  /** Explicit fee amount. If omitted, auto-calculated. Must be positive. */
  amount?: number;
  /** Override the number of days overdue. Must be a positive integer. */
  daysOverdue?: number;
}

export interface LateFeeResult {
  success: boolean;
  feeAmount: number;
  invoiceId: string;
  daysOverdue: number;
}

// ---------------------------------------------------------------------------
// -- Expense billable flag
// ---------------------------------------------------------------------------

/**
 * Params for marking an expense billable to a client. Mirrors the `.strict()`
 * Zod schema in publicApi.ts (POST /expenses/:id/billable). `clientId` is
 * required by the server.
 */
export interface MarkExpenseBillableParams {
  /** Client the expense will be re-billed to. Required (1–128 chars). */
  clientId: string;
  /** Optional markup percentage (0–1000). */
  markup?: number;
}

// ---------------------------------------------------------------------------
// -- Channels (Stay distribution channel feeds) — TOP-LEVEL /channels
// ---------------------------------------------------------------------------
//
// Channels are a Stay-module resource routed at the TOP level (/v1/channels,
// see ALLOWED_RESOURCES in publicApi.ts:226), NOT under /stay. They model an
// iCal / API feed binding a Stay property to an OTA (Airbnb, Booking, etc.).

/** Feed direction. Mirrors publicApi.ts:616 create-schema enum. */
export type ChannelType = 'ical_import' | 'ical_export' | 'api';

/**
 * Channel status. The create-schema enum is `active | paused | error`
 * (publicApi.ts:618). NOTE: the LIST status-filter set (publicApi.ts:320) is
 * also `active | paused | error`; the read serializer passes `status` through
 * verbatim, so these are the only values the server emits.
 */
export type ChannelStatus = 'active' | 'paused' | 'error';

/** A channel feed (serialized shape — publicApi.ts:5368). */
export interface Channel {
  id: string;
  propertyId: string;
  name: string;
  type: ChannelType;
  feedUrl: string | null;
  status: ChannelStatus;
  /** ISO timestamp of last sync, or null if never synced. */
  lastSync: string | null;
  lastSyncEvents: number;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Create-channel body. Mirrors the `.strict()` Zod schema in publicApi.ts:613.
 * `propertyId` + `name` are required; `type` defaults to `ical_import` and
 * `status` to `active` server-side.
 */
export interface CreateChannelParams {
  propertyId: string;
  name: string;
  type?: ChannelType;
  feedUrl?: string;
  status?: ChannelStatus;
}

/** Update-channel body — partial of the create shape. */
export type UpdateChannelParams = Partial<CreateChannelParams>;

export interface ChannelListParams extends ListParams {
  q?: string;
  propertyId?: string;
  status?: ChannelStatus;
}

/** Result of POST /v1/channels/:id/sync (publicApi.ts:4975). */
export interface ChannelSyncResult {
  success: boolean;
  message: string;
  channelId: string;
}

// ---------------------------------------------------------------------------
// -- Fiscal Modelo 303 / 130 / 390 — READ-ONLY summaries (never filed to AEAT)
// ---------------------------------------------------------------------------
//
// These types mirror functions/src/fiscalModelo303.ts (canonical engine) and
// the projected views returned by GET /v1/fiscal/modelo/{303,130,390}.
//
// READ-ONLY by design: the endpoint aggregates already-stored invoices and
// expenses and returns the *calculated* periodic VAT/IRPF summary a
// freelancer/SME would report. It NEVER presents, signs, or transmits anything
// to AEAT — presenting a Modelo is an irreversible fiscal act kept out of this
// API. Every payload carries `readonly: true` + a `note` to that effect so a
// consumer can never mistake it for a filing.

export type FiscalModelo = '303' | '130' | '390';

/** Operations in OTHER taxes (IGIC/IPSI) — NOT part of the 303 self-assessment. */
export interface FiscalOutOfScope {
  igic: { base: number; cuota: number };
  ipsi: { base: number; cuota: number };
}

/** Modelo 303 result block (IVA self-assessment). */
export interface Modelo303Result {
  /** IVA devengado (output VAT) — operaciones interiores sujetas a IVA. */
  baseImponible: number;
  cuotaRepercutida: number;
  /** IVA deducible (input VAT) on deductible IVA expenses. */
  baseDeducible: number;
  cuotaDeducible: number;
  /** resultado = cuotaRepercutida − cuotaDeducible (positive = to pay). */
  resultado: number;
  /** Base of exempt operations (reported, zero cuota). */
  baseExenta: number;
  /** Base of intra-community / export / reverse-charge (ISP) operations. */
  baseNoSujetaORC: number;
  outOfScope: FiscalOutOfScope;
}

/** Modelo 130 result block (IRPF pago fraccionado, estimación directa). */
export interface Modelo130Result {
  ingresos: number;
  gastos: number;
  rendimientoNeto: number;
  /** Pago fraccionado IRPF (20% of net income, simplified). */
  pagoFraccionado: number;
  /** IRPF withheld by clients on issued invoices (reduces the amount due). */
  retencionesSoportadas: number;
}

/** Modelo 390 result block (annual IVA recap). */
export interface Modelo390Result {
  baseImponible: number;
  cuotaRepercutida: number;
  baseDeducible: number;
  cuotaDeducible: number;
  resultadoAnual: number;
  baseExenta: number;
  baseNoSujetaORC: number;
  outOfScope: FiscalOutOfScope;
}

/** Aggregate counts shared by every Modelo summary projection. */
export interface FiscalModeloSummary {
  totalRevenue: number;
  totalExpenses: number;
  invoiceCount: number;
  expenseCount: number;
  clientCount: number;
}

export interface Modelo303Summary {
  model: '303';
  period: string;
  months: string[];
  modelo303: Modelo303Result;
  summary: FiscalModeloSummary;
  /** Always `true`. This payload is a summary, NOT a filed declaration. */
  readonly: true;
  /** Human-readable reminder: "Not presented or submitted to AEAT." */
  note: string;
}

export interface Modelo130Summary {
  model: '130';
  period: string;
  months: string[];
  modelo130: Modelo130Result;
  summary: FiscalModeloSummary;
  readonly: true;
  note: string;
}

export interface Modelo390Summary {
  model: '390';
  period: string;
  months: string[];
  modelo390: Modelo390Result;
  summary: FiscalModeloSummary;
  readonly: true;
  note: string;
}

/** `?quarter=YYYY-Q[1-4]` for 303/130. Defaults to the current quarter. */
export interface FiscalQuarterParams {
  quarter?: string;
}

/** `?year=YYYY` for 390. Defaults to the current year. */
export interface FiscalYearParams {
  year?: string;
}

// ---------------------------------------------------------------------------
// -- Deposits (customer deposits / down-payments — MONEY MOVEMENT)
// ---------------------------------------------------------------------------

export type DepositStatus = 'active' | 'partially_applied' | 'fully_applied' | 'refunded';

/** A single application of a deposit against an invoice. */
export interface DepositApplication {
  invoiceId: string;
  invoiceNumber: string;
  amount: number;
  appliedAt: string;
}

export interface Deposit {
  id: string;
  clientId: string;
  clientName: string;
  amount: number;
  currency: string;
  description: string;
  receivedDate: string;
  paymentMethod?: string;
  paymentReference?: string;
  status: DepositStatus;
  appliedAmount: number;
  remainingBalance: number;
  applications: DepositApplication[];
  refundedAmount?: number;
  refundedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface DepositListParams extends DateFilterParams {
  q?: string;
  clientId?: string;
  status?: DepositStatus;
}

/**
 * Create-deposit params. Mirrors the `.strict()` Zod schema in publicApi.ts
 * AND the firestore.rules `create` allowedKeys for /deposits. `status`,
 * `appliedAmount`, `remainingBalance`, `applications` are set server-side.
 */
export interface CreateDepositParams {
  clientId: string;
  clientName: string;
  amount: number;
  /** ISO 4217 3-letter code. Defaults to 'EUR' server-side. */
  currency?: string;
  description: string;
  /** Date received (YYYY-MM-DD). */
  receivedDate: string;
  paymentMethod?: string;
  paymentReference?: string;
}

/**
 * Apply-deposit body. ALL THREE fields are MANDATORY (the server schema is
 * `.strict()`: invoiceId min1/max128 + invoiceNumber min1/max200 + amount
 * positive — publicApi.ts:4245). Sending any extra field is rejected with 400.
 */
export interface DepositApplyParams {
  invoiceId: string;
  invoiceNumber: string;
  amount: number;
}

/**
 * Apply-deposit result (publicApi.ts:4280). NOTE: `appliedAmount` here is the
 * amount applied in THIS call (not the cumulative `Deposit.appliedAmount`).
 */
export interface DepositApplyResult {
  success: boolean;
  depositId: string;
  appliedAmount: number;
  remainingBalance: number;
  status: DepositStatus;
}

/**
 * Refund-deposit body. Accepts ONLY an optional `amount` (`.strict()` schema —
 * publicApi.ts:4287). Adding any other field (e.g. `reason`) is rejected with
 * 400. Omit `amount` to refund the entire remaining balance.
 */
export interface DepositRefundParams {
  amount?: number;
}

export interface DepositRefundResult {
  success: boolean;
  depositId: string;
  refundedAmount: number;
  remainingBalance: number;
}

/** @deprecated Use {@link DepositApplyParams}. */
export type ApplyDepositParams = DepositApplyParams;
/** @deprecated Use {@link DepositApplyResult}. */
export type ApplyDepositResult = DepositApplyResult;
/** @deprecated Use {@link DepositRefundParams}. */
export type RefundDepositParams = DepositRefundParams;
/** @deprecated Use {@link DepositRefundResult}. */
export type RefundDepositResult = DepositRefundResult;

// ---------------------------------------------------------------------------
// -- Team (members + invitations + roles). Server enforces plan seat caps.
// ---------------------------------------------------------------------------

export type TeamRole = 'owner' | 'admin' | 'member' | 'viewer' | 'editor' | 'accountant';
export type TeamMemberStatus = 'active' | 'pending';

export interface TeamMember {
  id: string;
  email: string | null;
  name: string | null;
  role: TeamRole;
  status: TeamMemberStatus;
  /** Present on active members. */
  joinedAt?: string | null;
  /** Present on pending invitations. */
  invitedAt?: string | null;
  expiresAt?: string | null;
}

export interface TeamMemberListParams extends ListParams {
  role?: TeamRole;
  status?: TeamMemberStatus;
}

/**
 * Result of GET /v1/team/members — active members + pending invitations merged
 * into one list, paginated server-side (publicApi.ts:2696-2712). The list is a
 * standard `{ data, total, limit, offset }` envelope, so consumers use
 * `Page<TeamMember>`; this alias documents that intent.
 */
export type ListMembersResult = Page<TeamMember>;

/**
 * Invite-member body. The `accountant` role is seat-exempt; every other role
 * consumes a plan seat. Mirrors the `.strict()` Zod schema in publicApi.ts:2718
 * (email max255, role enum WITHOUT `owner`, name max200 optional).
 */
export interface TeamInviteParams {
  email: string;
  role: 'admin' | 'member' | 'viewer' | 'editor' | 'accountant';
  name?: string;
}

/** @deprecated Use {@link TeamInviteParams}. */
export type InviteTeamMemberParams = TeamInviteParams;

export interface TeamInviteResult {
  id: string;
  email: string;
  role: TeamRole;
  name: string | null;
  status: 'pending';
  expiresAt: string;
}

export type SetTeamRole = 'admin' | 'member' | 'viewer' | 'editor' | 'accountant';

export interface SetTeamRoleResult {
  id: string;
  role: TeamRole;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// -- Gestoria (accountant) — consolidated receivables aging across workspaces
// ---------------------------------------------------------------------------
//
// POST /v1/gestoria/aging (publicApi.ts:3397). Read-only multi-workspace
// receivables aging for external accountants. The server silently rejects
// workspaces the caller is not a member of (listed in `rejectedWorkspaceIds`)
// — never returning unauthorised data. Shapes mirror gestoriaAging.ts:40-76.

export interface AgingBuckets {
  current: number;
  days1_30: number;
  days31_60: number;
  days61_90: number;
  days90plus: number;
}

export interface TopDebtor {
  clientId: string;
  clientName: string;
  totalOutstanding: number;
  daysOldestInvoice: number;
  invoiceCount: number;
}

export interface WorkspaceAgingSummary {
  workspaceId: string;
  ownerName: string;
  buckets: AgingBuckets;
  grandTotal: number;
  totalOverdue: number;
  topDebtors: TopDebtor[];
  asOf: string;
  /** Most common currency across invoices in this workspace. */
  currency: string;
}

export interface ConsolidatedAgingReport {
  workspaces: WorkspaceAgingSummary[];
  /** Workspaces the caller is NOT a member of — rejected, no data returned. */
  rejectedWorkspaceIds: string[];
  consolidatedBuckets: AgingBuckets;
  consolidatedTotal: number;
  consolidatedOverdue: number;
  asOf: string;
  generatedAt: string;
}

/**
 * Body for POST /v1/gestoria/aging. Mirrors the `.strict()` Zod schema in
 * publicApi.ts:3403: `workspaceIds` 1–200 ids (each 1–1500 chars), optional
 * `asOf` (YYYY-MM-DD), optional `bustCache` (honoured only on the callable CF;
 * the REST path always computes fresh).
 */
export interface GestoriaAgingParams {
  workspaceIds: string[];
  asOf?: string;
  bustCache?: boolean;
}
