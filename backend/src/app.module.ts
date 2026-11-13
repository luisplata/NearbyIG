import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './db/database.module';
import { HealthModule } from './health/health.module';
import { ProfilesModule } from './profiles/profiles.module';

/**
 * Grafo de la API. Modular por capacidad, no por tipo de archivo: cada módulo
 * agrupa lo suyo y exporta sólo lo que otro necesita.
 *
 *   ConfigModule   → configuración validada (global)
 *   DatabaseModule → Pool de `pg` (global)
 *   HealthModule   → /health y /health/ready (fuera del contrato)
 *   AuthModule     → POST /auth/demo-session + guard `demoSession`
 *   ProfilesModule → GET /demo/profiles
 */
@Module({
  imports: [ConfigModule, DatabaseModule, HealthModule, AuthModule, ProfilesModule],
})
export class AppModule {}
