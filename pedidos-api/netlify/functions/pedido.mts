import { getStore } from "@netlify/blobs";
import type { Config } from "@netlify/functions";

// Recibe cada pedido que se manda desde kanthus.com y lo guarda.
const ORIGENES = ["https://kanthus.com", "https://www.kanthus.com"];

const txt = (v: unknown, max = 200) =>
  typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max) : "";
const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n < 1e7 ? Math.round(n * 100) / 100 : 0;
};

function limpiar(p: any) {
  const items = Array.isArray(p.items) ? p.items.slice(0, 60) : [];
  return {
    nombre: txt(p.nombre, 80),
    tel: txt(p.tel, 30).replace(/[^\d+]/g, ""),
    modo: p.modo === "retiro" ? "retiro" : "delivery",
    zona: txt(p.zona, 60),
    hora: txt(p.hora, 10),
    programado: !!p.programado,
    manana: !!p.manana,
    pago: txt(p.pago, 40),
    cambio: txt(p.cambio, 30),
    paga: num(p.paga),
    subtotal: num(p.subtotal),
    descuento: num(p.descuento),
    descuentoRef: num(p.descuentoRef),
    envio: num(p.envio),
    total: num(p.total),
    comentario: txt(p.comentario, 500),
    referido: txt(p.referido, 80),
    items: items.map((l: any) => ({
      cant: Math.max(1, Math.min(99, Math.floor(num(l?.cant)) || 1)),
      nombre: txt(l?.nombre, 100),
      precio: num(l?.precio),
      detalle: (Array.isArray(l?.detalle) ? l.detalle : []).slice(0, 20).map((x: unknown) => txt(x, 150)),
      extras: (Array.isArray(l?.extras) ? l.extras : []).slice(0, 20).map((x: unknown) => txt(x, 100)),
    })),
  };
}

export default async (req: Request) => {
  const origin = req.headers.get("origin") || "";
  const permitido = ORIGENES.includes(origin);
  const h: Record<string, string> = {
    "Access-Control-Allow-Origin": permitido ? origin : ORIGENES[0],
    Vary: "Origin",
  };
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: { ...h, "Access-Control-Allow-Methods": "POST", "Access-Control-Allow-Headers": "content-type", "Access-Control-Max-Age": "86400" },
    });
  }
  if (req.method !== "POST") return new Response("Método no permitido", { status: 405, headers: h });
  if (!permitido) return new Response("Origen no permitido", { status: 403, headers: h });

  const cuerpo = await req.text();
  if (cuerpo.length > 30000) return new Response("Muy grande", { status: 413, headers: h });
  let p: any;
  try { p = JSON.parse(cuerpo); } catch { return new Response("JSON inválido", { status: 400, headers: h }); }
  const datos = limpiar(p);
  if (!datos.nombre || !datos.items.length) return new Response("Faltan datos", { status: 400, headers: h });

  // Uruguay es UTC-3 todo el año. La jornada corta a las 6 de la mañana, como el cierre.
  const ahora = new Date();
  const uy = new Date(ahora.getTime() - 3 * 3600e3);
  const jornada = new Date(uy.getTime() - 6 * 3600e3).toISOString().slice(0, 10);
  const id = uy.toISOString().slice(0, 19).replace(/[-:T]/g, "") + "-" + crypto.randomUUID().slice(0, 8);
  const registro = { id, recibido: ahora.toISOString(), hora_uy: uy.toISOString().slice(11, 16), jornada, ...datos };

  await getStore("pedidos").setJSON(`${jornada}/${id}`, registro);
  return Response.json({ ok: true, id }, { headers: h });
};

export const config: Config = {
  path: "/api/pedido",
  method: ["POST", "OPTIONS"],
  rateLimit: { windowLimit: 20, windowSize: 60, aggregateBy: ["ip", "domain"] },
};
