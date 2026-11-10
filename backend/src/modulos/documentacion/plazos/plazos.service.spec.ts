import { PlazosService } from './plazos.service';

describe('PlazosService.calcularEstado', () => {
  const servicio = new PlazosService({} as any);
  const ahora = new Date('2026-08-07T12:00:00Z');
  const antes = new Date('2026-08-07T10:00:00Z');
  const despues = new Date('2026-08-07T14:00:00Z');

  it('PENDIENTE: sin cumplimiento y el límite aún no pasó', () => {
    expect(
      servicio.calcularEstado({ fecha_hora_limite: despues, fecha_hora_cumplimiento: null }, ahora),
    ).toBe('PENDIENTE');
  });

  it('VENCIDO: sin cumplimiento y el límite ya pasó', () => {
    expect(
      servicio.calcularEstado({ fecha_hora_limite: antes, fecha_hora_cumplimiento: null }, ahora),
    ).toBe('VENCIDO');
  });

  it('CUMPLIDO: cumplimiento registrado antes o en el límite', () => {
    expect(
      servicio.calcularEstado({ fecha_hora_limite: despues, fecha_hora_cumplimiento: ahora }, ahora),
    ).toBe('CUMPLIDO');
    expect(
      servicio.calcularEstado({ fecha_hora_limite: ahora, fecha_hora_cumplimiento: ahora }, ahora),
    ).toBe('CUMPLIDO');
  });

  it('CUMPLIDO_CON_RETRASO: cumplimiento registrado después del límite', () => {
    expect(
      servicio.calcularEstado({ fecha_hora_limite: antes, fecha_hora_cumplimiento: ahora }, ahora),
    ).toBe('CUMPLIDO_CON_RETRASO');
  });

  it('el estado nunca se guarda: es una función pura del par de fechas + "ahora"', () => {
    const plazo = { fecha_hora_limite: ahora, fecha_hora_cumplimiento: null };
    expect(servicio.calcularEstado(plazo, antes)).toBe('PENDIENTE');
    expect(servicio.calcularEstado(plazo, despues)).toBe('VENCIDO');
  });

  it('respeta el instante exacto del límite aunque la fecha incluya zona horaria', () => {
    const limite = new Date('2026-11-03T15:30:00-04:00');
    const plazo = { fecha_hora_limite: limite, fecha_hora_cumplimiento: null };
    expect(servicio.calcularEstado(plazo, new Date('2026-11-03T19:29:59Z'))).toBe('PENDIENTE');
    expect(servicio.calcularEstado(plazo, new Date('2026-11-03T19:30:00Z'))).toBe('PENDIENTE');
    expect(servicio.calcularEstado(plazo, new Date('2026-11-03T19:30:01Z'))).toBe('VENCIDO');
  });
});

describe('PlazosService.calcularSituacion', () => {
  const servicio = new PlazosService({} as any);
  const ahora = new Date('2026-08-07T12:00:00Z');

  it('distingue vencimiento hoy, próximo, vencido y cumplimiento tardío', () => {
    expect(
      servicio.calcularSituacion(
        { fecha_hora_limite: new Date('2026-08-07T18:00:00Z'), fecha_hora_cumplimiento: null },
        ahora,
      ),
    ).toBe('VENCE_HOY');
    expect(
      servicio.calcularSituacion(
        { fecha_hora_limite: new Date('2026-08-08T10:00:00Z'), fecha_hora_cumplimiento: null },
        ahora,
      ),
    ).toBe('PROXIMO_A_VENCER');
    expect(
      servicio.calcularSituacion(
        { fecha_hora_limite: new Date('2026-08-06T12:00:00Z'), fecha_hora_cumplimiento: null },
        ahora,
      ),
    ).toBe('VENCIDO');
    expect(
      servicio.calcularSituacion(
        { fecha_hora_limite: new Date('2026-08-06T12:00:00Z'), fecha_hora_cumplimiento: ahora },
        ahora,
      ),
    ).toBe('CUMPLIDO_TARDE');
  });
});

describe('PlazosService.obtenerPlazoVigente', () => {
  it('no reutiliza el plazo de una visita anterior cuando la sección recibe otra vez el documento', async () => {
    const prisma = {
      expedienteDocumento: {
        findUnique: jest.fn().mockResolvedValue({ id_seccion_actual: 20 }),
      },
      movimientoDocumento: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ fecha_hora_envio: new Date('2026-10-02T08:00:00Z') }),
      },
      plazoDocumento: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const servicio = new PlazosService(prisma as any);

    await expect(servicio.obtenerPlazoVigente(101)).resolves.toBeNull();
    expect(prisma.plazoDocumento.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id_seccion_responsable: 20,
          fecha_hora_cumplimiento: null,
          proveido: expect.objectContaining({
            fecha_hora: { gte: new Date('2026-10-02T08:00:00Z') },
          }),
        }),
      }),
    );
  });
});
