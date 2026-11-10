import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { origenesCors } from './comun/configuracion/cors';
import { PrismaExceptionFilter } from './comun/filtros/prisma-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new PrismaExceptionFilter());
  // En desarrollo se permite localhost. En producción se restringe a los
  // dominios de Vercel declarados en FRONTEND_URLS, separados por comas.
  app.enableCors({
    origin: origenesCors(),
    credentials: true,
  });

  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Plataforma EMSE - API Administrativa')
      .setDescription('API de administración y seguridad EMSE')
      .setVersion('2.0')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        'JWT-auth',
      )
      .build();
    SwaggerModule.setup(
      'api/documentacion',
      app,
      SwaggerModule.createDocument(app, config),
    );
  }
  const port = Number(process.env.PORT || 3001);
  // Escuchar en todas las interfaces permite acceder desde otros equipos de
  // la misma red local. El firewall de Windows sigue siendo la barrera de red.
  await app.listen(port, '0.0.0.0');
  console.log(`Servidor NestJS: http://localhost:${port}`);
  if (process.env.NODE_ENV !== 'production')
    console.log(`Swagger: http://localhost:${port}/api/documentacion`);
}
void bootstrap();
