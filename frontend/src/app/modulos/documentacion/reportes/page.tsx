"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import {
  AvisoDoc, CargandoDoc, EncabezadoDoc, PaginaProtegidaDocumentacion,
  PERMISOS_DOC, VacioDoc, botonPrimarioDoc, botonSecundarioDoc, campoDoc,
  esActorGlobalDocumental, fechaLegibleDoc,
} from "../../../../componentes/documentacion/InterfazDocumentacion";
import { useAuth } from "../../../../contextos/AuthContext";
import { conectarDocumentacion } from "../../../../servicios/documentacion/documentacion-socket.service";
import { mensajeErrorApi, obtenerSeccionesDocumentales, obtenerSeguimientoDocumental } from "../../../../servicios/documentacion/documentacion.service";
import {
  EstadoDocumento, FiltrosSeguimientoDocumental, SeguimientoDocumental,
  TarjetaSeguimientoDocumental, TipoDocumento,
} from "../../../../tipos/documentacion";
import { Seccion } from "../../../../tipos/seccion";

const TIPOS: TipoDocumento[] = ["RADIOGRAMA", "MEMORANDUM", "OFICIO", "NOTA_SERVICIO", "INFORME", "DIRECTIVA", "CIRCULAR", "PARTE"];
const ESTADOS: EstadoDocumento[] = ["REGISTRADO", "EN_TRANSITO", "EN_TRAMITE", "OBSERVADO", "APROBADO", "FINALIZADO", "ARCHIVADO"];
const INICIALES: FiltrosSeguimientoDocumental = { modo: "HISTORICO", pestana: "TODOS" };

function ReportesDocumentales() {
  const { token, usuario } = useAuth();
  const esGlobal = esActorGlobalDocumental(usuario);
  const [filtros, setFiltros] = useState(INICIALES);
  const [filtrosAplicados, setFiltrosAplicados] = useState(INICIALES);
  const [impresion, setImpresion] = useState<{ documentos: TarjetaSeguimientoDocumental[]; individual: boolean; generado: string } | null>(null);
  const [resultado, setResultado] = useState<SeguimientoDocumental | null>(null);
  const [secciones, setSecciones] = useState<Seccion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  const consultar = useCallback(async (criterios: FiltrosSeguimientoDocumental) => {
    setCargando(true); setError("");
    try { setResultado(await obtenerSeguimientoDocumental(criterios)); setFiltrosAplicados(criterios); }
    catch (e) { setError(mensajeErrorApi(e)); }
    finally { setCargando(false); }
  }, []);

  useEffect(() => {
    let vigente = true;
    const carga = esGlobal
      ? Promise.all([obtenerSeguimientoDocumental(INICIALES), obtenerSeccionesDocumentales()])
      : Promise.all([obtenerSeguimientoDocumental(INICIALES), Promise.resolve([] as Seccion[])]);
    void carga
      .then(([reporte, areas]) => {
        if (!vigente) return;
        setResultado(reporte);
        setFiltrosAplicados(INICIALES);
        setSecciones(areas);
      })
      .catch((e) => { if (vigente) setError(mensajeErrorApi(e)); })
      .finally(() => { if (vigente) setCargando(false); });
    return () => { vigente = false; };
  }, [esGlobal]);

  useEffect(() => {
    if (!token) return;
    const socket = conectarDocumentacion(token);
    const refrescar = () => void consultar(filtros);
    socket.on("documento:evento", refrescar);
    return () => { socket.off("documento:evento", refrescar); };
  }, [token, filtros, consultar]);

  const actualizar = <K extends keyof FiltrosSeguimientoDocumental>(clave: K, valor: FiltrosSeguimientoDocumental[K]) =>
    setFiltros((actual) => ({ ...actual, [clave]: valor }));
  const limpiar = () => {
    const siguientes = { ...INICIALES };
    setFiltros(siguientes); void consultar(siguientes);
  };
  const areaSeleccionada = secciones.find((s) => s.id_seccion === filtrosAplicados.id_seccion)?.nombre;
  const alcance = esGlobal ? areaSeleccionada ?? "Todas las áreas" : usuario?.seccion?.replaceAll("_", " ") ?? "Mi área";
  const detalleFiltros = useMemo(() => [
    `Área: ${alcance}`,
    filtrosAplicados.fecha_desde && `Desde: ${filtrosAplicados.fecha_desde}`, filtrosAplicados.fecha_hasta && `Hasta: ${filtrosAplicados.fecha_hasta}`,
    filtrosAplicados.tipo_documento && `Tipo: ${filtrosAplicados.tipo_documento}`, filtrosAplicados.estado && `Estado: ${filtrosAplicados.estado}`,
    filtrosAplicados.codigo_interno && `Código: ${filtrosAplicados.codigo_interno}`, filtrosAplicados.numero_hoja_ruta && `HR: ${filtrosAplicados.numero_hoja_ruta}`,
    filtrosAplicados.asunto && `Asunto: ${filtrosAplicados.asunto}`,
  ].filter(Boolean).join(" · "), [alcance, filtrosAplicados]);

  const descargar = (documento?: TarjetaSeguimientoDocumental) => {
    const documentos = documento ? [documento] : resultado?.documentos ?? [];
    if (cargando || !documentos.length) return;
    flushSync(() => setImpresion({ documentos, individual: Boolean(documento), generado: new Date().toLocaleString("es-BO", { timeZone: "America/La_Paz" }) }));
    window.print();
  };

  return <div className="space-y-6">
    {impresion && createPortal(<ReporteImpresion {...impresion} alcance={alcance} filtros={detalleFiltros} />, document.body)}
    <div className="no-imprimir"><EncabezadoDoc titulo="Reportes documentales" descripcion={`Documentos que pasaron por ${alcance}.`} /></div>
    {error && <AvisoDoc tipo="error">{error}</AvisoDoc>}
    <AvisoDoc tipo="info"><strong>Documentos que pasaron por {alcance}.</strong> El periodo considera fechas reales de recepción y envío.</AvisoDoc>
    <section className="no-imprimir grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
      <Campo texto="Desde"><input type="date" className={campoDoc} value={filtros.fecha_desde ?? ""} onChange={(e) => actualizar("fecha_desde", e.target.value || undefined)} /></Campo>
      <Campo texto="Hasta"><input type="date" className={campoDoc} value={filtros.fecha_hasta ?? ""} onChange={(e) => actualizar("fecha_hasta", e.target.value || undefined)} /></Campo>
      <Campo texto="Tipo"><select className={campoDoc} value={filtros.tipo_documento ?? ""} onChange={(e) => actualizar("tipo_documento", (e.target.value || undefined) as TipoDocumento | undefined)}><option value="">Todos</option>{TIPOS.map((v) => <option key={v} value={v}>{v.replaceAll("_", " ")}</option>)}</select></Campo>
      <Campo texto="Estado"><select className={campoDoc} value={filtros.estado ?? ""} onChange={(e) => actualizar("estado", (e.target.value || undefined) as EstadoDocumento | undefined)}><option value="">Todos</option>{ESTADOS.map((v) => <option key={v} value={v}>{v.replaceAll("_", " ")}</option>)}</select></Campo>
      <Campo texto="Código"><input className={campoDoc} value={filtros.codigo_interno ?? ""} onChange={(e) => actualizar("codigo_interno", e.target.value || undefined)} placeholder="DOC-..." /></Campo>
      <Campo texto="Hoja de Ruta"><input className={campoDoc} value={filtros.numero_hoja_ruta ?? ""} onChange={(e) => actualizar("numero_hoja_ruta", e.target.value || undefined)} placeholder="HR-..." /></Campo>
      <Campo texto="Asunto"><input className={campoDoc} value={filtros.asunto ?? ""} onChange={(e) => actualizar("asunto", e.target.value || undefined)} placeholder="Texto del asunto" /></Campo>
      {esGlobal && <Campo texto="Área"><select className={campoDoc} value={filtros.id_seccion ?? ""} onChange={(e) => actualizar("id_seccion", e.target.value ? Number(e.target.value) : undefined)}><option value="">Todas las áreas</option>{secciones.map((s) => <option key={s.id_seccion} value={s.id_seccion}>{s.nombre}</option>)}</select></Campo>}
      <div className="flex items-end gap-2 lg:col-span-4">
        <button className={botonPrimarioDoc} onClick={() => void consultar({ ...filtros, modo: "HISTORICO", pestana: "TODOS" })}>Aplicar filtros</button>
        <button className={botonSecundarioDoc} onClick={limpiar}>Limpiar</button>
        <button className={botonSecundarioDoc} disabled={cargando || !resultado?.documentos.length} onClick={() => descargar()}>Descargar PDF</button>
      </div>
    </section>
    {cargando ? <CargandoDoc texto="Generando reporte…" /> : <Reporte resultado={resultado} alcance={alcance} filtros={detalleFiltros} descargar={descargar} />}
  </div>;
}

function Campo({ texto, children }: { texto: string; children: React.ReactNode }) {
  return <label className="space-y-1 text-sm font-semibold text-slate-700"><span>{texto}</span>{children}</label>;
}

function Reporte({ resultado, alcance, filtros, descargar }: { resultado: SeguimientoDocumental | null; alcance: string; filtros: string; descargar: (documento: TarjetaSeguimientoDocumental) => void }) {
  if (!resultado?.documentos.length) return <VacioDoc titulo="Sin documentos" descripcion="No existen documentos autorizados que coincidan con los filtros." />;
  return <section className="reporte-imprimible space-y-4">
    <header><h1 className="text-2xl font-bold text-slate-950">Reporte documental — {alcance}</h1><p className="mt-1 text-xs text-slate-600">{filtros}</p><p className="mt-1 text-xs text-slate-500">Generado: {new Date().toLocaleString("es-BO")}</p></header>
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white"><table className="w-full text-left text-xs"><thead className="bg-[#172554] text-white"><tr>{["N°", "Código", "Tipo", "Asunto", "Hoja de Ruta", "Origen", "Destino", "Fecha recepción", "Fecha envío", "Estado", "Responsable", "Detalle", "Reporte"].map((v) => <th key={v} className="p-3">{v}</th>)}</tr></thead><tbody>{resultado.documentos.map((d, indice) => <Fila key={d.id_documento} documento={d} numero={indice + 1} descargar={descargar} />)}</tbody></table></div>
    <footer className="text-xs text-slate-500">Total: {resultado.documentos.length} documento(s). Reporte generado con los filtros visibles indicados.</footer>
  </section>;
}

function Fila({ documento: d, numero, descargar }: { documento: TarjetaSeguimientoDocumental; numero: number; descargar: (documento: TarjetaSeguimientoDocumental) => void }) {
  const recorrido = d.recorrido_reporte ?? d.movimientos_area ?? [];
  return <tr className="border-t border-slate-100 align-top"><td className="p-3">{numero}</td><td className="p-3"><Link className="font-mono font-bold text-[#1b4332] hover:underline print:text-black" href={`/modulos/documentacion/${d.id_documento}`}>{d.codigo_interno}</Link></td><td className="p-3">{d.tipo_documento.replaceAll("_", " ")}</td><td className="max-w-xs p-3">{d.asunto}</td><td className="p-3 font-mono">{d.numero_hoja_ruta ?? "—"}</td><td className="p-3">{d.origen?.nombre ?? "—"}</td><td className="p-3">{d.destino?.nombre ?? "—"}</td><td className="whitespace-nowrap p-3">{d.fecha_recepcion ? fechaLegibleDoc(d.fecha_recepcion) : "—"}</td><td className="whitespace-nowrap p-3">{d.fecha_envio ? fechaLegibleDoc(d.fecha_envio) : "—"}</td><td className="p-3">{d.estado_actual.replaceAll("_", " ")}</td><td className="p-3">{d.responsable_actual ? `${d.responsable_actual.nombres} ${d.responsable_actual.apellidos}` : "Sin asignar"}</td><td className="p-3"><details className="no-imprimir"><summary className="cursor-pointer font-semibold text-[#1b4332]">{recorrido.length} movimiento(s)</summary><ol className="mt-2 min-w-64 space-y-2">{[...recorrido].reverse().map((movimiento, indice) => <li key={`${movimiento.fecha_envio}-${indice}`}><strong>{movimiento.origen.nombre} → {movimiento.destino.nombre}</strong><br />Envío: {fechaLegibleDoc(movimiento.fecha_envio)}<br />Recepción: {movimiento.fecha_recepcion ? fechaLegibleDoc(movimiento.fecha_recepcion) : "Pendiente"}</li>)}</ol></details></td><td className="p-3"><button className={botonSecundarioDoc} onClick={() => descargar(d)} aria-label={`Descargar reporte de ${d.codigo_interno}`}>Descargar reporte</button></td></tr>;
}

function etiquetaIncidencia(tipo: NonNullable<TarjetaSeguimientoDocumental['incidencias_reporte']>[number]['tipo']) {
  if (tipo === "OBSERVACION") return "Observación";
  if (tipo === "RECEPCION_TARDIA") return "Recepción fuera de plazo";
  return "Demora en la dependencia";
}
function ReporteImpresion({ documentos, individual, generado, alcance, filtros }: {
  documentos: TarjetaSeguimientoDocumental[]; individual: boolean; generado: string; alcance: string; filtros: string;
}) {
  return <section className="reporte-pdf-documental">
    <style>{`
      .reporte-pdf-documental { display: none; }
      @media print {
        @page { size: A4 portrait; margin: 16mm; }
        body:has(> .reporte-pdf-documental) > :not(.reporte-pdf-documental) { display: none !important; }
        body:has(> .reporte-pdf-documental) { display: block !important; margin: 0 !important; background: white !important; }
        .reporte-pdf-documental { display: block; color: #172554; font: 10pt/1.5 Arial, sans-serif; overflow-wrap: anywhere; }
        .reporte-pdf-documental h1 { font-size: 17pt; font-weight: bold; margin: 0 0 12pt; }
        .reporte-pdf-documental h2 { font-size: 12pt; font-weight: bold; margin: 0 0 8pt; }
        .reporte-pdf-documental h3 { font-size: 10pt; font-weight: bold; margin: 14pt 0 4pt; }
        .reporte-pdf-documental header, .reporte-pdf-documental h2, .reporte-pdf-documental h3, .reporte-pdf-documental .cantidad { break-after: avoid; }
        .reporte-pdf-documental article { border-top: 1pt solid #64748b; margin-top: 18pt; padding-top: 12pt; }
        .reporte-pdf-documental p { margin: 3pt 0; }
        .reporte-pdf-documental .campo, .reporte-pdf-documental li { break-inside: avoid; page-break-inside: avoid; }
        .reporte-pdf-documental ol { list-style: decimal; padding-left: 18pt; }
        .reporte-pdf-documental li { padding-left: 3pt; margin: 0 0 9pt; }
        .reporte-pdf-documental .incidencias { color: #b91c1c; border: 1pt solid #b91c1c; padding: 8pt; margin: 10pt 0; }
        .reporte-pdf-documental .sin-incidencias { color: #166534; margin: 10pt 0; }
        .reporte-pdf-documental footer { border-top: 1pt solid #64748b; margin-top: 18pt; padding-top: 8pt; }
      }
    `}</style>
    <header>
      <h1>{individual ? "REPORTE DOCUMENTAL" : `REPORTE DOCUMENTAL — ${alcance.toLocaleUpperCase("es-BO")}`}</h1>
      {!individual && <p>{filtros}</p>}
      <p>Generado: {generado}</p>
    </header>
    {documentos.map((d, indice) => {
      // La API entrega los envíos más recientes primero. Copiar evita alterar la tabla.
      const movimientos = [...(d.recorrido_reporte ?? d.movimientos_area ?? [])].reverse();
      const incidencias = d.incidencias_reporte ?? [];
      const campos = [
        ["Código", d.codigo_interno], ["Tipo", d.tipo_documento.replaceAll("_", " ")],
        ["Asunto", d.asunto], ["Hoja de Ruta", d.numero_hoja_ruta ?? "—"],
        ["Origen", d.origen?.nombre ?? "—"], ["Destino", d.destino?.nombre ?? "—"],
        ["Fecha recepción", fechaLegibleDoc(d.fecha_recepcion)], ["Fecha envío", fechaLegibleDoc(d.fecha_envio)],
        ["Estado", d.estado_actual.replaceAll("_", " ")],
        ["Responsable", d.responsable_actual ? `${d.responsable_actual.nombres} ${d.responsable_actual.apellidos}` : "Sin asignar"],
      ];
      return <article key={d.id_documento}>
        {!individual && <h2>DOCUMENTO N.º {indice + 1}</h2>}
        {campos.map(([nombre, valor]) => <p className="campo" key={nombre}><strong>{nombre}:</strong> {valor}</p>)}
        {incidencias.length ? <div className="incidencias">
          <strong>PROBLEMAS IDENTIFICADOS</strong>
          <ul>{incidencias.map((incidencia, i) => <li key={i}>
            <strong>{incidencia.dependencia} — {etiquetaIncidencia(incidencia.tipo)}</strong>
            <p>Motivo: {incidencia.motivo}</p>
            <p>Fecha: {fechaLegibleDoc(incidencia.fecha)}</p>
          </li>)}</ul>
        </div> : <p className="sin-incidencias"><strong>Recorrido sin observaciones ni retrasos registrados.</strong></p>}
        <h3>{individual ? "RECORRIDO DOCUMENTAL" : "MOVIMIENTOS DEL DOCUMENTO"}</h3>
        <p className="cantidad">Movimientos: {movimientos.length}</p>
        <ol>{movimientos.map((m, i) => <li key={i}>
          <strong>{m.origen.nombre} → {m.destino.nombre}</strong>
          <p>Envío: {fechaLegibleDoc(m.fecha_envio)}</p>
          <p>Recepción: {m.fecha_recepcion ? fechaLegibleDoc(m.fecha_recepcion) : "Pendiente"}</p>
        </li>)}</ol>
      </article>;
    })}
    <footer>Total: {documentos.length} documento(s)</footer>
  </section>;
}

export default function Pagina() { return <PaginaProtegidaDocumentacion permisos={[PERMISOS_DOC.VER]}><ReportesDocumentales /></PaginaProtegidaDocumentacion>; }
