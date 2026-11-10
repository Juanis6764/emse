import { incidenciasDelRecorrido } from './incidencias-reporte';

const fecha = (hora: string) => new Date(`2026-11-04T${hora}:00Z`);
const movimiento = (
  origen: number,
  destino: number,
  envio: string,
  recepcion: string | null,
) => ({
  id_seccion_origen: origen,
  id_seccion_destino: destino,
  seccion_destino: { nombre: `Sección ${destino}` },
  fecha_hora_envio: fecha(envio),
  fecha_hora_recepcion: recepcion ? fecha(recepcion) : null,
});
const plazo = (seccion: number, creado: string, limite: string) => ({
  id_seccion_responsable: seccion,
  fecha_hora_limite: fecha(limite),
  fecha_hora_cumplimiento: null as Date | null,
  proveido: { fecha_hora: fecha(creado) },
});

describe('incidenciasDelRecorrido', () => {
  it('no inventa retraso por el tiempo de tránsito o sin plazo registrado', () => {
    expect(incidenciasDelRecorrido([movimiento(1, 2, '08:00', '08:30')], [], [], 2, fecha('09:00'))).toEqual([]);
    expect(incidenciasDelRecorrido([movimiento(1, 2, '08:00', '08:30')], [plazo(2, '07:00', '10:00')], [], 2, fecha('09:00'))).toEqual([]);
  });

  it('identifica recepción fuera de plazo y la dependencia destinataria', () => {
    const resultado = incidenciasDelRecorrido(
      [movimiento(1, 2, '08:00', '09:01')], [plazo(2, '07:00', '09:00')], [], 2, fecha('09:02'),
    );
    expect(resultado).toMatchObject([{ tipo: 'RECEPCION_TARDIA', dependencia: 'Sección 2' }]);
  });

  it('identifica la dependencia que derivó después de su plazo', () => {
    const resultado = incidenciasDelRecorrido(
      [movimiento(1, 2, '08:00', '08:05'), movimiento(2, 3, '09:01', '09:03')],
      [plazo(2, '07:00', '09:00')], [], 3, fecha('09:04'),
    );
    expect(resultado).toMatchObject([{ tipo: 'DEMORA_DEPENDENCIA', dependencia: 'Sección 2' }]);
  });

  it('muestra el motivo registrado de una observación y no reactiva un plazo anterior al retorno', () => {
    const resultado = incidenciasDelRecorrido(
      [movimiento(1, 2, '08:00', '08:05'), movimiento(2, 3, '08:20', '08:22'), movimiento(3, 2, '08:30', '08:35')],
      [plazo(2, '07:00', '08:25')],
      [{ descripcion: 'Falta firma', fecha_hora: fecha('08:36'), seccion: { nombre: 'Sección 2' } }],
      2, fecha('09:00'),
    );
    expect(resultado).toMatchObject([{ tipo: 'OBSERVACION', dependencia: 'Sección 2', motivo: 'Falta firma' }]);
  });

  it('no acumula demora después del cierre del expediente', () => {
    expect(incidenciasDelRecorrido(
      [movimiento(1, 2, '08:00', '08:05')],
      [plazo(2, '07:00', '09:00')], [], 2, fecha('12:00'), false,
    )).toEqual([]);
  });

  it('respeta el cumplimiento registrado aunque la derivación sea posterior', () => {
    const atendido = plazo(2, '07:00', '09:00');
    atendido.fecha_hora_cumplimiento = fecha('08:45');
    expect(incidenciasDelRecorrido(
      [movimiento(1, 2, '08:00', '08:05'), movimiento(2, 3, '09:30', '09:35')],
      [atendido], [], 3, fecha('10:00'),
    )).toEqual([]);
  });
});
