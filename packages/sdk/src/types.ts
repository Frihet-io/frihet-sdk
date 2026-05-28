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
