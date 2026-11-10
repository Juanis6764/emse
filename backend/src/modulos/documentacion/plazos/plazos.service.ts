import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

export type EstadoPlazoCalculado =
  | 'PENDIENTE'
  | 'VENCIDO'
  | 'CUMPLIDO'
  | 'CUMPLIDO_CON_RETRASO';

export type SituacionPlazoDocumental =
  | 'SIN_PLAZO'
  | 'EN_PLAZO'
  | 'PROXIMO_A_VENCER'
  | 'VENCE_HOY'
  | 'VENCIDO'
  | 'CUMPLIDO'
  | 'CUMPLIDO_TARDE';

/** Un plazo de una visita anterior no vuelve a regir cuando el expediente retorna. */
export function perteneceAVisitaActual(
  plazo: { id_seccion_responsable: number; proveido: { fecha_hora: Date } },
  idSeccionActual: number,
  ultimaSalida: Date | null,
): boolean {
  return (
    plazo.id_seccion_responsable === idSeccionActual &&
    (!ultimaSalida || plazo.proveido.fecha_hora >= ultimaSalida)
  );
}

/**
 * El estado del plazo NUNCA se almacena: se deriva en el momento a partir
 * de `fecha_hora_limite` + `fecha_hora_cumplimiento` + la hora actual (ver
 * justificación en el diseño de FASE 1). Este servicio es la única fuente
 * de esa lógica para no duplicarla en trazabilidad/reportes/scheduler.
 */
@Injectable()
export class PlazosService {
  constructor(private readonly prisma: PrismaService) {}

  calcularEstado(
    plazo: { fecha_hora_limite: Date; fecha_hora_cumplimiento: Date | null },
    ahora: Date = new Date(),
  ): EstadoPlazoCalculado {
    if (plazo.fecha_hora_cumplimiento) {
      return plazo.fecha_hora_cumplimiento <= plazo.fecha_hora_limite
        ? 'CUMPLIDO'
        : 'CUMPLIDO_CON_RETRASO';
    }
    return ahora > plazo.fecha_hora_limite ? 'VENCIDO' : 'PENDIENTE';
  }

  /**
   * Clasificación de presentación para seguimiento. El estado base sigue
   * siendo calcularEstado(); estos subestados solo sirven para filtros y
   * alertas visuales, nunca se almacenan en la base de datos.
   */
  calcularSituacion(
    plazo: { fecha_hora_limite: Date; fecha_hora_cumplimiento: Date | null } | null,
    ahora: Date = new Date(),
  ): SituacionPlazoDocumental {
    if (!plazo) return 'SIN_PLAZO';

    const estado = this.calcularEstado(plazo, ahora);
    if (estado === 'VENCIDO') return 'VENCIDO';
    if (estado === 'CUMPLIDO') return 'CUMPLIDO';
    if (estado === 'CUMPLIDO_CON_RETRASO') return 'CUMPLIDO_TARDE';

    const limite = plazo.fecha_hora_limite;
    const mismaFecha =
      limite.getFullYear() === ahora.getFullYear() &&
      limite.getMonth() === ahora.getMonth() &&
      limite.getDate() === ahora.getDate();
    if (mismaFecha) return 'VENCE_HOY';
    if (limite.getTime() - ahora.getTime() <= 24 * 60 * 60 * 1000) {
      return 'PROXIMO_A_VENCER';
    }
    return 'EN_PLAZO';
  }

  /**
   * El plazo vigente para el área que atiende actualmente el expediente:
   * el del proveído más reciente cuya `id_seccion_responsable` coincide
   * con `ExpedienteDocumento.id_seccion_actual` (regla documentada en
   * FASE 1 — no es necesariamente el último proveído registrado, sino el
   * que le corresponde a quien tiene el documento ahora).
   */
  async obtenerPlazoVigente(idDocumento: number) {
    const expediente = await this.prisma.expedienteDocumento.findUnique({
      where: { id_documento: idDocumento },
    });
    if (!expediente) return null;

    // Si el documento ya salió de esta sección y luego volvió, un plazo
    // creado para la visita anterior es histórico: no puede reactivarse solo
    // porque coincida la misma sección responsable.
    const ultimaSalida = await this.prisma.movimientoDocumento.findFirst({
      where: {
        id_documento: idDocumento,
        id_seccion_origen: expediente.id_seccion_actual,
      },
      orderBy: { fecha_hora_envio: 'desc' },
      select: { fecha_hora_envio: true },
    });

    const plazo = await this.prisma.plazoDocumento.findFirst({
      where: {
        id_seccion_responsable: expediente.id_seccion_actual,
        fecha_hora_cumplimiento: null,
        proveido: {
          fecha_hora: ultimaSalida
            ? { gte: ultimaSalida.fecha_hora_envio }
            : undefined,
          hoja_ruta: { id_documento: idDocumento },
        },
      },
      orderBy: { fecha_hora_limite: 'desc' },
      include: { proveido: { select: { numero_momento: true } } },
    });
    if (!plazo) return null;

    return { ...plazo, estado_calculado: this.calcularEstado(plazo) };
  }

  async listarPlazosDelExpediente(idDocumento: number) {
    const plazos = await this.prisma.plazoDocumento.findMany({
      where: { proveido: { hoja_ruta: { id_documento: idDocumento } } },
      include: { proveido: { select: { numero_momento: true } } },
      orderBy: { fecha_hora_limite: 'asc' },
    });
    return plazos.map((plazo) => ({
      ...plazo,
      estado_calculado: this.calcularEstado(plazo),
    }));
  }
}
