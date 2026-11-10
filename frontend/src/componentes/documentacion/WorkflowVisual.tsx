"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  PlazoDocumento,
  SeccionResumen,
  SituacionPlazoDocumental,
  Trazabilidad,
} from "../../tipos/documentacion";
import { fechaLegibleDoc } from "./InterfazDocumentacion";
import { formatearRetraso, situacionHistoricaPlazo } from "./plazos-historicos";

type EstadoEtapa =
  | "COMPLETADO"
  | "ACTUAL"
  | "EN_TRANSITO"
  | "PENDIENTE"
  | "OBSERVADO"
  | "VENCIDO";

interface Etapa {
  id: string;
  idSeccion?: number;
  nombre: string;
  estado: EstadoEtapa;
  fecha?: string | null;
  plazo?: PlazoDocumento;
  resultadoPlazo?: SituacionPlazoDocumental;
  detalle: {
    accion: string;
    usuario?: string;
    estado: string;
    observacion?: string | null;
    fechaEnvio?: string | null;
    fechaRecepcion?: string | null;
  };
}

interface Conexion {
  id: string;
  origen: number;
  destino: number;
  retorno: boolean;
  enTransito: boolean;
  fase: "IDA" | "CORRECCION" | "RETORNO";
  cierre?: boolean;
}

function etiquetaSeccion(nombre?: string | null) {
  return nombre ? nombre.replace(/_/g, " ") : "—";
}

function persona(usuario?: { nombres: string; apellidos: string } | null) {
  return usuario ? `${usuario.nombres} ${usuario.apellidos}` : undefined;
}

function ultimaPosicion<T>(items: T[], predicate: (item: T) => boolean) {
  for (let i = items.length - 1; i >= 0; i -= 1) {
    if (predicate(items[i])) return i;
  }
  return -1;
}

function indiceEtapaDelPlazo(
  etapas: Etapa[],
  plazo: PlazoDocumento,
  fechaProveido?: string,
) {
  const candidatas = etapas
    .map((etapa, indice) => ({ etapa, indice }))
    .filter(({ etapa }) => etapa.idSeccion === plazo.id_seccion_responsable);
  if (candidatas.length === 0) return -1;
  if (!fechaProveido) return candidatas[0].indice;

  const instanteProveido = new Date(fechaProveido).getTime();
  return (
    candidatas.find(
      ({ etapa }) =>
        !etapa.fecha || new Date(etapa.fecha).getTime() >= instanteProveido,
    ) ?? candidatas.at(-1)!
  ).indice;
}

function construirEtapas(trazabilidad: Trazabilidad, ahora: Date): Etapa[] {
  const { documento, expediente } = trazabilidad;
  if (!expediente) return [];

  const etapas: Etapa[] = [];
  const agregarEvento = (
    id: string,
    seccion: SeccionResumen | undefined | null,
    fecha: string | null | undefined,
    detalle: Etapa["detalle"],
  ) => {
    if (!seccion) return;
    etapas.push({
      id,
      idSeccion: seccion.id_seccion,
      nombre: etiquetaSeccion(seccion.nombre),
      estado: "PENDIENTE",
      fecha,
      detalle,
    });
  };

  agregarEvento("registro", documento.seccion_registro, documento.fecha_hora_registro, {
    accion: "Registro documental",
    usuario: persona(documento.usuario_registro),
    estado: "REGISTRADO",
  });

  for (const movimiento of expediente.movimientos ?? []) {
    if (
      movimiento.seccion_origen &&
      !etapas.some((etapa) => etapa.idSeccion === movimiento.id_seccion_origen)
    ) {
      agregarEvento(
        `origen-${movimiento.id_movimiento}`,
        movimiento.seccion_origen,
        movimiento.fecha_hora_envio,
        {
          accion: `${movimiento.tipo_movimiento}: enviado a ${etiquetaSeccion(movimiento.seccion_destino?.nombre)}`,
          usuario: persona(movimiento.usuario_envia),
          estado: "ENVIADO",
          fechaEnvio: movimiento.fecha_hora_envio,
        },
      );
    }
    agregarEvento(
      `movimiento-${movimiento.id_movimiento}`,
      movimiento.seccion_destino,
      movimiento.fecha_hora_recepcion ?? movimiento.fecha_hora_envio,
      {
        accion: movimiento.fecha_hora_recepcion
          ? `${movimiento.tipo_movimiento}: recibido desde ${etiquetaSeccion(movimiento.seccion_origen?.nombre)}`
          : `${movimiento.tipo_movimiento}: pendiente desde ${etiquetaSeccion(movimiento.seccion_origen?.nombre)}`,
        usuario: persona(movimiento.usuario_recibe ?? movimiento.usuario_envia),
        estado: movimiento.fecha_hora_recepcion
          ? movimiento.tipo_movimiento === "DEVOLUCION"
            ? "DEVOLUCIÓN RECIBIDA"
            : movimiento.tipo_movimiento === "REENVIO"
              ? "REENVÍO RECIBIDO"
              : "RECIBIDO"
          : "EN TRÁNSITO",
        observacion: movimiento.observacion,
        fechaEnvio: movimiento.fecha_hora_envio,
        fechaRecepcion: movimiento.fecha_hora_recepcion,
      },
    );
  }

  for (const cumplimiento of expediente.cumplimientos ?? []) {
    agregarEvento(
      `cumplimiento-${cumplimiento.id_cumplimiento}`,
      cumplimiento.seccion,
      cumplimiento.fecha_hora,
      {
        accion: "Cumplimiento registrado",
        usuario: persona(cumplimiento.usuario),
        estado: "CUMPLIMIENTO",
        observacion: cumplimiento.descripcion,
      },
    );
  }

  for (const relacion of documento.relaciones_como_origen ?? []) {
    if (relacion.tipo_relacion !== "RESPUESTA") continue;
    const respuesta = relacion.documento_relacionado;
    agregarEvento(
      `respuesta-${relacion.id_relacion}`,
      respuesta?.seccion_registro,
      respuesta?.fecha_hora_registro ?? relacion.fecha_hora,
      {
        accion: `Respuesta institucional ${respuesta?.codigo_interno ?? "registrada"}`,
        usuario: persona(respuesta?.usuario_registro),
        estado: "RESPUESTA CREADA",
        observacion: respuesta?.asunto,
      },
    );
  }

  for (const observacion of expediente.observaciones ?? []) {
    agregarEvento(
      `observacion-${observacion.id_observacion}`,
      observacion.seccion,
      observacion.fecha_hora,
      {
        accion: "Documento observado y devuelto al área",
        usuario: persona(observacion.usuario),
        estado: observacion.subsanada ? "OBSERVACIÓN SUBSANADA" : "OBSERVADO",
        observacion: observacion.descripcion,
      },
    );
  }

  for (const cambio of expediente.historial ?? []) {
    if (![
      "APROBADO",
      "FINALIZADO",
      "ARCHIVADO",
    ].includes(cambio.estado_nuevo)) continue;
    etapas.push({
      id: `estado-${cambio.id_historial}`,
      // FINALIZADO y ARCHIVADO son cierres del expediente, no otra visita a
      // RADIO ni a la sección que registró el cierre.
      idSeccion:
        cambio.estado_nuevo === "APROBADO"
          ? cambio.seccion?.id_seccion
          // Identificador visual exclusivo para poder enlazar el cierre sin
          // convertirlo en otra visita a la sección que lo registró.
          : -cambio.id_historial,
      nombre:
        cambio.estado_nuevo === "APROBADO"
          ? etiquetaSeccion(cambio.seccion?.nombre)
          : cambio.estado_nuevo,
      estado: "PENDIENTE",
      fecha: cambio.fecha_hora,
      detalle: {
        accion:
          cambio.estado_nuevo === "APROBADO"
            ? "Respuesta revisada y aprobada"
            : cambio.estado_nuevo === "FINALIZADO"
              ? "Expediente finalizado"
              : "Expediente archivado",
        usuario: persona(cambio.usuario),
        estado: cambio.estado_nuevo,
        observacion: cambio.motivo,
      },
    });
  }

  etapas.sort(
    (a, b) =>
      new Date(a.fecha ?? 0).getTime() - new Date(b.fecha ?? 0).getTime(),
  );

  // Una sección es un único nodo durante toda la vida del expediente. Los
  // eventos posteriores actualizan su detalle, pero nunca crean una tarjeta
  // duplicada al volver a esa misma sección.
  const porSeccion = new Map<string, Etapa>();
  for (const etapa of etapas) {
    const clave = etapa.idSeccion ? `seccion-${etapa.idSeccion}` : etapa.id;
    const existente = porSeccion.get(clave);
    if (existente) {
      existente.fecha = etapa.fecha;
      existente.detalle = etapa.detalle;
    } else {
      porSeccion.set(clave, etapa);
    }
  }
  const etapasUnicas = [...porSeccion.values()];

  const seccionActual = expediente.seccion_actual;
  const ultimoIndiceSeccion = ultimaPosicion(
    etapasUnicas,
    (etapa) => etapa.idSeccion === seccionActual?.id_seccion,
  );
  const indiceActual =
    expediente.estado_actual === "ARCHIVADO"
      ? ultimaPosicion(etapasUnicas, (etapa) => etapa.nombre === "ARCHIVADO")
      : expediente.estado_actual === "FINALIZADO"
        ? ultimaPosicion(etapasUnicas, (etapa) => etapa.nombre === "FINALIZADO")
        : ultimoIndiceSeccion >= 0
          ? ultimoIndiceSeccion
          : Math.max(0, etapasUnicas.length - 1);

  for (const plazo of trazabilidad.plazos ?? []) {
    const proveido = expediente.hoja_ruta?.proveidos?.find(
      (item) => item.id_proveido === plazo.id_proveido,
    );
    const indice = indiceEtapaDelPlazo(etapasUnicas, plazo, proveido?.fecha_hora);
    if (indice >= 0) etapasUnicas[indice].plazo = plazo;
  }

  // El único plazo que puede determinar el estado actual llega calculado por
  // el backend. El historial permanece consultable, pero nunca puede volver
  // rojo al nodo que representa la etapa actual.
  const plazoVigente = trazabilidad.plazo_vigente;
  if (indiceActual >= 0) {
    etapasUnicas[indiceActual].plazo =
      plazoVigente?.id_seccion_responsable === seccionActual?.id_seccion
        ? (plazoVigente ?? undefined)
        : undefined;
  }

  return etapasUnicas.map((etapa, indice) => {
    let estado: EstadoEtapa = indice < indiceActual ? "COMPLETADO" : "PENDIENTE";
    if (etapa.detalle.estado === "EN TRÁNSITO") estado = "EN_TRANSITO";
    const esPlazoActivo =
      indice === indiceActual &&
      etapa.idSeccion === seccionActual?.id_seccion &&
      etapa.plazo?.id_plazo === plazoVigente?.id_plazo &&
      plazoVigente?.id_seccion_responsable === seccionActual?.id_seccion;
    const resultadoPlazo = etapa.plazo
      ? situacionHistoricaPlazo(etapa.plazo, ahora, esPlazoActivo)
      : undefined;
    if (indice === indiceActual) {
      estado =
        resultadoPlazo === "VENCIDO"
          ? "VENCIDO"
          : expediente.estado_actual === "OBSERVADO"
            ? "OBSERVADO"
            : "ACTUAL";
    }
    if (
      etapa.nombre === "FINALIZADO" &&
      expediente.estado_actual === "ARCHIVADO"
    ) {
      estado = "COMPLETADO";
    }
    if (
      etapa.nombre === "ARCHIVADO" &&
      expediente.estado_actual === "ARCHIVADO"
    ) {
      estado = "ACTUAL";
    }
    return { ...etapa, estado, resultadoPlazo };
  });
}

function construirConexiones(trazabilidad: Trazabilidad): Conexion[] {
  const fechaAprobacion = [...(trazabilidad.expediente?.historial ?? [])]
    .filter((evento) => evento.estado_nuevo === "APROBADO")
    .at(-1)?.fecha_hora;
  const movimientos = [...(trazabilidad.expediente?.movimientos ?? [])].sort(
    (a, b) =>
      new Date(a.fecha_hora_envio).getTime() -
      new Date(b.fecha_hora_envio).getTime(),
  );
  const conexiones: Conexion[] = [];
  for (const movimiento of movimientos) {
    const { id_seccion_origen: origen, id_seccion_destino: destino } = movimiento;
    if (!origen || !destino || origen === destino) continue;
    const esCorreccion =
      movimiento.tipo_movimiento === "DEVOLUCION" ||
      movimiento.tipo_movimiento === "REENVIO";
    const esRetorno =
      !esCorreccion &&
      !!fechaAprobacion &&
      new Date(movimiento.fecha_hora_envio) >= new Date(fechaAprobacion);
    conexiones.push({
      id: `conexion-${movimiento.id_movimiento}`,
      origen,
      destino,
      retorno: esCorreccion,
      enTransito: movimiento.estado_movimiento === "PENDIENTE",
      fase: esCorreccion ? "CORRECCION" : esRetorno ? "RETORNO" : "IDA",
    });
  }
  let origenCierre: number | null = null;
  for (const cambio of trazabilidad.expediente?.historial ?? []) {
    if (
      !["FINALIZADO", "ARCHIVADO"].includes(cambio.estado_nuevo) ||
      !cambio.seccion?.id_seccion
    ) {
      continue;
    }
    conexiones.push({
      id: `cierre-${cambio.id_historial}`,
      // El cierre institucional parte visualmente desde RADIO, que es el
      // origen y destino final del circuito documental.
      origen:
        origenCierre ??
        trazabilidad.documento.seccion_registro?.id_seccion ??
        cambio.seccion.id_seccion,
      destino: -cambio.id_historial,
      retorno: false,
      enTransito: false,
      fase: "RETORNO",
      cierre: true,
    });
    origenCierre = -cambio.id_historial;
  }
  return conexiones;
}

function etiquetaResultadoPlazo(resultado?: SituacionPlazoDocumental) {
  if (resultado === "CUMPLIDO") return "EN PLAZO";
  if (resultado === "CUMPLIDO_TARDE") return "CUMPLIDO TARDE";
  if (resultado === "PROXIMO_A_VENCER") return "PRÓXIMO A VENCER";
  if (resultado === "VENCE_HOY") return "VENCE HOY";
  if (resultado === "VENCIDO") return "VENCIDO";
  if (resultado === "EN_PLAZO") return "EN PLAZO";
  return undefined;
}

function presentacionEtapa(etapa: Etapa) {
  if (etapa.nombre === "ARCHIVADO") {
    return {
      circulo: "border-slate-800 bg-slate-800 text-white ring-4 ring-slate-100",
      texto: "text-slate-800",
      icono: "■",
    };
  }
  if (etapa.nombre === "FINALIZADO") {
    return {
      circulo: "border-blue-700 bg-blue-600 text-white ring-4 ring-blue-100",
      texto: "text-blue-800",
      icono: "✓",
    };
  }
  if (
    etapa.detalle.estado.includes("OBSERV") ||
    etapa.detalle.estado.includes("DEVOLUCIÓN")
  ) {
    return {
      circulo: "border-amber-600 bg-amber-100 text-amber-900 ring-4 ring-amber-50",
      texto: "text-amber-900",
      icono: "↩",
    };
  }
  if (etapa.detalle.estado.includes("REENVÍO")) {
    return {
      circulo: "border-indigo-600 bg-indigo-100 text-indigo-800 ring-4 ring-indigo-50",
      texto: "text-indigo-800",
      icono: "↗",
    };
  }
  if (etapa.resultadoPlazo === "CUMPLIDO_TARDE") {
    return {
      circulo: "border-red-700 bg-red-600 text-white shadow-md shadow-red-200",
      texto: "text-red-800",
      icono: "✓",
    };
  }
  if (etapa.resultadoPlazo === "VENCIDO") {
    return {
      circulo: "border-red-700 bg-red-600 text-white shadow-md shadow-red-200",
      texto: "text-red-800",
      icono: "⚠",
    };
  }
  if (
    etapa.resultadoPlazo === "PROXIMO_A_VENCER" ||
    etapa.resultadoPlazo === "VENCE_HOY"
  ) {
    return {
      circulo: "border-amber-500 bg-amber-100 text-amber-900",
      texto: "text-amber-900",
      icono: "!",
    };
  }
  if (etapa.estado === "COMPLETADO") {
    return {
      circulo: "border-emerald-600 bg-emerald-600 text-white",
      texto: "text-emerald-800",
      icono: "✓",
    };
  }
  if (etapa.estado === "OBSERVADO") {
    return {
      circulo: "border-amber-500 bg-amber-100 text-amber-800",
      texto: "text-amber-900",
      icono: "!",
    };
  }
  if (etapa.estado === "EN_TRANSITO") {
    return {
      circulo: "border-sky-600 bg-sky-100 text-sky-800 ring-4 ring-sky-50",
      texto: "text-sky-800",
      icono: "→",
    };
  }
  if (etapa.estado === "ACTUAL") {
    return {
      circulo:
        "border-[#1b4332] bg-[#d8f3dc] text-[#1b4332] ring-4 ring-[#d8f3dc]",
      texto: "text-[#1b4332]",
      icono: "●",
    };
  }
  return {
    circulo: "border-slate-300 bg-slate-100 text-slate-400",
    texto: "text-slate-400",
    icono: "○",
  };
}

function IconoFlechaDireccion() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 12h15" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}

function textoEtapa(etapa: Etapa) {
  const resultado = etiquetaResultadoPlazo(etapa.resultadoPlazo);
  if (resultado) return resultado;
  if (etapa.estado === "ACTUAL") return "ACTUAL";
  if (etapa.estado === "OBSERVADO") return "OBSERVADO";
  return etapa.detalle.estado;
}

function fechaBreve(fecha?: string | null) {
  if (!fecha) return "—";
  return new Intl.DateTimeFormat("es-BO", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/La_Paz",
  }).format(new Date(fecha));
}

function trazoConexion(
  conexion: Conexion,
  posiciones: Record<number, { x: number; y: number }>,
) {
  const origen = posiciones[conexion.origen];
  const destino = posiciones[conexion.destino];
  if (!origen || !destino) return null;
  if (conexion.cierre) {
    const margenNodo = 27;
    if (Math.abs(origen.y - destino.y) < 8) {
      const direccion = destino.x >= origen.x ? 1 : -1;
      return `M ${origen.x + direccion * margenNodo} ${origen.y} H ${destino.x - direccion * margenNodo}`;
    }
    const direccion = destino.x >= origen.x ? 1 : -1;
    // El primer tramo sale por el lado externo de RADIO y baja fuera de las
    // etiquetas de la fila superior antes de dirigirse al cierre.
    const codoX = origen.x - margenNodo - 24;
    return `M ${origen.x - margenNodo} ${origen.y} H ${codoX} V ${destino.y} H ${destino.x - direccion * margenNodo}`;
  }
  const distancia = Math.hypot(destino.x - origen.x, destino.y - origen.y);
  if (distancia === 0) return null;
  // Evita que el trazo y su punta entren al círculo: ambos quedan limpios
  // en el borde del nodo, incluso cuando la conexión es de retorno.
  const margenNodo = 27;
  const inicio = {
    x: origen.x + ((destino.x - origen.x) / distancia) * margenNodo,
    y: origen.y + ((destino.y - origen.y) / distancia) * margenNodo,
  };
  const curva = conexion.retorno
    ? Math.max(origen.y, destino.y) + 30
    : (origen.y + destino.y) / 2;
  const control = { x: (origen.x + destino.x) / 2, y: curva };
  const tramoFinal = Math.hypot(destino.x - control.x, destino.y - control.y);
  const fin = {
    x: destino.x - ((destino.x - control.x) / tramoFinal) * margenNodo,
    y: destino.y - ((destino.y - control.y) / tramoFinal) * margenNodo,
  };
  return `M ${inicio.x} ${inicio.y} Q ${control.x} ${control.y} ${fin.x} ${fin.y}`;
}

export default function WorkflowVisual({
  trazabilidad,
}: {
  trazabilidad: Trazabilidad;
}) {
  const [ahora, setAhora] = useState(() => new Date());
  const etapas = useMemo(
    () => construirEtapas(trazabilidad, ahora),
    [trazabilidad, ahora],
  );
  const conexiones = useMemo(() => construirConexiones(trazabilidad), [trazabilidad]);
  const indiceActual = Math.max(
    0,
    etapas.findIndex((etapa) =>
      ["ACTUAL", "OBSERVADO", "VENCIDO"].includes(etapa.estado),
    ),
  );
  const [seleccionada, setSeleccionada] = useState(indiceActual);
  const [conexionAnimada, setConexionAnimada] = useState<string | null>(null);
  const [posiciones, setPosiciones] = useState<Record<number, { x: number; y: number }>>({});
  const recorridoRef = useRef<HTMLOListElement | null>(null);
  const nodoRefs = useRef(new Map<number, HTMLButtonElement>());
  const firmaMovimientoAnterior = useRef<string | null>(null);
  const etapa = etapas[seleccionada] ?? etapas[indiceActual];

  useEffect(() => {
    const reloj = window.setInterval(() => setAhora(new Date()), 60_000);
    return () => window.clearInterval(reloj);
  }, []);

  useEffect(() => {
    const actualizarPosiciones = () => {
      const recorrido = recorridoRef.current;
      if (!recorrido) return;
      const contenedor = recorrido.getBoundingClientRect();
      const siguientes: Record<number, { x: number; y: number }> = {};
      nodoRefs.current.forEach((nodo, idSeccion) => {
        const rect = nodo.getBoundingClientRect();
        siguientes[idSeccion] = {
          x: rect.left - contenedor.left + rect.width / 2,
          y: rect.top - contenedor.top + 24,
        };
      });
      setPosiciones(siguientes);
    };
    actualizarPosiciones();
    const observador = new ResizeObserver(actualizarPosiciones);
    if (recorridoRef.current) observador.observe(recorridoRef.current);
    window.addEventListener("resize", actualizarPosiciones);
    return () => {
      observador.disconnect();
      window.removeEventListener("resize", actualizarPosiciones);
    };
  }, [etapas]);

  useEffect(() => {
    const movimiento = trazabilidad.expediente?.movimientos?.at(-1);
    const firma = movimiento
      ? `${movimiento.id_movimiento}:${movimiento.estado_movimiento}:${movimiento.fecha_hora_recepcion ?? ""}`
      : "SIN_MOVIMIENTO";
    const anterior = firmaMovimientoAnterior.current;
    firmaMovimientoAnterior.current = firma;
    if (!anterior || anterior === firma || anterior === "SIN_MOVIMIENTO") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const inicio = window.requestAnimationFrame(() => {
      setConexionAnimada(movimiento ? `conexion-${movimiento.id_movimiento}` : null);
    });
    const temporizador = window.setTimeout(() => setConexionAnimada(null), 2400);
    return () => {
      window.cancelAnimationFrame(inicio);
      window.clearTimeout(temporizador);
    };
  }, [trazabilidad, indiceActual]);

  if (etapas.length === 0) return null;

  const resultadoSeleccionado = etiquetaResultadoPlazo(etapa?.resultadoPlazo);
  const retraso = etapa?.plazo
    ? formatearRetraso(
        etapa.plazo.fecha_hora_limite,
        etapa.plazo.fecha_hora_cumplimiento,
      )
    : null;

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#52796f]">
            Recorrido real
          </p>
          <p className="mt-1 text-sm text-slate-600">
            Cada punto corresponde a un evento registrado en el expediente.
          </p>
          </div>
          <div className="flex flex-wrap gap-3 text-[11px] font-semibold text-slate-600">
            <span className="text-emerald-700">● Completado</span>
            <span className="text-[#1b4332]">● Actual</span>
            <span className="text-sky-700">→ En tránsito</span>
            <span className="text-amber-700">● Observado</span>
          </div>
        </div>
        <ol ref={recorridoRef} className="relative flex flex-wrap justify-center gap-y-8">
          <svg
            className="pointer-events-none absolute inset-0 size-full overflow-visible"
            aria-hidden="true"
          >
            <defs>
              <marker id="flecha-flujo" viewBox="0 0 12 12" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto" markerUnits="userSpaceOnUse">
                <path d="M1 1 11 6 1 11Z" fill="#10b981" />
              </marker>
              <marker id="flecha-transito" viewBox="0 0 12 12" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto" markerUnits="userSpaceOnUse">
                <path d="M1 1 11 6 1 11Z" fill="#38bdf8" />
              </marker>
              <marker id="flecha-retorno" viewBox="0 0 12 12" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto" markerUnits="userSpaceOnUse">
                <path d="M1 1 11 6 1 11Z" fill="#f59e0b" />
              </marker>
            </defs>
            {conexiones.map((conexion) => {
              const trazo = trazoConexion(conexion, posiciones);
              if (!trazo) return null;
              const color = conexion.retorno
                ? "#f59e0b"
                : conexion.enTransito
                  ? "#38bdf8"
                  : "#10b981";
              return (
                <g key={conexion.id}>
                  <path
                    d={trazo}
                    fill="none"
                    stroke={color}
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    markerEnd={`url(#${conexion.retorno ? "flecha-retorno" : conexion.enTransito ? "flecha-transito" : "flecha-flujo"})`}
                  />
                  {conexionAnimada === conexion.id && (
                    <circle r="6" fill="#1b4332">
                      <animateMotion dur="2.4s" repeatCount="1" fill="freeze" path={trazo} />
                    </circle>
                  )}
                </g>
              );
            })}
          </svg>
          {etapas.map((item, indice) => {
            const presentacion = presentacionEtapa(item);
            return (
              <li key={item.id} className="relative flex w-36 justify-center sm:w-40">
                <button
                  type="button"
                  ref={(nodo) => {
                    if (item.idSeccion && nodo) nodoRefs.current.set(item.idSeccion, nodo);
                  }}
                  className={`group relative z-10 flex w-[8.5rem] flex-col items-center rounded-xl px-2 pb-2 pt-0 text-center transition sm:w-36 ${seleccionada === indice ? "bg-[#f0fff4] ring-2 ring-[#b7e4c7]" : "hover:bg-slate-50"}`}
                  onClick={() => setSeleccionada(indice)}
                  aria-label={`Ver detalle de ${item.nombre}`}
                >
                  <span className="relative">
                    {item.estado === "ACTUAL" && (
                      <span className="absolute inset-0 animate-ping rounded-full bg-[#52b788] opacity-30 motion-reduce:animate-none" />
                    )}
                    <span
                      className={`relative flex size-12 items-center justify-center rounded-full border-2 text-lg font-bold transition ${presentacion.circulo}`}
                    >
                      {item.estado === "EN_TRANSITO" ? (
                        <IconoFlechaDireccion />
                      ) : (
                        presentacion.icono
                      )}
                    </span>
                  </span>
                  <span
                    className={`mt-3 text-xs font-bold uppercase ${presentacion.texto}`}
                  >
                    {item.nombre}
                  </span>
                  <span className="mt-1 text-[10px] leading-4 text-slate-500">
                    {fechaBreve(item.fecha)}
                  </span>
                  <span className={`mt-1 min-h-8 text-[10px] font-bold uppercase leading-4 ${presentacion.texto}`}>
                    {textoEtapa(item)}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </section>

      {etapa && (
        <section className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-bold uppercase tracking-wide text-[#1b4332]">
              Detalle · {etapa.nombre}
            </h3>
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-bold ${etapa.resultadoPlazo === "CUMPLIDO_TARDE" || etapa.resultadoPlazo === "VENCIDO" ? "bg-red-100 text-red-800" : etapa.resultadoPlazo === "PROXIMO_A_VENCER" || etapa.resultadoPlazo === "VENCE_HOY" || etapa.estado === "OBSERVADO" ? "bg-amber-100 text-amber-800" : etapa.estado === "COMPLETADO" ? "bg-emerald-100 text-emerald-800" : "bg-[#d8f3dc] text-[#1b4332]"}`}
            >
              {resultadoSeleccionado ?? etapa.estado}
            </span>
          </div>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <dt className="text-xs font-semibold text-slate-500">Sección</dt>
              <dd>{etapa.nombre}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-slate-500">Plazo</dt>
              <dd>{fechaLegibleDoc(etapa.plazo?.fecha_hora_limite)}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-slate-500">
                Cumplimiento
              </dt>
              <dd>{fechaLegibleDoc(etapa.plazo?.fecha_hora_cumplimiento)}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-slate-500">
                Resultado
              </dt>
              <dd>{resultadoSeleccionado ?? "SIN PLAZO"}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-slate-500">Retraso</dt>
              <dd>{retraso ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-slate-500">Acción</dt>
              <dd>{etapa.detalle.accion}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-slate-500">
                Fecha y hora
              </dt>
              <dd>{fechaLegibleDoc(etapa.fecha)}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-slate-500">Envío</dt>
              <dd>{fechaLegibleDoc(etapa.detalle.fechaEnvio)}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-slate-500">Recepción</dt>
              <dd>
                {etapa.detalle.fechaEnvio && !etapa.detalle.fechaRecepcion
                  ? "PENDIENTE DE RECEPCIÓN"
                  : fechaLegibleDoc(etapa.detalle.fechaRecepcion)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-slate-500">
                Usuario responsable
              </dt>
              <dd>{etapa.detalle.usuario ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-slate-500">
                Observación
              </dt>
              <dd>{etapa.detalle.observacion ?? "—"}</dd>
            </div>
          </dl>
        </section>
      )}
    </div>
  );
}
