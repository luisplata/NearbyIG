import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { BotsService } from '../bots/bots.service';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/env';
import { EventsService } from './events.service';

/**
 * Ticker del mundo: reconcilia bots y los mueve un waypoint por vuelta.
 *
 * **Por qué un ticker y no "mover en la lectura".** El log es el artefacto y las
 * dos proyecciones lo leen: si el movimiento se calculara al leer, dos clientes
 * con el mismo cursor verían posiciones distintas para el mismo `seq`, y el
 * `id` dejaría de identificar un evento. El ticker escribe una vez y todas las
 * lecturas ven lo mismo.
 *
 * **Un solo proceso.** El compose corre una instancia de la API. Con más de una,
 * cada tick avanzaría el mundo (el `UPDATE` de waypoints es idempotente por
 * `leg_started_at`, así que el daño sería eventos duplicados, no corrupción);
 * el día que haya varias instancias esto se mueve a un job con lock. Se anota
 * como límite, no se resuelve antes de tener el problema.
 */
@Injectable()
export class WorldTickerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorldTickerService.name);
  private timer: NodeJS.Timeout | undefined;
  private ticking = false;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly bots: BotsService,
    private readonly events: EventsService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.tick();
    }, this.config.worldTickMs);
    // Un timer que mantiene vivo el proceso impediría un shutdown limpio.
    this.timer.unref();
    this.logger.log(
      `ticker activo cada ${this.config.worldTickMs} ms · tramo ${this.config.botLegSeconds} s`,
    );
  }

  onModuleDestroy(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
  }

  /**
   * Un tick: primero los bots que faltan, después el movimiento, después el log.
   *
   * El orden importa: se concilia antes de avanzar para que un humano que acaba
   * de registrar presencia ya tenga sus 2 bots en este tick, y se escribe el
   * evento después del `UPDATE` para que el payload refleje la posición que el
   * bot tiene cuando el evento existe.
   */
  async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const created = await this.bots.reconcile();
      const moved = await this.bots.advanceDue();
      for (const bot of moved) {
        await this.events.append(bot.regionKey, 'profile.moved', {
          profileId: bot.profileId,
          distanceM: bot.distanceM,
          bearingDeg: bot.bearingDeg,
        });
      }
      if (created > 0 || moved.length > 0) {
        this.logger.debug(`tick bots_nuevos=${created} movidos=${moved.length}`);
      }
    } catch (error) {
      // Un tick fallido no puede tumbar la API ni cortar los streams abiertos:
      // el siguiente tick vuelve a intentar y el log queda con el motivo.
      this.logger.warn(
        `tick fallido: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.ticking = false;
    }
  }
}
