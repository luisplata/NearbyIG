import { Inject, Injectable, Logger } from '@nestjs/common';
import { Pool } from 'pg';
import type { AuthContext } from '../auth/session.types';
import { AppProblemError } from '../common/problem';
import { isRecord, rejectUnknownKeys, validationFailed } from '../common/validation';
import { PG_POOL } from '../db/database.module';
import type { ReportReason, ReportReceipt } from './reports.types';

/** Un `profileId` de bot: `<owner>-b1` / `<owner>-b2`. */
const BOT_PROFILE_ID = /-b[12]$/;

const REASONS: readonly ReportReason[] = ['spam', 'harassment', 'inappropriate', 'impersonation', 'other'];

function canonicalProfileId(profileId: string): string {
  return profileId.replace(BOT_PROFILE_ID, '');
}

/** `ReportCreate` validado a mano: dos campos obligatorios y ninguno de más. */
function parseReport(body: unknown): { profileId: string; reason: ReportReason } {
  if (!isRecord(body)) {
    throw validationFailed('body debe ser un objeto JSON con profileId y reason.');
  }
  rejectUnknownKeys(body, ['profileId', 'reason']);

  const profileId = body['profileId'];
  if (typeof profileId !== 'string' || profileId.trim() === '') {
    throw validationFailed('profileId es obligatorio y debe ser un string no vacío.');
  }

  const reason = body['reason'];
  if (typeof reason !== 'string' || !REASONS.includes(reason as ReportReason)) {
    throw validationFailed(`reason debe ser uno de: ${REASONS.join(', ')}.`);
  }

  return { profileId, reason: reason as ReportReason };
}

interface ReportRow {
  report_id: string;
  created_at: Date;
}

/**
 * Reportes (Sprint 5, delta v0.5) — `contract/paths/reports.yaml`.
 *
 * **Registrar, no moderar.** Una fila por reporte y nada más: no hay estado,
 * consola ni lectura. La demo no tiene moderadores y un `GET /reports` sería una
 * bandeja de PII que nadie pidió.
 *
 * **Sin consecuencia automática.** Reportar no bloquea ni oculta al reportado:
 * eso lo decide el usuario con `POST /blocks`, que es otra acción. Tampoco
 * altera el descubrimiento de quien reporta.
 *
 * **Un bot se canoniza a su dueño**, como en el bloqueo: el bot no existe sin la
 * persona.
 *
 * **Sin PII en el acuse.** `ReportReceipt` lleva id y fecha; el motivo y el
 * perfil reportado se guardan en la tabla y no vuelven por HTTP.
 */
@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /** `POST /reports` → 202 `ReportReceipt`. */
  async create(session: AuthContext, body: unknown): Promise<ReportReceipt> {
    if (session.sourceType !== 'human') {
      throw new AppProblemError(
        'PROFILE_REQUIRED',
        'La sesión actual no tiene un perfil propio: un invitado no puede reportar.',
      );
    }

    const input = parseReport(body);
    const target = canonicalProfileId(input.profileId);
    if (target === session.profileId) {
      throw validationFailed('No podés reportarte a vos mismo.');
    }

    const exists = await this.pool.query(
      `SELECT 1 FROM profiles
        WHERE region_key = $1 AND profile_id = $2 AND source_type = 'human'`,
      [session.regionKey, target],
    );
    if ((exists.rowCount ?? 0) === 0) {
      throw new AppProblemError(
        'PROFILE_NOT_FOUND',
        'El perfil reportado no existe en esta región.',
      );
    }

    const { rows } = await this.pool.query<ReportRow>(
      `INSERT INTO reports (region_key, reporter_profile_id, reported_profile_id, reason)
       VALUES ($1, $2, $3, $4)
       RETURNING report_id, created_at`,
      [session.regionKey, session.profileId, target, input.reason],
    );
    const row = rows[0];
    if (row === undefined) {
      throw new AppProblemError('INTERNAL', 'El reporte no se pudo registrar.');
    }

    // Sin ids en el log: sólo región y motivo, que son el dato operativo.
    this.logger.log(`reporte registrado region=${session.regionKey} reason=${input.reason}`);
    return { reportId: row.report_id, createdAt: row.created_at.toISOString() };
  }
}
