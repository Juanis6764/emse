"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AvisoDoc,
  botonPrimarioDoc,
  botonSecundarioDoc,
  campoDoc,
  CargandoDoc,
  EncabezadoDoc,
  EstadoDocumentoBadge,
  fechaLegibleDoc,
  ModalDoc,
  situacionPlazoVisual,
  tarjetaDoc,
  tiempoRestanteDoc,
  VacioDoc,
} from "./InterfazDocumentacion";
import {
  conectarDocumentacion,
  desconectarDocumentacion,
  EventoDocumental,
} from "../../servicios/documentacion/documentacion-socket.service";
import {
  mensajeErrorApi,
  obtenerSeccionesDocumentales,
  obtenerSeguimientoDocumental,
  obtenerTrazabilidad,
} from "../../servicios/documentacion/documentacion.service";
import {
  EstadoSeguimientoSimplificado,
  FiltrosSeguimientoDocumental,
  SeguimientoDocumental,
  SituacionPlazoDocumental,
  TarjetaSeguimientoDocumental,
  Trazabilidad,
  TipoDocumento,
} from "../../tipos/documentacion";
import { Seccion } from "../../tipos/seccion";
import { useAuth } from "../../contextos/AuthContext";
import WorkflowVisual from "./WorkflowVisual";
import {
  ResumenHistoricoPlazos,
  resumirPlazosHistoricos,
} from "./plazos-historicos";

const TIPOS: TipoDocumento[] = [
  "RADIOGRAMA",
  "MEMORANDUM",
  "OFICIO",
  "NOTA_SERVICIO",
  "INFORME",
  "DIRECTIVA",
  "CIRCULAR",
  "PARTE",
];
const ETIQUETAS_TIPO: Record<TipoDocumento, string> = {
  RADIOGRAMA: "Radiograma",
  MEMORANDUM: "Memorándum",
  OFICIO: "Oficio",
  NOTA_SERVICIO: "Nota de Servicio",
  INFORME: "Informe",
  DIRECTIVA: "Directiva",
  CIRCULAR: "Circular",
  PARTE: "Parte",
};
const ESTADOS_SIMPLES: Array<{
  valor: EstadoSeguimientoSimplificado;
  etiqueta: string;
}> = [
  { valor: "EN_SEGUIMIENTO", etiqueta: "En seguimiento" },
  { valor: "OBSERVADO", etiqueta: "Observado" },
  { valor: "FINALIZADO", etiqueta: "Finalizado" },
  { valor: "ARCHIVADO", etiqueta: "Archivado" },
];
const SITUACIONES: Array<{
  valor: SituacionPlazoDocumental;
  etiqueta: string;
}> = [
  { valor: "EN_PLAZO", etiqueta: "En plazo" },
  { valor: "PROXIMO_A_VENCER", etiqueta: "Próximo a vencer" },
  { valor: "VENCE_HOY", etiqueta: "Vence hoy" },
  { valor: "VENCIDO", etiqueta: "Vencido" },
  { valor: "CUMPLIDO", etiqueta: "Cumplido" },
  { valor: "CUMPLIDO_TARDE", etiqueta: "Cumplido tarde" },
  { valor: "SIN_PLAZO", etiqueta: "Sin plazo" },
];
const INICIALES: FiltrosSeguimientoDocumental = { pestana: "TODOS" };
type FechaRapida =
  | "SIN_RESTRICCION"
  | "HOY"
  | "ULTIMOS_7_DIAS"
  | "ESTE_MES"
  | "PERSONALIZADO";
type EstadoResumenHistorico = ResumenHistoricoPlazos | "CARGANDO" | "ERROR";

function esDocumentoCerrado(documento: TarjetaSeguimientoDocumental) {
  return (
    documento.estado_actual === "FINALIZADO" ||
    documento.estado_actual === "ARCHIVADO"
  );
}

function esResumenHistorico(
  resumen: EstadoResumenHistorico | undefined,
): resumen is ResumenHistoricoPlazos {
  return typeof resumen === "object";
}

function textoResumenHistorico(resumen: EstadoResumenHistorico | undefined) {
  if (!resumen || resumen === "CARGANDO")
    return "… Cargando historial de plazos";
  if (resumen === "ERROR") return "— Historial de plazos no disponible";
  if (resumen.total === 0) return "— SIN PLAZO";

  const referenciasHistoricas: string[] = [];
  if (resumen.cumplidosTarde) {
    referenciasHistoricas.push(
      `${resumen.cumplidosTarde} de ${resumen.total} ${resumen.cumplidosTarde === 1 ? "plazo atendido" : "plazos atendidos"} fuera de plazo`,
    );
  }
  if (resumen.vencidos) {
    referenciasHistoricas.push(
      `${resumen.vencidos} ${resumen.vencidos === 1 ? "plazo histórico sin constancia de atención" : "plazos históricos sin constancia de atención"}`,
    );
  }
  if (referenciasHistoricas.length)
    return `Historial: ${referenciasHistoricas.join(" · ")}`;
  if (
    resumen.indeterminables === 0 &&
    resumen.cumplidosEnPlazo === resumen.total
  ) {
    return "✓ TODOS EN PLAZO";
  }

  // Los plazos históricos sin evidencia suficiente se conservan en el
  // resumen interno, pero no generan una alerta ni un estado visual.
  return undefined;
}

function fechaParaInput(fecha: Date) {
  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, "0");
  const dia = String(fecha.getDate()).padStart(2, "0");
  return `${anio}-${mes}-${dia}`;
}

function nombreTipo(tipo: TipoDocumento) {
  return tipo.replaceAll("_", " ");
}

function tiempoPlazoDashboard(fecha: string, ahora: Date) {
  const limite = new Date(fecha);
  const diferencia = limite.getTime() - ahora.getTime();
  const dias = Math.ceil(Math.abs(diferencia) / 86_400_000);
  const mismaFecha =
    limite.getFullYear() === ahora.getFullYear() &&
    limite.getMonth() === ahora.getMonth() &&
    limite.getDate() === ahora.getDate();
  if (diferencia < 0)
    return dias > 0
      ? `VENCIDO HACE ${dias} ${dias === 1 ? "DÍA" : "DÍAS"}`
      : "VENCIDO";
  if (mismaFecha) return "VENCE HOY";
  const manana = new Date(ahora);
  manana.setDate(manana.getDate() + 1);
  if (
    limite.getFullYear() === manana.getFullYear() &&
    limite.getMonth() === manana.getMonth() &&
    limite.getDate() === manana.getDate()
  )
    return "VENCE MAÑANA";
  return dias > 0
    ? `VENCE EN ${dias} ${dias === 1 ? "DÍA" : "DÍAS"}`
    : tiempoRestanteDoc(fecha, ahora).toUpperCase();
}

function ResumenCard({
  etiqueta,
  valor,
  clase,
  icono,
}: {
  etiqueta: string;
  valor: number;
  clase: string;
  icono: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-[0.13em] text-slate-500">
          {etiqueta}
        </p>
        <span
          className={`flex size-9 items-center justify-center rounded-xl text-lg ${clase}`}
        >
          {icono}
        </span>
      </div>
      <p className="mt-3 text-3xl font-bold text-slate-950">{valor}</p>
      <p className="mt-1 text-xs text-slate-500">documentos</p>
    </div>
  );
}

function CardDocumento({
  documento,
  ahora,
  abrir,
  resumenHistorico,
}: {
  documento: TarjetaSeguimientoDocumental;
  ahora: Date;
  abrir: (id: number) => void;
  resumenHistorico?: EstadoResumenHistorico;
}) {
  const cerrado = esDocumentoCerrado(documento);
  const visual = situacionPlazoVisual(documento.plazo_vigente, ahora);
  const resumenDisponible = esResumenHistorico(resumenHistorico);
  const vencido = !cerrado && visual.clave === "VENCIDO";
  const alerta = vencido;
  const textoHistorico = cerrado
    ? textoResumenHistorico(resumenHistorico)
    : undefined;
  return (
    <article
      className={`${tarjetaDoc} relative overflow-hidden ${alerta ? "border-red-300 shadow-red-100" : ""}`}
    >
      {alerta && (
        <div
          className="absolute inset-y-0 left-0 w-1.5 bg-red-600"
          aria-hidden="true"
        />
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#52796f]">
            {nombreTipo(documento.tipo_documento)}
          </p>
          <p className="mt-1 font-mono text-lg font-bold text-slate-950">
            {documento.codigo_interno}
          </p>
        </div>
        <EstadoDocumentoBadge estado={documento.estado_actual} />
      </div>
      <h3 className="mt-4 min-h-12 text-base font-semibold text-slate-950">
        {documento.asunto}
      </h3>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs font-semibold uppercase text-slate-500">
            Hoja de Ruta
          </dt>
          <dd className="font-mono text-slate-900">
            {documento.numero_hoja_ruta ?? "—"}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase text-slate-500">
            Registrado
          </dt>
          <dd>{fechaLegibleDoc(documento.fecha_hora_registro)}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase text-slate-500">
            Ubicación
          </dt>
          <dd>
            {documento.seccion_actual?.nombre?.replaceAll("_", " ") ?? "—"}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase text-slate-500">
            Responsable actual
          </dt>
          <dd>
            {documento.responsable_actual
              ? `${documento.responsable_actual.nombres} ${documento.responsable_actual.apellidos}`
              : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase text-slate-500">
            Actividad confirmada
          </dt>
          <dd>{documento.actividad_actual ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase text-slate-500">
            {cerrado ? "Plazos" : "Plazo"}
          </dt>
          <dd>
            {cerrado
              ? resumenDisponible && resumenHistorico.total > 0
                ? `${resumenHistorico.total} ${resumenHistorico.total === 1 ? "registrado" : "registrados"}`
                : resumenDisponible
                  ? "—"
                  : "Consultando…"
              : documento.plazo_vigente
                ? fechaLegibleDoc(documento.plazo_vigente.fecha_hora_limite)
                : "—"}
          </dd>
        </div>
      </dl>
      {(!cerrado || textoHistorico) && (
        <div
          className={`mt-4 rounded-xl border px-3 py-2 text-sm font-bold ${alerta ? "border-red-200 bg-red-50 text-red-800" : "border-slate-200 bg-slate-50 text-slate-700"}`}
        >
          {cerrado ? (
            <span>{textoHistorico}</span>
          ) : (
          <>
            <span>
              {visual.emoji} {visual.texto}
            </span>
            {documento.plazo_vigente &&
              !["CUMPLIDO", "CUMPLIDO_TARDE", "VENCE_HOY"].includes(
                visual.clave,
              ) && (
                <span className="ml-2 font-normal">
                  ·{" "}
                  {tiempoPlazoDashboard(
                    documento.plazo_vigente.fecha_hora_limite,
                    ahora,
                  )}
                </span>
              )}
          </>
          )}
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-slate-500">
          Estado actual: {documento.estado_actual.replaceAll("_", " ")}
        </span>
        <button
          type="button"
          className={botonPrimarioDoc}
          onClick={() => abrir(documento.id_documento)}
        >
          Ver seguimiento
        </button>
      </div>
    </article>
  );
}

export default function SeguimientoDashboard() {
  const { token } = useAuth();
  const [filtros, setFiltros] =
    useState<FiltrosSeguimientoDocumental>(INICIALES);
  const [aplicados, setAplicados] =
    useState<FiltrosSeguimientoDocumental>(INICIALES);
  const [fechaRapida, setFechaRapida] =
    useState<FechaRapida>("SIN_RESTRICCION");
  const [mostrarMasFiltros, setMostrarMasFiltros] = useState(false);
  const [resultado, setResultado] = useState<SeguimientoDocumental | null>(
    null,
  );
  const [secciones, setSecciones] = useState<Seccion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [actualizando, setActualizando] = useState(false);
  const [error, setError] = useState("");
  const [ahora, setAhora] = useState(() => new Date());
  const [idAbierto, setIdAbierto] = useState<number | null>(null);
  const [limiteVisible, setLimiteVisible] = useState(12);
  const [detalle, setDetalle] = useState<Trazabilidad | null>(null);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [resumenesHistoricos, setResumenesHistoricos] = useState<
    Record<number, EstadoResumenHistorico>
  >({});
  const resumenesHistoricosRef = useRef<Record<number, EstadoResumenHistorico>>(
    {},
  );

  const cargarResumenesHistoricos = useCallback(
    (documentos: TarjetaSeguimientoDocumental[]) => {
      const ids = documentos
        .filter(esDocumentoCerrado)
        .map((documento) => documento.id_documento)
        .filter((id) => !(id in resumenesHistoricosRef.current));
      if (ids.length === 0) return;

      for (const id of ids) resumenesHistoricosRef.current[id] = "CARGANDO";
      setResumenesHistoricos({ ...resumenesHistoricosRef.current });
      void Promise.all(
        ids.map(async (id) => {
          try {
            const trazabilidad = await obtenerTrazabilidad(id);
            return [id, resumirPlazosHistoricos(trazabilidad.plazos)] as const;
          } catch {
            return [id, "ERROR"] as const;
          }
        }),
      ).then((resumenes) => {
        for (const [id, resumen] of resumenes) {
          resumenesHistoricosRef.current[id] = resumen;
        }
        setResumenesHistoricos({ ...resumenesHistoricosRef.current });
      });
    },
    [],
  );

  const cargar = useCallback(
    async (criterios: FiltrosSeguimientoDocumental = aplicados) => {
      setActualizando(true);
      try {
        const datos = await obtenerSeguimientoDocumental(criterios);
        setResultado(datos);
        cargarResumenesHistoricos(datos.documentos);
        setError("");
      } catch (e) {
        setError(mensajeErrorApi(e));
      } finally {
        setCargando(false);
        setActualizando(false);
      }
    },
    [aplicados, cargarResumenesHistoricos],
  );

  useEffect(() => {
    let vigente = true;
    queueMicrotask(() => {
      void Promise.all([obtenerSeccionesDocumentales(), cargar()])
        .then(([lista]) => {
          if (vigente) setSecciones(lista);
        })
        .catch((e) => {
          if (vigente) setError(mensajeErrorApi(e));
        });
    });
    return () => {
      vigente = false;
    };
  }, [cargar]);

  const abrirDetalle = useCallback(async (id: number) => {
    setIdAbierto(id);
    setDetalle(null);
    setCargandoDetalle(true);
    try {
      setDetalle(await obtenerTrazabilidad(id));
    } catch (e) {
      setError(mensajeErrorApi(e));
    } finally {
      setCargandoDetalle(false);
    }
  }, []);

  useEffect(() => {
    if (!token) return;
    const socket = conectarDocumentacion(token);
    const alRecibirEvento = (evento: EventoDocumental) => {
      if (!evento.id_documento) return;
      const siguientes = { ...resumenesHistoricosRef.current };
      delete siguientes[evento.id_documento];
      resumenesHistoricosRef.current = siguientes;
      setResumenesHistoricos(siguientes);
      void cargar();
      if (evento.id_documento === idAbierto)
        void abrirDetalle(evento.id_documento);
    };
    socket.on("documento:evento", alRecibirEvento);
    const reloj = window.setInterval(() => {
      setAhora(new Date());
      void cargar();
    }, 60_000);
    return () => {
      socket.off("documento:evento", alRecibirEvento);
      window.clearInterval(reloj);
    };
  }, [token, cargar, idAbierto, abrirDetalle]);

  useEffect(() => () => desconectarDocumentacion(), []);

  useEffect(() => {
    const temporizador = window.setTimeout(() => {
      const busqueda = filtros.busqueda?.trim() || undefined;
      setLimiteVisible(12);
      setAplicados((actuales) =>
        actuales.busqueda === busqueda ? actuales : { ...actuales, busqueda },
      );
    }, 400);
    return () => window.clearTimeout(temporizador);
  }, [filtros.busqueda]);

  const resumen = useMemo(() => {
    const total = {
      en_seguimiento: 0,
      observados: 0,
      proximos_a_vencer: 0,
      vencidos: 0,
      finalizados: 0,
    };
    for (const documento of resultado?.documentos ?? []) {
      if (
        documento.estado_actual === "FINALIZADO" ||
        documento.estado_actual === "ARCHIVADO"
      )
        total.finalizados += 1;
      else if (documento.estado_actual === "OBSERVADO") total.observados += 1;
      else total.en_seguimiento += 1;
      const situacion = situacionPlazoVisual(
        documento.plazo_vigente,
        ahora,
      ).clave;
      if (situacion === "PROXIMO_A_VENCER" || situacion === "VENCE_HOY")
        total.proximos_a_vencer += 1;
      if (situacion === "VENCIDO") total.vencidos += 1;
    }
    return total;
  }, [resultado, ahora]);

  const actualizarYAplicar = <K extends keyof FiltrosSeguimientoDocumental>(
    clave: K,
    valor: FiltrosSeguimientoDocumental[K],
  ) => {
    setLimiteVisible(12);
    setFiltros((actuales) => ({ ...actuales, [clave]: valor }));
    setAplicados((actuales) => ({ ...actuales, [clave]: valor }));
  };
  const cambiarFechaRapida = (opcion: FechaRapida) => {
    setLimiteVisible(12);
    setFechaRapida(opcion);
    if (opcion === "PERSONALIZADO") {
      setMostrarMasFiltros(true);
      return;
    }
    const hoy = new Date();
    let fechaDesde: string | undefined;
    let fechaHasta: string | undefined;
    if (opcion === "HOY") fechaDesde = fechaHasta = fechaParaInput(hoy);
    if (opcion === "ULTIMOS_7_DIAS") {
      const inicio = new Date(hoy);
      inicio.setDate(inicio.getDate() - 6);
      fechaDesde = fechaParaInput(inicio);
      fechaHasta = fechaParaInput(hoy);
    }
    if (opcion === "ESTE_MES") {
      fechaDesde = fechaParaInput(
        new Date(hoy.getFullYear(), hoy.getMonth(), 1),
      );
      fechaHasta = fechaParaInput(hoy);
    }
    const fechas = { fecha_desde: fechaDesde, fecha_hasta: fechaHasta };
    setFiltros((actuales) => ({ ...actuales, ...fechas }));
    setAplicados((actuales) => ({ ...actuales, ...fechas }));
  };
  const cambiarFechaPersonalizada = (
    clave: "fecha_desde" | "fecha_hasta",
    valor: string | undefined,
  ) => {
    setFechaRapida("PERSONALIZADO");
    actualizarYAplicar(clave, valor);
  };
  const cambiarEstado = (estado: EstadoSeguimientoSimplificado | undefined) => {
    setLimiteVisible(12);
    const cambios = { estado_simple: estado, estado: undefined };
    setFiltros((actuales) => ({ ...actuales, ...cambios }));
    setAplicados((actuales) => ({ ...actuales, ...cambios }));
  };
  const limpiar = () => {
    setFiltros(INICIALES);
    setAplicados(INICIALES);
    setFechaRapida("SIN_RESTRICCION");
    setMostrarMasFiltros(false);
    setLimiteVisible(12);
  };

  if (cargando) return <CargandoDoc texto="Cargando seguimiento documental…" />;

  return (
    <div className="space-y-6">
      <EncabezadoDoc
        titulo="Seguimiento documental"
        descripcion="Consulta visual del recorrido real de los expedientes, sus ubicaciones y plazos, respetando el alcance documental del usuario."
      />
      {error && <AvisoDoc tipo="error">{error}</AvisoDoc>}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <ResumenCard
          etiqueta="En seguimiento"
          valor={resumen.en_seguimiento}
          clase="bg-blue-50 text-blue-700"
          icono="◉"
        />
        <ResumenCard
          etiqueta="Observados"
          valor={resumen.observados}
          clase="bg-amber-50 text-amber-700"
          icono="!"
        />
        <ResumenCard
          etiqueta="Próximos a vencer"
          valor={resumen.proximos_a_vencer}
          clase="bg-yellow-50 text-yellow-700"
          icono="◷"
        />
        <ResumenCard
          etiqueta="Vencidos"
          valor={resumen.vencidos}
          clase="bg-red-50 text-red-700"
          icono="⚠"
        />
        <ResumenCard
          etiqueta="Finalizados"
          valor={resumen.finalizados}
          clase="bg-emerald-50 text-emerald-700"
          icono="✓"
        />
      </section>
      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        {actualizando && (
          <p className="text-right text-xs font-semibold text-slate-500">
            Actualizando…
          </p>
        )}
        <label className="block text-sm font-semibold text-slate-700">
          Buscar documento
          <input
            type="search"
            className={`${campoDoc} mt-1 min-h-12 text-base`}
            value={filtros.busqueda ?? ""}
            onChange={(e) =>
              setFiltros((actuales) => ({
                ...actuales,
                busqueda: e.target.value,
              }))
            }
            placeholder="Buscar documento..."
            autoComplete="off"
          />
          <span className="mt-1 block text-xs font-normal text-slate-500">
            Código interno, Hoja de Ruta, número de origen, asunto o
            procedencia.
          </span>
        </label>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-sm font-semibold text-slate-700">
            Tipo documental
            <select
              className={`${campoDoc} mt-1`}
              value={filtros.tipo_documento ?? ""}
              onChange={(e) =>
                actualizarYAplicar(
                  "tipo_documento",
                  (e.target.value || undefined) as TipoDocumento | undefined,
                )
              }
            >
              <option value="">Todos los tipos</option>
              {TIPOS.map((tipo) => (
                <option key={tipo} value={tipo}>
                  {ETIQUETAS_TIPO[tipo]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-semibold text-slate-700">
            Fecha
            <select
              className={`${campoDoc} mt-1`}
              value={fechaRapida}
              onChange={(e) =>
                cambiarFechaRapida(e.target.value as FechaRapida)
              }
            >
              <option value="SIN_RESTRICCION">Sin restricción</option>
              <option value="HOY">Hoy</option>
              <option value="ULTIMOS_7_DIAS">Últimos 7 días</option>
              <option value="ESTE_MES">Este mes</option>
              <option value="PERSONALIZADO">Rango personalizado</option>
            </select>
          </label>
          <label className="text-sm font-semibold text-slate-700">
            Estado
            <select
              className={`${campoDoc} mt-1`}
              value={filtros.estado_simple ?? ""}
              onChange={(e) =>
                cambiarEstado(
                  (e.target.value || undefined) as
                    | EstadoSeguimientoSimplificado
                    | undefined,
                )
              }
            >
              <option value="">Todos</option>
              {ESTADOS_SIMPLES.map((estado) => (
                <option key={estado.valor} value={estado.valor}>
                  {estado.etiqueta}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            className={botonSecundarioDoc}
            aria-expanded={mostrarMasFiltros}
            onClick={() => setMostrarMasFiltros((visible) => !visible)}
          >
            {mostrarMasFiltros ? "Ocultar filtros" : "Más filtros"}
          </button>
          <button
            type="button"
            className={botonSecundarioDoc}
            onClick={limpiar}
          >
            Limpiar filtros
          </button>
        </div>
        {mostrarMasFiltros && (
          <div className="grid gap-3 border-t border-slate-200 pt-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-sm font-semibold text-slate-700">
              Fecha desde
              <input
                type="date"
                className={`${campoDoc} mt-1`}
                value={filtros.fecha_desde ?? ""}
                onChange={(e) =>
                  cambiarFechaPersonalizada(
                    "fecha_desde",
                    e.target.value || undefined,
                  )
                }
              />
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Fecha hasta
              <input
                type="date"
                className={`${campoDoc} mt-1`}
                value={filtros.fecha_hasta ?? ""}
                onChange={(e) =>
                  cambiarFechaPersonalizada(
                    "fecha_hasta",
                    e.target.value || undefined,
                  )
                }
              />
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Sección actual
              <select
                className={`${campoDoc} mt-1`}
                value={filtros.id_seccion ?? ""}
                onChange={(e) =>
                  actualizarYAplicar(
                    "id_seccion",
                    e.target.value ? Number(e.target.value) : undefined,
                  )
                }
              >
                <option value="">Todas</option>
                {secciones.map((seccion) => (
                  <option key={seccion.id_seccion} value={seccion.id_seccion}>
                    {seccion.nombre.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Situación del plazo
              <select
                className={`${campoDoc} mt-1`}
                value={filtros.situacion_plazo ?? ""}
                onChange={(e) =>
                  actualizarYAplicar(
                    "situacion_plazo",
                    (e.target.value || undefined) as
                      | SituacionPlazoDocumental
                      | undefined,
                  )
                }
              >
                <option value="">Todas</option>
                {SITUACIONES.map((situacion) => (
                  <option key={situacion.valor} value={situacion.valor}>
                    {situacion.etiqueta}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
      </section>
      <p className="text-sm font-semibold text-slate-700">
        {resultado?.documentos.length ?? 0}{" "}
        {(resultado?.documentos.length ?? 0) === 1
          ? "documento encontrado"
          : "documentos encontrados"}
      </p>
      {!resultado || resultado.documentos.length === 0 ? (
        <VacioDoc
          titulo="Sin expedientes visibles"
          descripcion="No hay documentos que coincidan con los filtros y el alcance autorizado."
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {resultado.documentos.slice(0, limiteVisible).map((documento) => (
            <CardDocumento
              key={documento.id_documento}
              documento={documento}
              ahora={ahora}
              resumenHistorico={resumenesHistoricos[documento.id_documento]}
              abrir={(id) => void abrirDetalle(id)}
            />
          ))}
        </div>
      )}
      {resultado && resultado.documentos.length > limiteVisible && (
        <div className="flex justify-center">
          <button
            type="button"
            className={botonSecundarioDoc}
            onClick={() => setLimiteVisible((actual) => actual + 12)}
          >
            Mostrar 12 expedientes más
          </button>
        </div>
      )}
      <ModalDoc
        abierto={idAbierto !== null}
        cerrar={() => {
          setIdAbierto(null);
          setDetalle(null);
        }}
        titulo="Seguimiento del expediente"
        descripcion={
          detalle
            ? `${detalle.documento.codigo_interno} · ${detalle.documento.asunto}`
            : "Cargando trazabilidad real…"
        }
        ancho="max-w-[96vw]"
      >
        {cargandoDetalle ? (
          <CargandoDoc texto="Cargando trazabilidad…" />
        ) : detalle ? (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#52796f]">
                  {nombreTipo(detalle.documento.tipo_documento)}
                </p>
                <p className="font-mono text-lg font-bold">
                  {detalle.documento.codigo_interno}
                </p>
              </div>
              <Link
                href={`/modulos/documentacion/${detalle.documento.id_documento}`}
                className={botonSecundarioDoc}
              >
                Abrir detalle
              </Link>
            </div>
            <WorkflowVisual trazabilidad={detalle} />
          </div>
        ) : (
          <VacioDoc
            titulo="No se pudo cargar el seguimiento"
            descripcion="Vuelva a intentarlo cuando el servicio documental esté disponible."
          />
        )}
      </ModalDoc>
    </div>
  );
}
