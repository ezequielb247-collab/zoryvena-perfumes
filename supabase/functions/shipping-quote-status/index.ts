import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

const STORE_URL = "https://zoryvena-perfumes.onrender.com";
const ALLOWED_ORIGINS = new Set([STORE_URL, "http://127.0.0.1:5500", "http://localhost:5500"]);

function cors(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin && ALLOWED_ORIGINS.has(origin) ? origin : STORE_URL,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "600",
    "Vary": "Origin",
  };
}

function json(body: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...headers,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function requestIp(req: Request) {
  return req.headers.get("cf-connecting-ip")
    || req.headers.get("x-real-ip")
    || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || "unknown";
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  const headers = cors(origin);
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405, headers);
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return json({ error: "Origem não autorizada." }, 403, headers);
  if (Number(req.headers.get("content-length") || 0) > 8192) return json({ error: "Solicitação muito grande." }, 413, headers);

  try {
    const payload = await req.json();
    const orderId = String(payload?.orderId || "").trim();
    const statusToken = String(payload?.statusToken || "").trim();
    if (!/^[0-9a-f-]{36}$/i.test(orderId) || !/^[0-9a-f-]{36}$/i.test(statusToken)) {
      return json({ error: "Credencial da cotação inválida." }, 400, headers);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) throw new Error("server_config");
    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

    const ip = requestIp(req);
    for (const limit of [
      { key: `quote-status-ip:${ip}`, max: 180 },
      { key: `quote-status-order:${orderId}:${statusToken}`, max: 120 },
    ]) {
      const { data: allowed, error } = await admin.rpc("consume_api_rate_limit", {
        p_key: await sha256(limit.key),
        p_max_hits: limit.max,
        p_window_seconds: 600,
      });
      if (error) throw error;
      if (!allowed) return json({ error: "Muitas consultas. Aguarde alguns minutos." }, 429, headers);
    }

    const { data: order, error } = await admin.from("orders").select(
      "id,order_code,status,fulfillment_status,payment_method,subtotal,shipping,discount,total,shipping_quoted_at,shipping_quote_expires_at,inventory_reserved_at,inventory_reservation_expires_at,archived_at,address"
    ).eq("id", orderId).eq("public_status_token", statusToken).maybeSingle();
    if (error) throw error;
    if (!order || order.archived_at) return json({ error: "Cotação não encontrada." }, 404, headers);
    if (String(order.address?.delivery || "") !== "shipping") return json({ error: "Este pedido não possui cotação de entrega." }, 409, headers);

    return json({
      id: order.id,
      orderCode: order.order_code,
      status: order.status,
      fulfillmentStatus: order.fulfillment_status,
      paymentMethod: order.payment_method,
      subtotal: Number(order.subtotal || 0),
      shipping: Number(order.shipping || 0),
      discount: Number(order.discount || 0),
      total: Number(order.total || 0),
      shippingQuotedAt: order.shipping_quoted_at,
      quoteExpiresAt: order.shipping_quote_expires_at,
      reservationExpiresAt: order.inventory_reservation_expires_at,
      paymentStarted: Boolean(order.inventory_reserved_at),
      quoteReady: order.status === "Frete cotado",
      paid: order.status === "Pagamento aprovado",
      terminal: ["Pagamento aprovado", "Pagamento recusado", "Cancelado", "Reembolsado", "Contestação"].includes(order.status),
    }, 200, headers);
  } catch (error) {
    console.error("shipping-quote-status failed", error instanceof Error ? error.message : "unknown");
    return json({ error: "Não foi possível consultar a cotação." }, 400, headers);
  }
});
