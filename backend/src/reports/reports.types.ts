/**
 * Tipos de reporte, alineados con `contract/schemas/reports.yaml`.
 *
 * `ReportReceipt` es deliberadamente corto: id y fecha. Repetir el `profileId`
 * reportado o el motivo en el acuse convertiría cada reporte en una lectura de
 * PII, y el cliente ya sabe a quién reportó.
 */
export type ReportReason = 'spam' | 'harassment' | 'inappropriate' | 'impersonation' | 'other';

export interface ReportReceipt {
  readonly reportId: string;
  readonly createdAt: string;
}
