import { PlazosSchedulerService } from './plazos-scheduler.service';

describe('PlazosSchedulerService - plazo activo verificable', () => {
  const servicio = new PlazosSchedulerService(
    {} as any,
    {} as any,
    {} as any,
  );

  const plazo = (
    seccionResponsable: number,
    seccionActual: number,
    estadoActual = 'EN_TRAMITE',
  ) => ({
    id_seccion_responsable: seccionResponsable,
    proveido: {
      fecha_hora: new Date('2026-10-02T07:00:00Z'),
      hoja_ruta: {
        id_documento: 101,
        expediente: {
          id_seccion_actual: seccionActual,
          estado_actual: estadoActual,
        },
      },
    },
  });

  it('solo considera activo el plazo de la sección que tiene actualmente el expediente', () => {
    expect((servicio as any).esPlazoActivo(plazo(7, 7))).toBe(true);
    expect((servicio as any).esPlazoActivo(plazo(7, 8))).toBe(false);
  });

  it('no vuelve a alertar plazos históricos de expedientes finalizados o archivados', () => {
    expect((servicio as any).esPlazoActivo(plazo(7, 7, 'FINALIZADO'))).toBe(
      false,
    );
    expect((servicio as any).esPlazoActivo(plazo(7, 7, 'ARCHIVADO'))).toBe(
      false,
    );
  });

  it('no alerta un plazo de la visita anterior al regresar a la misma dependencia', () => {
    const salidas = new Map([['101:7', new Date('2026-10-02T08:00:00Z')]]);
    expect((servicio as any).esPlazoActivo(plazo(7, 7), salidas)).toBe(false);
    const actual = plazo(7, 7);
    actual.proveido.fecha_hora = new Date('2026-10-02T09:00:00Z');
    expect((servicio as any).esPlazoActivo(actual, salidas)).toBe(true);
  });
});
