"use client";

import { useState } from "react";
import {
  descargarArchivoDocumento,
  mensajeErrorApi,
  visualizarArchivoDocumento,
} from "../../servicios/documentacion/documentacion.service";
import {
  ArchivoDocumento,
  DocumentoRelacionado,
  EstadoDocumento,
  ObservacionDocumento,
} from "../../tipos/documentacion";
import {
  AvisoDoc,
  botonSecundarioDoc,
  fechaLegibleDoc,
} from "./InterfazDocumentacion";
import { tamanoArchivo } from "./CargaArchivos";
import { useAuth } from "../../contextos/AuthContext";
import { PERMISOS_DOC } from "./InterfazDocumentacion";

function abrirBlob(blob: Blob, nombre: string, descargar: boolean) {
  const url = URL.createObjectURL(blob);
  if (descargar) {
    const enlace = document.createElement("a");
    enlace.href = url;
    enlace.download = nombre;
    enlace.click();
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

function ArchivosRespuesta({
  idDocumento,
  archivos,
}: {
  idDocumento: number;
  archivos: ArchivoDocumento[];
}) {
  const { tienePermiso } = useAuth();
  const [procesando, setProcesando] = useState<number | null>(null);
  const [error, setError] = useState("");

  const abrir = async (archivo: ArchivoDocumento, descargar: boolean) => {
    setProcesando(archivo.id_archivo);
    setError("");
    try {
      const blob = descargar
        ? await descargarArchivoDocumento(idDocumento, archivo.id_archivo)
        : await visualizarArchivoDocumento(idDocumento, archivo.id_archivo);
      abrirBlob(blob, archivo.nombre_original, descargar);
    } catch (e) {
      setError(mensajeErrorApi(e));
    } finally {
      setProcesando(null);
    }
  };

  if (archivos.length === 0) {
    return <p className="text-sm text-slate-500">Sin archivos adjuntos.</p>;
  }

  return (
    <div className="space-y-2">
      {error && <AvisoDoc tipo="error">{error}</AvisoDoc>}
      {archivos.map((archivo) => (
        <div
          key={archivo.id_archivo}
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">
              {archivo.nombre_original}
            </p>
            <p className="text-xs text-slate-500">
              {tamanoArchivo(archivo.tamano_bytes)} · {fechaLegibleDoc(archivo.fecha_hora_subida)}
            </p>
          </div>
          <div className="flex gap-2">
            {tienePermiso(PERMISOS_DOC.IMPRIMIR) && (
              <button
                type="button"
                className={botonSecundarioDoc}
                disabled={procesando === archivo.id_archivo}
                onClick={() => void abrir(archivo, false)}
              >
                Ver
              </button>
            )}
            {tienePermiso(PERMISOS_DOC.DESCARGAR) && (
              <button
                type="button"
                className={botonSecundarioDoc}
                disabled={procesando === archivo.id_archivo}
                onClick={() => void abrir(archivo, true)}
              >
                Descargar
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function RespuestasExpediente({
  relaciones,
  observaciones,
  estadoExpediente,
}: {
  relaciones: DocumentoRelacionado[];
  observaciones: ObservacionDocumento[];
  estadoExpediente: EstadoDocumento;
}) {
  const respuestas = relaciones.filter(
    (relacion) =>
      relacion.tipo_relacion === "RESPUESTA" && relacion.documento_relacionado,
  );

  return (
    <section className="space-y-4">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#52796f]">
          Respuesta del área
        </p>
        <h2 className="mt-1 text-xl font-bold text-slate-950">
          Historial de respuestas y revisión
        </h2>
      </div>

      {respuestas.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
          El área responsable todavía no registró una respuesta institucional.
        </div>
      ) : (
        <div className="space-y-4">
          {respuestas.map((relacion, indice) => {
            const respuesta = relacion.documento_relacionado!;
            const esUltima = indice === respuestas.length - 1;
            const observacionPendiente = observaciones.some(
              (observacion) => !observacion.subsanada,
            );
            const estadoRevision = !esUltima
              ? "ANTECEDENTE"
              : estadoExpediente === "APROBADO" ||
                  estadoExpediente === "FINALIZADO" ||
                  estadoExpediente === "ARCHIVADO"
                ? "APROBADA"
                : observacionPendiente
                  ? "OBSERVADA"
                  : "EN REVISIÓN";
            const esRespuestaFinalAprobada = estadoRevision === "APROBADA";
            return (
              <article
                key={relacion.id_relacion}
                className={`rounded-2xl border p-4 ${esRespuestaFinalAprobada ? "border-sky-300 bg-sky-50" : "border-slate-200 bg-slate-50"}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className={`text-xs font-bold uppercase ${esRespuestaFinalAprobada ? "text-sky-700" : "text-[#52796f]"}`}>
                      {esRespuestaFinalAprobada
                        ? "Respuesta final aprobada"
                        : `Respuesta ${indice + 1} de ${respuestas.length}`}
                    </p>
                    <h3 className="mt-1 font-mono text-base font-bold text-slate-950">
                      {respuesta.codigo_interno}
                    </h3>
                    <p className="mt-1 font-semibold text-slate-800">
                      {respuesta.asunto}
                    </p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-bold ring-1 ${esRespuestaFinalAprobada ? "bg-sky-100 text-sky-800 ring-sky-300" : "bg-white text-slate-700 ring-slate-200"}`}>
                    {estadoRevision}
                  </span>
                </div>
                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                  <div>
                    <dt className="text-xs font-semibold text-slate-500">Creada</dt>
                    <dd>{fechaLegibleDoc(respuesta.fecha_hora_registro ?? relacion.fecha_hora)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold text-slate-500">Sección</dt>
                    <dd>{respuesta.seccion_registro?.nombre?.replaceAll("_", " ") ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold text-slate-500">Responsable</dt>
                    <dd>
                      {respuesta.usuario_registro
                        ? `${respuesta.usuario_registro.nombres} ${respuesta.usuario_registro.apellidos}`
                        : "—"}
                    </dd>
                  </div>
                </dl>
                {respuesta.sintesis && (
                  <p className="mt-4 rounded-lg bg-white p-3 text-sm text-slate-700">
                    {respuesta.sintesis}
                  </p>
                )}
                <div className="mt-4">
                  <p className="mb-2 text-xs font-bold uppercase text-slate-500">
                    Archivos de esta respuesta
                  </p>
                  <ArchivosRespuesta
                    idDocumento={respuesta.id_documento}
                    archivos={respuesta.archivos ?? []}
                  />
                </div>
              </article>
            );
          })}
        </div>
      )}

      <div className="border-t border-slate-200 pt-4">
        <h3 className="font-bold text-slate-950">Observaciones de revisión</h3>
        {observaciones.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No existen observaciones registradas.</p>
        ) : (
          <ol className="mt-3 space-y-3">
            {observaciones.map((observacion) => (
              <li
                key={observacion.id_observacion}
                className={`rounded-xl border p-3 ${observacion.subsanada ? "border-emerald-200 bg-emerald-50" : "border-amber-300 bg-amber-50"}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-bold text-slate-900">
                    {observacion.seccion?.nombre?.replaceAll("_", " ") ?? "Revisión"}
                  </p>
                  <span className="text-xs font-bold text-slate-600">
                    {observacion.subsanada ? "SUBSANADA" : "PENDIENTE"}
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-800">{observacion.descripcion}</p>
                <p className="mt-2 text-xs text-slate-500">
                  {fechaLegibleDoc(observacion.fecha_hora)}
                  {observacion.usuario
                    ? ` · ${observacion.usuario.nombres} ${observacion.usuario.apellidos}`
                    : ""}
                  {observacion.fecha_hora_subsanacion
                    ? ` · Subsanada ${fechaLegibleDoc(observacion.fecha_hora_subsanacion)}`
                    : ""}
                </p>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
