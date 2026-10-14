import { getStore } from "@netlify/blobs";
import type { Config } from "@netlify/functions";
import { createHash, timingSafeEqual } from "node:crypto";

// Lectura privada de los pedidos guardados, para pasarlos a Notion con el cierre.
// GET /api/pedidos?desde=AAAA-MM-DD&hasta=AAAA-MM-DD  con  Authorization: Bearer <PEDIDOS_CLAVE>
const hash = (s: string) => createHash("sha256").update(s).digest();
const fecha = (s: string | null) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);

export default async (req: Request) => {
  const clave = Netlify.env.get("PEDIDOS_CLAVE");
  if (!clave) return new Response("Sin configurar", { status: 503 });
  const dada = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!dada || !timingSafeEqual(hash(dada), hash(clave))) return new Response("No autorizado", { status: 401 });

  const u = new URL(req.url);
  const desde = fecha(u.searchParams.get("desde"));
  const hasta = fecha(u.searchParams.get("hasta")) || desde;
  if (!desde || !hasta || hasta < desde) return new Response("Fechas inválidas", { status: 400 });

  const store = getStore("pedidos");
  const pedidos: unknown[] = [];
  const d = new Date(desde + "T12:00:00Z");
  for (let i = 0; i < 62; i++) {
    const dia = d.toISOString().slice(0, 10);
    if (dia > hasta) break;
    const { blobs } = await store.list({ prefix: dia + "/" });
    for (const b of blobs) {
      const v = await store.get(b.key, { type: "json", consistency: "strong" });
      if (v) pedidos.push(v);
    }
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return Response.json({ desde, hasta, cantidad: pedidos.length, pedidos }, { headers: { "Cache-Control": "no-store" } });
};

export const config: Config = { path: "/api/pedidos", method: "GET" };
