import { RELEASE_VERSION } from "@/data/downloads";

/**
 * Health check para Railway y monitoreo.
 * GET /api/health
 */
export async function GET() {
  return Response.json(
    {
      ok: true,
      service: "metta-launcher-web",
      version: RELEASE_VERSION,
      timestamp: new Date().toISOString(),
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
