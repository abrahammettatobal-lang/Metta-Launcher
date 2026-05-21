/**
 * Punto de entrada API v1 (reservado para endpoints futuros).
 * Ejemplos previstos: estadísticas de descargas, webhooks, news proxy, etc.
 */
export async function GET() {
  return Response.json(
    {
      api: "metta-launcher",
      version: "v1",
      status: "ready",
      endpoints: {
        health: "/api/health/",
      },
      message:
        "API v1 en preparación. Añade rutas bajo app/api/v1/ según necesites.",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
