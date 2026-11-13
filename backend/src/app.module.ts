import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { BotsModule } from './bots/bots.module';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './db/database.module';
import { DiscoveryModule } from './discovery/discovery.module';
import { EventsModule } from './events/events.module';
import { HealthModule } from './health/health.module';
import { PingsModule } from './pings/pings.module';
import { PresenceModule } from './presence/presence.module';
import { ProfilesModule } from './profiles/profiles.module';
import { ResetModule } from './reset/reset.module';

/**
 * Grafo de la API. Modular por capacidad, no por tipo de archivo: cada módulo
 * agrupa lo suyo y exporta sólo lo que otro necesita.
 *
 *   ConfigModule   → configuración validada (global)
 *   DatabaseModule → Pool de `pg` (global)
 *   HealthModule   → /health y /health/ready (fuera del contrato)
 *   AuthModule     → sesión demo, logout, ticket de stream y sus guards
 *   BotsModule     → los 2 bots derivados de cada humano vivo (geometría y cap)
 *   EventsModule   → log de eventos, SSE, polling y ticker del mundo
 *   DiscoveryModule→ GET /discovery (radio, filtros y medidas por observador)
 *   PresenceModule → PUT y DELETE /presence (región y zona derivadas)
 *   ProfilesModule → GET /demo/profiles
 *   PingsModule    → POST/GET /pings y accept/reject (S4)
 *   ResetModule    → POST /demo/reset y /demo/reset/self (fuera del contrato)
 */
@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    HealthModule,
    AuthModule,
    BotsModule,
    EventsModule,
    DiscoveryModule,
    PresenceModule,
    ProfilesModule,
    PingsModule,
    ResetModule,
  ],
})
export class AppModule {}
