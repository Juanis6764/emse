// Tipos del módulo Gestión Documental — reflejan exactamente las entidades
// y enums de backend/prisma/schema.prisma (módulo "documentacion").

export type TipoDocumento =
  | "RADIOGRAMA"
  | "MEMORANDUM"
  | "OFICIO"
  | "NOTA_SERVICIO"
  | "INFORME"
  | "DIRECTIVA"
  | "CIRCULAR"
  | "PARTE";

export type PrioridadDocumento = "RUTINARIO" | "URGENTE";

export type ClasificacionDocumento =
  | "PUBLICO"
  | "CONFIDENCIAL"
  | "RESERVADO"
  | "SECRETO";

export type EstadoDocumento =
  | "REGISTRADO"
  | "EN_TRANSITO"
  | "EN_TRAMITE"
  | "OBSERVADO"
  | "APROBADO"
  | "FINALIZADO"
  | "ARCHIVADO";

export type TipoMovimientoDocumento =
  | "ENVIO"
  | "DERIVACION"
  | "DEVOLUCION"
  | "REENVIO";

export type EstadoMovimiento = "PENDIENTE" | "RECIBIDO" | "ANULADO";

export type TipoRelacionDocumento = "RESPUESTA" | "ANEXO" | "CORRECCION";

export type TipoAtencionRequerida = "CUMPLIMIENTO" | "RESPUESTA";

export type EstadoPlazoCalculado =
  | "PENDIENTE"
  | "VENCIDO"
  | "CUMPLIDO"
  | "CUMPLIDO_CON_RETRASO";

export type SituacionPlazoDocumental =
  | "SIN_PLAZO"
  | "EN_PLAZO"
  | "PROXIMO_A_VENCER"
  | "VENCE_HOY"
  | "VENCIDO"
  | "CUMPLIDO"
  | "CUMPLIDO_TARDE"
  | "HISTORIAL_NO_DETERMINABLE";

export interface PersonaResumen {
  id_usuario: number;
  nombres: string;
  apellidos: string;
}

export interface SeccionResumen {
  id_seccion: number;
  nombre: string;
}

export interface ArchivoDocumento {
  id_archivo: number;
  id_documento: number;
  id_cumplimiento: number | null;
  nombre_original: string;
  tipo_mime: string;
  tamano_bytes: number;
  hash_sha256: string;
  cifrado: boolean;
  id_usuario_subida: number;
  fecha_hora_subida: string;
}

export interface DocumentoRelacionResumen {
  id_documento: number;
  codigo_interno: string;
  tipo_documento: TipoDocumento;
  asunto: string;
  sintesis?: string | null;
  clasificacion?: ClasificacionDocumento;
  fecha_hora_registro?: string;
  usuario_registro?: PersonaResumen;
  seccion_registro?: SeccionResumen;
  archivos?: ArchivoDocumento[];
}

export interface DocumentoRelacionado {
  id_relacion: number;
  id_documento_origen: number;
  id_documento_relacionado: number;
  tipo_relacion: TipoRelacionDocumento;
  id_usuario_registro: number;
  fecha_hora: string;
  documento_relacionado?: DocumentoRelacionResumen;
  documento_origen?: DocumentoRelacionResumen;
}

export interface Documento {
  id_documento: number;
  codigo_interno: string;
  tipo_documento: TipoDocumento;
  numero_origen: string | null;
  procedencia: string | null;
  asunto: string;
  sintesis: string | null;
  prioridad: PrioridadDocumento;
  clasificacion: ClasificacionDocumento;
  fecha_documento: string | null;
  id_usuario_registro: number;
  id_seccion_registro: number;
  fecha_hora_registro: string;
  usuario_registro?: PersonaResumen;
  seccion_registro?: SeccionResumen;
  expediente?: ExpedienteDocumento | null;
  archivos?: ArchivoDocumento[];
  relaciones_como_origen?: DocumentoRelacionado[];
  relaciones_como_relacionado?: DocumentoRelacionado[];
}

export interface ExpedienteDocumento {
  id_documento: number;
  estado_actual: EstadoDocumento;
  id_seccion_actual: number;
  id_usuario_responsable_actual: number | null;
  fecha_hora_actualizacion: string;
  tipo_atencion_requerida: TipoAtencionRequerida | null;
  seccion_actual?: SeccionResumen;
  usuario_responsable_actual?: PersonaResumen | null;
  hoja_ruta?: HojaRuta | null;
  movimientos?: MovimientoDocumento[];
  historial?: HistorialEstadoDocumento[];
  observaciones?: ObservacionDocumento[];
  cumplimientos?: CumplimientoDocumento[];
}

export interface HojaRuta {
  id_hoja_ruta: number;
  numero: string;
  id_documento: number;
  id_usuario_asigno: number;
  id_seccion: number;
  fecha_hora_asignacion: string;
  fecha_hora_cierre: string | null;
  usuario_asigno?: PersonaResumen;
  seccion?: SeccionResumen;
  proveidos?: Proveido[];
}

export interface Proveido {
  id_proveido: number;
  id_hoja_ruta: number;
  numero_momento: number;
  contenido: string;
  fecha_hora: string;
  id_usuario_emisor: number;
  id_seccion_emisora: number;
  id_seccion_destino: number | null;
  usuario_emisor?: PersonaResumen;
  seccion_emisora?: SeccionResumen;
  seccion_destino?: SeccionResumen | null;
}

export interface PlazoDocumento {
  id_plazo: number;
  id_proveido: number;
  id_seccion_responsable: number;
  id_usuario_responsable: number | null;
  fecha_hora_limite: string;
  fecha_hora_cumplimiento: string | null;
  estado_calculado: EstadoPlazoCalculado;
  proveido?: { numero_momento: number };
}

export interface MovimientoDocumento {
  id_movimiento: number;
  id_documento: number;
  id_seccion_origen: number;
  id_seccion_destino: number;
  id_usuario_envia: number;
  fecha_hora_envio: string;
  id_usuario_recibe: number | null;
  fecha_hora_recepcion: string | null;
  tipo_movimiento: TipoMovimientoDocumento;
  estado_movimiento: EstadoMovimiento;
  observacion: string | null;
  seccion_origen?: SeccionResumen;
  seccion_destino?: SeccionResumen;
  usuario_envia?: PersonaResumen;
  usuario_recibe?: PersonaResumen | null;
  /** Solo presente en GET /documentacion/movimientos/pendientes. */
  expediente?: {
    documento: DocumentoRelacionResumen & {
      prioridad: PrioridadDocumento;
      clasificacion: ClasificacionDocumento;
    };
  };
}

export interface HistorialEstadoDocumento {
  id_historial: number;
  id_documento: number;
  estado_anterior: EstadoDocumento | null;
  estado_nuevo: EstadoDocumento;
  id_usuario: number;
  id_seccion: number;
  fecha_hora: string;
  motivo: string | null;
  usuario?: PersonaResumen;
  seccion?: SeccionResumen;
}

export interface CumplimientoDocumento {
  id_cumplimiento: number;
  id_documento: number;
  descripcion: string;
  id_usuario: number;
  id_seccion: number;
  fecha_hora: string;
  usuario?: PersonaResumen;
  seccion?: SeccionResumen;
  archivos?: { id_archivo: number; nombre_original: string }[];
}

export interface ObservacionDocumento {
  id_observacion: number;
  id_documento: number;
  id_usuario: number;
  id_seccion: number;
  descripcion: string;
  fecha_hora: string;
  subsanada: boolean;
  fecha_hora_subsanacion: string | null;
  usuario?: PersonaResumen;
  seccion?: SeccionResumen;
}

export interface Trazabilidad {
  documento: Documento;
  expediente: ExpedienteDocumento | null;
  plazo_vigente: PlazoDocumento | null;
  plazos: PlazoDocumento[];
}

export type PestañaSeguimiento = "EN_SEGUIMIENTO" | "CONCLUIDOS" | "TODOS";

export type EstadoSeguimientoSimplificado =
  | "EN_SEGUIMIENTO"
  | "OBSERVADO"
  | "FINALIZADO"
  | "ARCHIVADO";

export interface FiltrosSeguimientoDocumental {
  modo?: "ACTUAL" | "HISTORICO";
  busqueda?: string;
  codigo_interno?: string;
  asunto?: string;
  numero_hoja_ruta?: string;
  tipo_documento?: TipoDocumento;
  fecha_desde?: string;
  fecha_hasta?: string;
  estado?: EstadoDocumento;
  estado_simple?: EstadoSeguimientoSimplificado;
  id_seccion?: number;
  situacion_plazo?: SituacionPlazoDocumental;
  pestana?: PestañaSeguimiento;
}

export interface TarjetaSeguimientoDocumental {
  id_documento: number;
  codigo_interno: string;
  tipo_documento: TipoDocumento;
  asunto: string;
  numero_hoja_ruta: string | null;
  fecha_hora_registro: string;
  fecha_ingreso_area?: string | null;
  origen?: SeccionResumen | null;
  destino?: SeccionResumen | null;
  fecha_recepcion?: string | null;
  fecha_envio?: string | null;
  movimientos_area?: Array<{
    origen: SeccionResumen;
    destino: SeccionResumen;
    fecha_envio: string;
    fecha_recepcion: string | null;
    estado: "PENDIENTE" | "RECIBIDO" | "CANCELADO";
  }>;
  recorrido_reporte?: TarjetaSeguimientoDocumental['movimientos_area'];
  incidencias_reporte?: Array<{
    tipo: 'OBSERVACION' | 'RECEPCION_TARDIA' | 'DEMORA_DEPENDENCIA';
    dependencia: string;
    motivo: string;
    fecha: string;
  }>;
  estado_actual: EstadoDocumento;
  seccion_actual: SeccionResumen | null;
  responsable_actual?: PersonaResumen | null;
  actividad_actual?: string;
  plazo_vigente: PlazoDocumento | null;
  situacion_plazo: SituacionPlazoDocumental;
}

export interface ResumenSeguimientoDocumental {
  en_seguimiento: number;
  observados: number;
  proximos_a_vencer: number;
  vencidos: number;
  finalizados: number;
}

export interface SeguimientoDocumental {
  alcance: AlcanceReporteDocumental;
  modo?: "ACTUAL" | "HISTORICO";
  id_seccion_reporte?: number | null;
  resumen: ResumenSeguimientoDocumental;
  documentos: TarjetaSeguimientoDocumental[];
  paginacion?: {
    pagina: number;
    limite: number;
    total: number;
    total_paginas: number;
  };
}

// ── DTOs de entrada ──────────────────────────────────────────────

export interface RegistrarDocumentoInput {
  tipo_documento: TipoDocumento;
  numero_origen?: string;
  procedencia?: string;
  asunto: string;
  sintesis?: string;
  prioridad?: PrioridadDocumento;
  clasificacion?: ClasificacionDocumento;
  fecha_documento?: string;
}

export interface EnviarDocumentoInput {
  id_seccion_destino: number;
  tipo_movimiento?: TipoMovimientoDocumento;
  observacion?: string;
}

export interface RegistrarProveidoInput {
  contenido: string;
  fecha_hora_limite?: string;
  id_seccion_destino?: number;
  tipo_atencion_requerida?: TipoAtencionRequerida;
}

export interface EditarProveidoInput {
  contenido: string;
  fecha_hora_limite?: string;
}

export interface FiltrosReporteDocumental {
  busqueda?: string;
  numero_hoja_ruta?: string;
  gestion?: number;
  fecha_desde?: string;
  fecha_hasta?: string;
  tipo_documento?: TipoDocumento;
  prioridad?: PrioridadDocumento;
  estado?: EstadoDocumento;
  id_seccion?: number;
}

export type AlcanceReporteDocumental = "GLOBAL" | "PARTICIPACION_HISTORICA";

export interface TotalesSeguimientoDocumental {
  gestion: number;
  registrados: number;
  en_tramite: number;
  observados: number;
  vencidos: number;
  finalizados: number;
  archivados: number;
}

export interface ReporteSeguimientoInstitucional {
  alcance: AlcanceReporteDocumental;
  gestiones: TotalesSeguimientoDocumental[];
}

export interface FilaControlPlazoDocumental {
  id_plazo: number;
  gestion: number;
  hoja_ruta: string;
  documento: {
    id_documento: number;
    codigo_interno: string;
    asunto: string;
    tipo_documento: TipoDocumento;
    prioridad: PrioridadDocumento;
    estado: EstadoDocumento;
  };
  seccion_responsable: { id_seccion: number; nombre: string };
  fecha_hora_limite: string;
  fecha_hora_cumplimiento: string | null;
  resultado:
    | "EN PLAZO"
    | "VENCIDO"
    | `${number} DÍA TARDE`
    | `${number} DÍAS TARDE`;
}

export interface ReporteControlPlazos {
  alcance: AlcanceReporteDocumental;
  plazos: FilaControlPlazoDocumental[];
}
