export interface IncidenciaReporte {
  tipo: 'OBSERVACION' | 'RECEPCION_TARDIA' | 'DEMORA_DEPENDENCIA';
  dependencia: string;
  motivo: string;
  fecha: Date;
}

interface MovimientoReporte {
  id_seccion_origen: number;
  id_seccion_destino: number;
  seccion_destino: { nombre: string };
  fecha_hora_envio: Date;
  fecha_hora_recepcion: Date | null;
}

interface PlazoReporte {
  id_seccion_responsable: number;
  fecha_hora_limite: Date;
  fecha_hora_cumplimiento: Date | null;
  proveido: { fecha_hora: Date };
}

interface ObservacionReporte {
  descripcion: string;
  fecha_hora: Date;
  seccion: { nombre: string };
}

/** Solo atribuye retrasos cuando existe un plazo registrado para esa visita. */
export function incidenciasDelRecorrido(
  movimientos: MovimientoReporte[],
  plazos: PlazoReporte[],
  observaciones: ObservacionReporte[],
  idSeccionActual: number,
  ahora = new Date(),
  expedienteActivo = true,
): IncidenciaReporte[] {
  const ordenados = [...movimientos].sort(
    (a, b) => a.fecha_hora_envio.getTime() - b.fecha_hora_envio.getTime(),
  );
  const incidencias: IncidenciaReporte[] = observaciones.map((observacion) => ({
    tipo: 'OBSERVACION',
    dependencia: observacion.seccion.nombre,
    motivo: observacion.descripcion,
    fecha: observacion.fecha_hora,
  }));

  for (const [indice, llegada] of ordenados.entries()) {
    const recepcion = llegada.fecha_hora_recepcion;
    if (!recepcion) continue;
    const seccion = llegada.id_seccion_destino;
    const salidaAnterior = ordenados
      .slice(0, indice)
      .filter((movimiento) => movimiento.id_seccion_origen === seccion)
      .at(-1)?.fecha_hora_envio;
    const plazo = plazos
      .filter((item) =>
        item.id_seccion_responsable === seccion &&
        item.proveido.fecha_hora <= recepcion &&
        (!salidaAnterior || item.proveido.fecha_hora >= salidaAnterior),
      )
      .sort((a, b) => b.proveido.fecha_hora.getTime() - a.proveido.fecha_hora.getTime())[0];
    if (!plazo) continue;

    if (recepcion > plazo.fecha_hora_limite) {
      incidencias.push({
        tipo: 'RECEPCION_TARDIA',
        dependencia: llegada.seccion_destino.nombre,
        motivo: 'Recepción posterior al plazo fijado para esta dependencia.',
        fecha: recepcion,
      });
      continue;
    }

    const salida = ordenados.slice(indice + 1).find((movimiento) =>
      movimiento.id_seccion_origen === seccion && movimiento.fecha_hora_envio >= recepcion,
    );
    const finAtencion = plazo.fecha_hora_cumplimiento ?? salida?.fecha_hora_envio ??
      (expedienteActivo && seccion === idSeccionActual ? ahora : null);
    if (finAtencion && finAtencion > plazo.fecha_hora_limite) {
      incidencias.push({
        tipo: 'DEMORA_DEPENDENCIA',
        dependencia: llegada.seccion_destino.nombre,
        motivo: plazo.fecha_hora_cumplimiento
          ? 'Atención registrada después del plazo fijado para esta dependencia.'
          : salida
            ? 'Derivación posterior al plazo fijado, sin atención registrada dentro del plazo.'
            : 'Atención pendiente después del plazo fijado para esta dependencia.',
        fecha: finAtencion,
      });
    }
  }
  return incidencias.sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
}
