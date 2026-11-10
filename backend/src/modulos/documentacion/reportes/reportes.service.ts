import { ForbiddenException, Injectable } from '@nestjs/common';
import { EstadoDocumento, Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { PERMISOS_DOCUMENTOS } from '../comun/constantes-documentales';
import {
  PerfilDocumental,
  ValidacionesDocumentalesService,
} from '../comun/validaciones-documentales.service';
import { perteneceAVisitaActual, PlazosService } from '../plazos/plazos.service';
import { FiltrarReporteDto } from './dto/filtrar-reporte.dto';
import { incidenciasDelRecorrido } from './incidencias-reporte';
import {
  FiltrarSeguimientoDto,
  PestanaSeguimiento,
} from './dto/filtrar-seguimiento.dto';

export interface TotalesSeguimiento {
  gestion: number;
  registrados: number;
  en_tramite: number;
  observados: number;
  vencidos: number;
  finalizados: number;
  archivados: number;
}

const ESTADOS_CONCLUIDOS: EstadoDocumento[] = [
  EstadoDocumento.FINALIZADO,
  EstadoDocumento.ARCHIVADO,
];

const ESTADOS_ACTIVOS: EstadoDocumento[] = [
  EstadoDocumento.REGISTRADO,
  EstadoDocumento.EN_TRANSITO,
  EstadoDocumento.EN_TRAMITE,
  EstadoDocumento.OBSERVADO,
  EstadoDocumento.APROBADO,
];

@Injectable()
export class ReportesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly validaciones: ValidacionesDocumentalesService,
    private readonly plazos: PlazosService,
  ) {}

  async seguimientoInstitucional(
    idUsuario: number,
    filtros: FiltrarReporteDto,
  ) {
    const perfil = await this.obtenerPerfilAutorizado(idUsuario);
    const documentos = await this.prisma.documento.findMany({
      where: this.crearFiltroDocumento(perfil, filtros, {
        filtrarFechasRegistro: true,
        filtrarSeccionActual: true,
      }),
      select: {
        id_documento: true,
        fecha_hora_registro: true,
        expediente: {
          select: { estado_actual: true, id_seccion_actual: true },
        },
      },
    });

    const ids = documentos.map((documento) => documento.id_documento);
    const salidas = ids.length
      ? await this.prisma.movimientoDocumento.findMany({
          where: { id_documento: { in: ids } },
          select: { id_documento: true, id_seccion_origen: true, fecha_hora_envio: true },
          orderBy: { fecha_hora_envio: 'desc' },
        })
      : [];
    const ultimaSalida = new Map<string, Date>();
    for (const salida of salidas) {
      const clave = `${salida.id_documento}:${salida.id_seccion_origen}`;
      if (!ultimaSalida.has(clave)) ultimaSalida.set(clave, salida.fecha_hora_envio);
    }
    const plazosVencidos =
      ids.length === 0
        ? []
        : await this.prisma.plazoDocumento.findMany({
            where: {
              fecha_hora_cumplimiento: null,
              fecha_hora_limite: { lt: new Date() },
              proveido: { hoja_ruta: { id_documento: { in: ids } } },
            },
            select: {
              id_seccion_responsable: true,
              proveido: {
                select: { fecha_hora: true, hoja_ruta: { select: { id_documento: true } } },
              },
            },
          });
    const seccionActualPorDocumento = new Map(
      documentos.map((documento) => [
        documento.id_documento,
        documento.expediente?.id_seccion_actual ?? null,
      ]),
    );
    // Un plazo histórico vencido no cambia el estado de la etapa actual.
    const idsVencidos = new Set(
      plazosVencidos
        .filter(
          (plazo) => {
            const idDocumento = plazo.proveido.hoja_ruta.id_documento;
            const idSeccion = seccionActualPorDocumento.get(idDocumento);
            return idSeccion !== null && idSeccion !== undefined &&
              perteneceAVisitaActual(
                plazo,
                idSeccion,
                ultimaSalida.get(`${idDocumento}:${idSeccion}`) ?? null,
              );
          },
        )
        .map((plazo) => plazo.proveido.hoja_ruta.id_documento),
    );

    const porGestion = new Map<number, TotalesSeguimiento>();
    if (filtros.gestion !== undefined) {
      porGestion.set(filtros.gestion, this.totalesVacios(filtros.gestion));
    }

    for (const documento of documentos) {
      const gestion = documento.fecha_hora_registro.getFullYear();
      const totales = porGestion.get(gestion) ?? this.totalesVacios(gestion);
      totales.registrados += 1;
      switch (documento.expediente?.estado_actual) {
        case EstadoDocumento.EN_TRAMITE:
          totales.en_tramite += 1;
          break;
        case EstadoDocumento.OBSERVADO:
          totales.observados += 1;
          break;
        case EstadoDocumento.FINALIZADO:
          totales.finalizados += 1;
          break;
        case EstadoDocumento.ARCHIVADO:
          totales.archivados += 1;
          break;
      }
      if (idsVencidos.has(documento.id_documento)) totales.vencidos += 1;
      porGestion.set(gestion, totales);
    }

    return {
      alcance: this.obtenerAlcance(perfil),
      gestiones: [...porGestion.values()].sort((a, b) => b.gestion - a.gestion),
    };
  }

  async seguimiento(idUsuario: number, filtros: FiltrarSeguimientoDto) {
    const perfil = await this.validaciones.obtenerPerfil(idUsuario);
    this.validaciones.exigirPermiso(perfil, PERMISOS_DOCUMENTOS.VER);

    const pestana: PestanaSeguimiento = filtros.pestana ?? 'EN_SEGUIMIENTO';
    const modo = 'HISTORICO' as const;
    const esGlobal = this.validaciones.esActorGlobal(perfil);
    if (!esGlobal && perfil.id_seccion === null) {
      throw new ForbiddenException(
        'Debe pertenecer a una sección documental para consultar reportes.',
      );
    }
    const idSeccionReporte = esGlobal
      ? filtros.id_seccion
      : (perfil.id_seccion ?? undefined);
    const rangoMovimiento = this.crearRangoFechas(
      filtros.fecha_desde,
      filtros.fecha_hasta,
    );
    const condiciones: Prisma.DocumentoWhereInput[] = [
      this.validaciones.crearFiltroConsulta(perfil),
    ];
    if (filtros.busqueda?.trim()) {
      const busqueda = filtros.busqueda.trim();
      condiciones.push({
        OR: [
          { codigo_interno: { contains: busqueda, mode: 'insensitive' } },
          { numero_origen: { contains: busqueda, mode: 'insensitive' } },
          { asunto: { contains: busqueda, mode: 'insensitive' } },
          { procedencia: { contains: busqueda, mode: 'insensitive' } },
          {
            expediente: {
              is: {
                hoja_ruta: {
                  is: {
                    numero: { contains: busqueda, mode: 'insensitive' },
                  },
                },
              },
            },
          },
        ],
      });
    }
    if (filtros.codigo_interno?.trim()) {
      condiciones.push({
        codigo_interno: {
          contains: filtros.codigo_interno.trim(),
          mode: 'insensitive',
        },
      });
    }
    if (filtros.asunto?.trim()) {
      condiciones.push({
        asunto: { contains: filtros.asunto.trim(), mode: 'insensitive' },
      });
    }
    if (filtros.numero_hoja_ruta?.trim()) {
      condiciones.push({
        expediente: {
          is: {
            hoja_ruta: {
              is: {
                numero: {
                  contains: filtros.numero_hoja_ruta.trim(),
                  mode: 'insensitive',
                },
              },
            },
          },
        },
      });
    }
    if (filtros.tipo_documento) {
      condiciones.push({ tipo_documento: filtros.tipo_documento });
    }
    if (filtros.estado) {
      condiciones.push({
        expediente: { is: { estado_actual: filtros.estado } },
      });
    }
    if (filtros.estado_simple === 'EN_SEGUIMIENTO') {
      condiciones.push({
        expediente: {
          is: {
            estado_actual: {
              in: ESTADOS_ACTIVOS.filter(
                (estado) => estado !== EstadoDocumento.OBSERVADO,
              ),
            },
          },
        },
      });
    } else if (filtros.estado_simple) {
      condiciones.push({
        expediente: { is: { estado_actual: filtros.estado_simple } },
      });
    }
    if (idSeccionReporte) {
      condiciones.push({
        expediente: {
          is: {
            movimientos: {
              some: {
                AND: [
                  {
                    OR: [
                      { id_seccion_origen: idSeccionReporte },
                      { id_seccion_destino: idSeccionReporte },
                    ],
                  },
                  rangoMovimiento
                    ? {
                        OR: [
                          { fecha_hora_envio: rangoMovimiento },
                          { fecha_hora_recepcion: rangoMovimiento },
                        ],
                      }
                    : {},
                ],
              },
            },
          },
        },
      });
    } else {
      condiciones.push({
        expediente: {
          is: {
            movimientos: {
              some: {
                ...(rangoMovimiento
                  ? {
                      OR: [
                        { fecha_hora_envio: rangoMovimiento },
                        { fecha_hora_recepcion: rangoMovimiento },
                      ],
                    }
                  : {}),
              },
            },
          },
        },
      });
    }
    if (pestana === 'EN_SEGUIMIENTO') {
      condiciones.push({
        expediente: { is: { estado_actual: { in: ESTADOS_ACTIVOS } } },
      });
    } else if (pestana === 'CONCLUIDOS') {
      condiciones.push({
        expediente: {
          is: { estado_actual: { in: ESTADOS_CONCLUIDOS } },
        },
      });
    }

    const documentos = await this.prisma.documento.findMany({
      where: { AND: condiciones },
      select: {
        id_documento: true,
        codigo_interno: true,
        tipo_documento: true,
        asunto: true,
        fecha_hora_registro: true,
        relaciones_como_origen: {
          where: { tipo_relacion: 'RESPUESTA' },
          select: { fecha_hora: true },
          orderBy: { fecha_hora: 'desc' },
          take: 1,
        },
        expediente: {
          select: {
            estado_actual: true,
            id_seccion_actual: true,
            seccion_actual: { select: { id_seccion: true, nombre: true } },
            usuario_responsable_actual: {
              select: { id_usuario: true, nombres: true, apellidos: true },
            },
            hoja_ruta: { select: { numero: true } },
            movimientos: {
              select: {
                estado_movimiento: true,
                fecha_hora_envio: true,
                fecha_hora_recepcion: true,
                id_seccion_origen: true,
                id_seccion_destino: true,
                seccion_origen: {
                  select: { id_seccion: true, nombre: true },
                },
                seccion_destino: {
                  select: { id_seccion: true, nombre: true },
                },
              },
              orderBy: { fecha_hora_envio: 'desc' },
            },
            cumplimientos: {
              select: { fecha_hora: true, id_seccion: true },
              orderBy: { fecha_hora: 'desc' },
              take: 1,
            },
            observaciones: {
              select: {
                subsanada: true,
                fecha_hora: true,
                descripcion: true,
                seccion: { select: { nombre: true } },
              },
              orderBy: { fecha_hora: 'desc' },
            },
          },
        },
      },
      orderBy: { fecha_hora_registro: 'desc' },
    });

    const ids = documentos.map((documento) => documento.id_documento);
    const plazos = ids.length
      ? await this.prisma.plazoDocumento.findMany({
          where: { proveido: { hoja_ruta: { id_documento: { in: ids } } } },
          orderBy: { fecha_hora_limite: 'desc' },
          include: {
            proveido: {
              select: { fecha_hora: true, hoja_ruta: { select: { id_documento: true } } },
            },
          },
        })
      : [];
    const plazosPorDocumento = new Map<number, typeof plazos>();
    for (const plazo of plazos) {
      const idDocumento = plazo.proveido.hoja_ruta.id_documento;
      const existentes = plazosPorDocumento.get(idDocumento) ?? [];
      existentes.push(plazo);
      plazosPorDocumento.set(idDocumento, existentes);
    }

    const tarjetas = documentos
      .filter((documento) => documento.expediente)
      .map((documento) => {
        const expediente = documento.expediente!;
        const plazo =
          (plazosPorDocumento.get(documento.id_documento) ?? [])
            .filter(
              (item) =>
                perteneceAVisitaActual(
                  item,
                  expediente.id_seccion_actual,
                  expediente.movimientos.find(
                    (movimiento) => movimiento.id_seccion_origen === expediente.id_seccion_actual,
                  )?.fecha_hora_envio ?? null,
                ),
            )
            .sort(
              (a, b) =>
                b.fecha_hora_limite.getTime() - a.fecha_hora_limite.getTime(),
            )[0] ?? null;
        const estadoPlazo = plazo ? this.plazos.calcularEstado(plazo) : null;
        const situacion = this.plazos.calcularSituacion(plazo);
        const ultimoMovimiento = expediente.movimientos[0];
        const movimientosArea = expediente.movimientos.filter(
          (movimiento) =>
            !idSeccionReporte ||
            movimiento.id_seccion_origen === idSeccionReporte ||
            movimiento.id_seccion_destino === idSeccionReporte,
        );
        const movimientosPeriodo = rangoMovimiento
          ? movimientosArea.filter((movimiento) =>
              [
                movimiento.fecha_hora_envio,
                movimiento.fecha_hora_recepcion,
              ].some(
                (fecha) =>
                  fecha !== null &&
                  (!rangoMovimiento.gte || fecha >= rangoMovimiento.gte) &&
                  (!rangoMovimiento.lt || fecha < rangoMovimiento.lt),
              ),
            )
          : movimientosArea;
        const movimientoPrincipal = movimientosPeriodo[0] ?? null;
        const ultimoCumplimiento = expediente.cumplimientos[0];
        const ultimaObservacion = expediente.observaciones[0];
        let actividadActual = 'ÚLTIMA UBICACIÓN CONFIRMADA';
        if (expediente.estado_actual === EstadoDocumento.ARCHIVADO) {
          actividadActual = 'ARCHIVADO';
        } else if (expediente.estado_actual === EstadoDocumento.FINALIZADO) {
          actividadActual = 'FINALIZADO';
        } else if (expediente.estado_actual === EstadoDocumento.APROBADO) {
          actividadActual = 'APROBADO';
        } else if (expediente.estado_actual === EstadoDocumento.OBSERVADO) {
          actividadActual = ultimaObservacion?.subsanada
            ? 'OBSERVACIÓN SUBSANADA'
            : 'CORRECCIÓN DE OBSERVACIÓN PENDIENTE';
        } else if (ultimoMovimiento?.estado_movimiento === 'PENDIENTE') {
          actividadActual = 'PENDIENTE DE RECEPCIÓN';
        } else if (
          ultimoCumplimiento?.id_seccion === expediente.id_seccion_actual
        ) {
          actividadActual = 'CUMPLIMIENTO REGISTRADO';
        } else if (documento.relaciones_como_origen.length > 0) {
          actividadActual = 'RESPUESTA REGISTRADA';
        } else if (ultimoMovimiento?.fecha_hora_recepcion) {
          actividadActual = 'RECIBIDO';
        }
        return {
          id_documento: documento.id_documento,
          codigo_interno: documento.codigo_interno,
          tipo_documento: documento.tipo_documento,
          asunto: documento.asunto,
          numero_hoja_ruta: expediente.hoja_ruta?.numero ?? null,
          fecha_hora_registro: documento.fecha_hora_registro,
          fecha_ingreso_area: movimientoPrincipal?.fecha_hora_recepcion ?? null,
          origen: movimientoPrincipal?.seccion_origen ?? null,
          destino: movimientoPrincipal?.seccion_destino ?? null,
          fecha_recepcion: movimientoPrincipal?.fecha_hora_recepcion ?? null,
          fecha_envio: movimientoPrincipal?.fecha_hora_envio ?? null,
          movimientos_area: movimientosArea.map((movimiento) => ({
            origen: movimiento.seccion_origen,
            destino: movimiento.seccion_destino,
            fecha_envio: movimiento.fecha_hora_envio,
            fecha_recepcion: movimiento.fecha_hora_recepcion,
            estado: movimiento.estado_movimiento,
          })),
          recorrido_reporte: expediente.movimientos.map((movimiento) => ({
            origen: movimiento.seccion_origen,
            destino: movimiento.seccion_destino,
            fecha_envio: movimiento.fecha_hora_envio,
            fecha_recepcion: movimiento.fecha_hora_recepcion,
            estado: movimiento.estado_movimiento,
          })),
          incidencias_reporte: incidenciasDelRecorrido(
            expediente.movimientos,
            plazosPorDocumento.get(documento.id_documento) ?? [],
            expediente.observaciones,
            expediente.id_seccion_actual,
            new Date(),
            !ESTADOS_CONCLUIDOS.includes(expediente.estado_actual),
          ),
          estado_actual: expediente.estado_actual,
          seccion_actual: expediente.seccion_actual,
          responsable_actual: expediente.usuario_responsable_actual,
          actividad_actual: actividadActual,
          plazo_vigente: plazo
            ? { ...plazo, estado_calculado: estadoPlazo }
            : null,
          situacion_plazo: situacion,
        };
      })
      .filter((tarjeta) =>
        filtros.situacion_plazo
          ? tarjeta.situacion_plazo === filtros.situacion_plazo
          : true,
      );

    const resumen = tarjetas.reduce(
      (total, tarjeta) => {
        if (ESTADOS_CONCLUIDOS.includes(tarjeta.estado_actual)) {
          total.finalizados += 1;
        } else if (tarjeta.estado_actual === EstadoDocumento.OBSERVADO) {
          total.observados += 1;
        } else {
          total.en_seguimiento += 1;
        }
        if (
          tarjeta.situacion_plazo === 'PROXIMO_A_VENCER' ||
          tarjeta.situacion_plazo === 'VENCE_HOY'
        ) {
          total.proximos_a_vencer += 1;
        }
        if (tarjeta.situacion_plazo === 'VENCIDO') total.vencidos += 1;
        return total;
      },
      {
        en_seguimiento: 0,
        observados: 0,
        proximos_a_vencer: 0,
        vencidos: 0,
        finalizados: 0,
      },
    );

    return {
      alcance: this.obtenerAlcance(perfil),
      modo,
      id_seccion_reporte: idSeccionReporte ?? null,
      resumen,
      documentos: tarjetas,
    };
  }

  async controlPlazos(idUsuario: number, filtros: FiltrarReporteDto) {
    const perfil = await this.obtenerPerfilAutorizado(idUsuario);
    const filtroDocumento = this.crearFiltroDocumento(perfil, filtros, {
      filtrarFechasRegistro: false,
      filtrarSeccionActual: false,
    });

    const plazos = await this.prisma.plazoDocumento.findMany({
      where: {
        id_seccion_responsable: filtros.id_seccion,
        fecha_hora_limite: this.crearRangoFechas(
          filtros.fecha_desde,
          filtros.fecha_hasta,
        ),
        proveido: {
          hoja_ruta: { expediente: { documento: filtroDocumento } },
        },
      },
      include: {
        seccion_responsable: {
          select: { id_seccion: true, nombre: true },
        },
        proveido: {
          include: {
            hoja_ruta: {
              include: {
                expediente: {
                  include: {
                    documento: {
                      select: {
                        id_documento: true,
                        codigo_interno: true,
                        asunto: true,
                        tipo_documento: true,
                        prioridad: true,
                        fecha_hora_registro: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { fecha_hora_limite: 'asc' },
    });

    return {
      alcance: this.obtenerAlcance(perfil),
      plazos: plazos.map((plazo) => {
        const hojaRuta = plazo.proveido.hoja_ruta;
        const documento = hojaRuta.expediente.documento;
        return {
          id_plazo: plazo.id_plazo,
          gestion: documento.fecha_hora_registro.getFullYear(),
          hoja_ruta: hojaRuta.numero,
          documento: {
            id_documento: documento.id_documento,
            codigo_interno: documento.codigo_interno,
            asunto: documento.asunto,
            tipo_documento: documento.tipo_documento,
            prioridad: documento.prioridad,
            estado: hojaRuta.expediente.estado_actual,
          },
          seccion_responsable: plazo.seccion_responsable,
          fecha_hora_limite: plazo.fecha_hora_limite,
          fecha_hora_cumplimiento: plazo.fecha_hora_cumplimiento,
          resultado: this.calcularResultado(plazo),
        };
      }),
    };
  }

  private async obtenerPerfilAutorizado(idUsuario: number) {
    const perfil = await this.validaciones.obtenerPerfil(idUsuario);
    this.validaciones.exigirPermiso(perfil, PERMISOS_DOCUMENTOS.VER);
    return perfil;
  }

  private crearFiltroDocumento(
    perfil: PerfilDocumental,
    filtros: FiltrarReporteDto,
    opciones: {
      filtrarFechasRegistro: boolean;
      filtrarSeccionActual: boolean;
    },
  ): Prisma.DocumentoWhereInput {
    const condiciones: Prisma.DocumentoWhereInput[] = [
      this.validaciones.crearFiltroConsulta(perfil),
    ];
    if (filtros.busqueda?.trim()) {
      const busqueda = filtros.busqueda.trim();
      condiciones.push({
        OR: [
          { codigo_interno: { contains: busqueda, mode: 'insensitive' } },
          { numero_origen: { contains: busqueda, mode: 'insensitive' } },
          { asunto: { contains: busqueda, mode: 'insensitive' } },
          {
            expediente: {
              is: {
                hoja_ruta: {
                  is: { numero: { contains: busqueda, mode: 'insensitive' } },
                },
              },
            },
          },
        ],
      });
    }
    if (filtros.numero_hoja_ruta?.trim()) {
      condiciones.push({
        expediente: {
          is: {
            hoja_ruta: {
              is: {
                numero: {
                  contains: filtros.numero_hoja_ruta.trim(),
                  mode: 'insensitive',
                },
              },
            },
          },
        },
      });
    }
    const rangoGestion = this.crearRangoGestion(filtros.gestion);
    if (rangoGestion) {
      condiciones.push({ fecha_hora_registro: rangoGestion });
    }
    if (opciones.filtrarFechasRegistro) {
      const rangoFechas = this.crearRangoFechas(
        filtros.fecha_desde,
        filtros.fecha_hasta,
      );
      if (rangoFechas) condiciones.push({ fecha_hora_registro: rangoFechas });
    }

    return {
      AND: condiciones,
      tipo_documento: filtros.tipo_documento,
      prioridad: filtros.prioridad,
      expediente: {
        is: {
          estado_actual: filtros.estado,
          id_seccion_actual: opciones.filtrarSeccionActual
            ? filtros.id_seccion
            : undefined,
        },
      },
    };
  }

  private crearRangoGestion(
    gestion: number | undefined,
  ): Prisma.DateTimeFilter | undefined {
    if (gestion === undefined) return undefined;
    return {
      gte: new Date(gestion, 0, 1),
      lt: new Date(gestion + 1, 0, 1),
    };
  }

  private crearRangoFechas(
    desde: string | undefined,
    hasta: string | undefined,
  ): Prisma.DateTimeFilter | undefined {
    if (!desde && !hasta) return undefined;
    return {
      gte: desde ? new Date(`${desde}T00:00:00.000`) : undefined,
      lt: hasta ? this.diaSiguiente(hasta) : undefined,
    };
  }

  private diaSiguiente(fecha: string) {
    const resultado = new Date(`${fecha}T00:00:00.000`);
    resultado.setDate(resultado.getDate() + 1);
    return resultado;
  }

  private totalesVacios(gestion: number): TotalesSeguimiento {
    return {
      gestion,
      registrados: 0,
      en_tramite: 0,
      observados: 0,
      vencidos: 0,
      finalizados: 0,
      archivados: 0,
    };
  }

  private obtenerAlcance(perfil: PerfilDocumental) {
    return this.validaciones.esActorGlobal(perfil)
      ? 'GLOBAL'
      : 'PARTICIPACION_HISTORICA';
  }

  private calcularResultado(plazo: {
    fecha_hora_limite: Date;
    fecha_hora_cumplimiento: Date | null;
  }) {
    const estado = this.plazos.calcularEstado(plazo);
    if (estado === 'VENCIDO') return 'VENCIDO';
    if (estado !== 'CUMPLIDO_CON_RETRASO') return 'EN PLAZO';

    const diferencia =
      (plazo.fecha_hora_cumplimiento as Date).getTime() -
      plazo.fecha_hora_limite.getTime();
    const dias = Math.max(1, Math.ceil(diferencia / 86_400_000));
    return `${dias} ${dias === 1 ? 'DÍA' : 'DÍAS'} TARDE`;
  }
}
