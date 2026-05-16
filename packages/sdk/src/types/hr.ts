/**
 * HR types — People, Leaves, Attendance, Payroll.
 *
 * Canonical taxonomy mirrors Frihet ERP `apps/erp/types.ts` (LEAVE_TYPES, MOODS)
 * + `apps/erp/lib/leaveEntitlements.ts` (D2-HR1) + payroll export adapters (D2-HR2).
 *
 * These types are forward-declared in the SDK so external TypeScript integrations
 * compile against a stable shape even while the underlying REST endpoints land
 * incrementally on the server. Runtime values are not embedded here; the SDK
 * remains a thin HTTP client.
 */

// ---------------------------------------------------------------------------
// Leaves
// ---------------------------------------------------------------------------

/**
 * Canonical leave types. Mirrors `LEAVE_TYPES` in apps/erp/types.ts.
 * Backed by firestore.rules (D1-T3 unify) and Spanish ET art. 37+45.
 */
export type LeaveType =
  | 'vacation'
  | 'sick'
  | 'personal'
  | 'parental'
  | 'bereavement'
  | 'maternity'
  | 'paternity'
  | 'unpaid'
  | 'other';

export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

/**
 * Leave request. Mirrors `LeaveRequest` in apps/erp/types.ts.
 * Stored at `users/{uid}/leaveRequests/{id}` in Firestore.
 */
export interface LeaveRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  type: LeaveType;
  /** ISO date: YYYY-MM-DD */
  startDate: string;
  /** ISO date: YYYY-MM-DD */
  endDate: string;
  businessDays: number;
  status: LeaveStatus;
  comment?: string;
  approvedBy?: string;
  approvedByName?: string;
  /** ISO datetime */
  approvedAt?: string;
  rejectionReason?: string;
  /** ISO datetime */
  createdAt: string;
}

/**
 * Per-employee, per-year leave entitlement balance.
 * Mirrors the structure produced by `apps/erp/lib/leaveEntitlements.ts` (D2-HR1).
 *
 * `accrued` is the entitlement granted for the period (typically 22 working
 * days/year for Spain). `taken` is the sum of approved leaves of matching
 * type. `remaining = accrued - taken - pending` so the UI can show usable
 * balance without round-trips.
 */
export interface LeaveEntitlement {
  employeeId: string;
  /** Year as ISO: YYYY */
  year: string;
  type: LeaveType;
  accrued: number;
  taken: number;
  pending: number;
  remaining: number;
  /** ISO datetime — last recomputation */
  updatedAt?: string;
}

export interface CreateLeaveRequestParams {
  employeeId: string;
  type: LeaveType;
  startDate: string;
  endDate: string;
  comment?: string;
}

export interface LeaveListParams {
  employeeId?: string;
  status?: LeaveStatus;
  type?: LeaveType;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

// ---------------------------------------------------------------------------
// Attendance
// ---------------------------------------------------------------------------

/**
 * Canonical mood values. Mirrors `MOODS` in apps/erp/types.ts.
 * 4-state model wired in `ClockInWidget`; rules updated D1-T3.
 */
export type MoodValue = 'bad' | 'neutral' | 'good' | 'excellent';

export type DeviceType = 'desktop' | 'mobile' | 'tablet';
export type BreakType = 'lunch' | 'rest' | 'personal' | 'other';

export interface BreakEntry {
  id: string;
  /** ISO datetime */
  startTime: string;
  /** ISO datetime */
  endTime?: string;
  type: BreakType;
  durationMinutes?: number;
}

/**
 * Attendance entry — clocked time for one employee on one day.
 * Mirrors `AttendanceRecord` in apps/erp/types.ts.
 */
export interface AttendanceEntry {
  id: string;
  employeeId: string;
  /** ISO date: YYYY-MM-DD */
  date: string;
  /** ISO datetime */
  entryTime: string;
  /** ISO datetime */
  exitTime?: string;
  breaks: BreakEntry[];
  breakDurationMinutes: number;
  totalWorkedMinutes?: number;
  overtimeMinutes?: number;
  mood?: MoodValue;
  dailySummary?: string;
  task?: string;
  geoLocation?: { latitude: number; longitude: number; accuracy?: number };
  device: DeviceType;
  /** ISO datetime — set when auto-closed by the system */
  autoClosedAt?: string;
  autoCloseReason?: 'timeout' | 'midnight' | 'admin';
  hasPendingCorrection?: boolean;
  /** ISO datetime */
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Payroll
// ---------------------------------------------------------------------------

/**
 * Payroll export formats supported by Frihet's adapters (D2-HR2).
 * Each value maps to a Cloud Function that emits a vendor-specific file:
 *  - `a3`        → A3 Software (Wolters Kluwer) — `.dat`
 *  - `contasol`  → Sage Contasol — `.csv`
 *  - `sage`      → Sage 50 / Sage 200 — `.csv`
 *  - `holded`    → Holded payroll API — JSON
 *  - `siltra`    → Sistema de Liquidación Directa (TGSS) — XML
 */
export type PayrollExportFormat = 'a3' | 'contasol' | 'sage' | 'holded' | 'siltra';

/**
 * Per-employee payroll profile (D2-HR2). Captures the fiscal + contractual
 * data needed to emit a payroll export in any of the supported formats.
 * Stored at `users/{uid}/payrollProfiles/{employeeId}`.
 */
export interface PayrollProfile {
  employeeId: string;
  /** Spanish social security identifier (NAF — Número de Afiliación). */
  socialSecurityNumber?: string;
  /** Tax id (NIF / NIE / passport for residents). */
  taxId?: string;
  /** IRPF withholding rate, percentage (e.g. 15 = 15%). */
  irpfRate?: number;
  /** Gross monthly salary in EUR. */
  grossMonthlySalary?: number;
  /** Number of annual payment periods (12 or 14). */
  paymentPeriods?: 12 | 14;
  /** Convenio colectivo identifier (sector + provincia). */
  collectiveAgreementId?: string;
  /** Professional category within the convenio. */
  professionalCategory?: string;
  /** Contract group code per TGSS (Spain). */
  contributionGroup?: string;
  /** IBAN for payroll deposits. */
  bankAccount?: { iban: string; swift?: string };
  /** ISO datetime */
  updatedAt?: string;
}
