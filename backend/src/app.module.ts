import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './db/database.module';
import { HealthModule } from './health/health.module';
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
 *   ProfilesModule → GET /demo/profiles
 *   ResetModule    → POST /demo/reset y /demo/reset/self (fuera del contrato)
 */
@Module({
  imports: [ConfigModule, DatabaseModule, HealthModule, AuthModule, ProfilesModule, ResetModule],
})
export class AppModule {}
