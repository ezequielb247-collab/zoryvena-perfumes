import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

const STORE_URL = "https://zoryvena-perfumes.onrender.com";
const LOCAL_ORIGINS = new Set(["http://127.0.0.1:5500", "http://localhost:5500"]);
const ALLOWED_ORIGINS = new Set([STORE_URL, ...LOCAL_ORIGINS]);

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

function mapStatus(status: string) {
  return ["processed", "approved"].includes(status) ? "Pagamento aprovado"
    : ["processing", "in_process", "action_required"].includes(status) ? "Pagamento em análise"
    : ["failed", "rejected"].includes(status) ? "Pagamento recusado"
    : ["canceled", "cancelled", "expired"].includes(status) ? "Cancelado"
    : status === "refunded" ? "Reembolsado"
    : "Aguardando pagamento";
}

function publicCardError(statusDetail: string) {
  const detail = String(statusDetail || "").toLowerCase();
  if (detail.includes("insufficient") || detail.includes("fund")) return "Pagamento recusado. Verifique o limite ou tente outro cartão.";
  if (detail.includes("security") || detail.includes("cvv")) return "Confira o código de segurança e tente novamente.";
  if (detail.includes("expired")) return "Confira a validade do cartão e tente novamente.";
  if (detail.includes("identity") || detail.includes("identification")) return "Confira o CPF ou CNPJ informado.";
  return "Não foi possível aprovar o cartão. Confira os dados ou tente outra forma de pagamento.";
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  const headers = cors(origin);
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405, headers);
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return json({ error: "Origem não autorizada." }, 403, headers);
  if (Number(req.headers.get("content-length") || 0) > 65536) return json({ error: "Solicitação muito grande." }, 413, headers);

  try {
    const payload = await req.json();
    const orderId = String(payload?.orderId || "").trim();
    const statusToken = String(payload?.statusToken || "").trim();
    const cardData = payload?.cardData || {};
    const cardToken = String(cardData?.token || "");
    const methodId = String(cardData?.payment_method_id || "").toLowerCase();
    if (!/^[0-9a-f-]{36}$/i.test(orderId) || statusToken.length < 24) throw new Error("Pedido inválido.");
    if (cardToken.length < 20 || cardToken.length > 4096 || !/^[a-z0-9_-]{2,40}$/i.test(methodId)) throw new Error("Os dados do cartão não foram gerados corretamente.");

    const installments = Number(cardData.installments || 1);
    if (!Number.isInteger(installments) || installments < 1 || installments > 3) throw new Error("Selecione entre 1 e 3 parcelas.");
    const paymentTypeId = String(cardData.payment_type_id || "credit_card");
    if (!new Set(["credit_card", "debit_card"]).has(paymentTypeId)) throw new Error("Tipo de cartão inválido.");

    const identification = cardData?.payer?.identification || {};
    const identificationType = String(identification.type || "CPF").toUpperCase();
    const identificationNumber = String(identification.number || "").replace(/\D/g, "");
    if (!new Set(["CPF", "CNPJ"]).has(identificationType)) throw new Error("Documento inválido.");
    if ((identificationType === "CPF" && identificationNumber.length !== 11)
      || (identificationType === "CNPJ" && identificationNumber.length !== 14)) {
      throw new Error("Confira o CPF ou CNPJ informado.");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) throw new Error("Configuração do servidor indisponível.");
    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

    const [{ data: order, error: orderError }, { data: settings, error: settingsError }] = await Promise.all([
      admin.from("orders").select("id,order_code,total,customer_email,payment_method,status,public_status_token,payment_installments,terms_accepted_at,inventory_reserved_at,inventory_reservation_expires_at,inventory_reservation_released_at,archived_at").eq("id", orderId).single(),
      admin.from("store_settings").select("payment_environment,launch_status,legal_name,tax_id,business_address,supplier_docs_verified,supplier_docs_unavailable_acknowledged_at").eq("id", 1).single(),
    ]);
    if (orderError || !order) throw new Error("Pedido não encontrado.");
    if (settingsError) throw settingsError;
    if (String(order.public_status_token || "") !== statusToken) return json({ error: "Acesso ao pedido não autorizado." }, 401, headers);
    if (order.payment_method !== "card") throw new Error("Este pedido não foi criado para cartão.");
    if (!order.terms_accepted_at) throw new Error("O aceite dos termos não foi registrado.");
    if (order.archived_at) throw new Error("Este pedido não está mais ativo.");
    if (["Cancelado", "Reembolsado"].includes(order.status)) throw new Error("Este pedido não pode mais ser pago.");
    if (order.status === "Pagamento aprovado") {
      return json({ approved: true, status: "processed", statusDetail: "accredited", orderCode: order.order_code, installments: Number(order.payment_installments || 1) }, 200, headers);
    }

    const environment = settings.payment_environment === "production" ? "production" : "test";
    if (environment === "production") {
      if (origin !== STORE_URL) return json({ error: "Origem não autorizada em produção." }, 403, headers);
      const legalReady = Boolean(String(settings.legal_name || "").trim() && String(settings.tax_id || "").trim() && String(settings.business_address || "").trim());
      const supplierRequirementMet = Boolean(settings.supplier_docs_verified || settings.supplier_docs_unavailable_acknowledged_at);
      if (!["soft_launch", "live"].includes(String(settings.launch_status)) || !legalReady || !supplierRequirementMet) {
        throw new Error("A loja ainda não está liberada para pagamentos reais.");
      }
    }

    const expiresAt = order.inventory_reservation_expires_at ? new Date(order.inventory_reservation_expires_at).getTime() : 0;
    if (!order.inventory_reserved_at || order.inventory_reservation_released_at || !expiresAt || expiresAt <= Date.now()) {
      await admin.rpc("release_order_inventory_reservation", {
        p_order_id: order.id,
        p_mark_cancelled: true,
        p_reason: "card_reservation_expired",
      });
      return json({ error: "A reserva deste pedido expirou. Volte ao carrinho e gere um novo pedido." }, 409, headers);
    }

    const ip = requestIp(req);
    for (const limit of [
      { key: `card-ip:${ip}`, max: 20 },
      { key: `card-order:${order.id}`, max: 8 },
      { key: `card-pair:${order.id}:${ip}`, max: 6 },
    ]) {
      const { data: allowed, error } = await admin.rpc("consume_api_rate_limit", {
        p_key: await sha256(limit.key),
        p_max_hits: limit.max,
        p_window_seconds: 1800,
      });
      if (error) throw error;
      if (!allowed) return json({ error: "Muitas tentativas com cartão. Aguarde 30 minutos." }, 429, headers);
    }

    const token = Deno.env.get(environment === "production" ? "MERCADO_PAGO_ACCESS_TOKEN_CARD_PRODUCTION" : "MERCADO_PAGO_ACCESS_TOKEN_CARD_TEST");
    if (!token) throw new Error(environment === "production" ? "Credencial produtiva do cartão não configurada." : "Credencial de teste do cartão não configurada.");
    const amount = Number(order.total).toFixed(2);
    if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) throw new Error("Total do pedido inválido.");
    const payerEmail = environment === "production" ? order.customer_email : "test@testuser.com";
    const tokenHash = (await sha256(cardToken)).slice(0, 32);
    const body = {
      type: "online",
      processing_mode: "automatic",
      total_amount: amount,
      external_reference: order.id,
      payer: { email: payerEmail, identification: { type: identificationType, number: identificationNumber } },
      transactions: {
        payments: [{ amount, payment_method: { id: methodId, type: paymentTypeId, token: cardToken, installments } }],
      },
    };

    const response = await fetch("https://api.mercadopago.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": `zoryvena-card-${environment}-${order.id}-${tokenHash}`.slice(0, 120),
      },
      body: JSON.stringify(body),
    });
    const text = await response.text();
    let mp: any = {};
    try { mp = text ? JSON.parse(text) : {}; } catch { mp = {}; }
    if (!response.ok) {
      const detail = String(mp?.status_detail || mp?.errors?.[0]?.code || mp?.code || mp?.error || "card_rejected").slice(0, 480);
      await admin.rpc("sync_order_payment_status", {
        p_order_id: order.id,
        p_status: "Pagamento recusado",
        p_mercado_pago_order_id: String(mp?.id || ""),
        p_mercado_pago_payment_id: "",
        p_mercado_pago_status: String(mp?.status || "failed"),
        p_mercado_pago_status_detail: detail,
      });
      return json({ error: publicCardError(detail), status: "failed", statusDetail: "rejected" }, 400, headers);
    }

    const payment = mp?.transactions?.payments?.[0] || {};
    const returnedExternal = String(mp.external_reference || "");
    const returnedAmount = Number(payment.amount ?? mp.total_amount);
    const returnedType = String(payment?.payment_method?.type || paymentTypeId);
    if (returnedExternal !== order.id
      || !Number.isFinite(returnedAmount)
      || Math.abs(returnedAmount - Number(order.total)) > 0.009
      || returnedType !== paymentTypeId) {
      console.error("card integrity mismatch", { orderId: order.id, returnedExternal, returnedAmount, expected: Number(order.total), returnedType, paymentTypeId });
      return json({ error: "A resposta do pagamento não passou pela verificação de integridade. Nenhum pedido foi aprovado." }, 502, headers);
    }

    const status = String(payment.status || mp.status || "processing");
    const statusDetail = String(payment.status_detail || mp.status_detail || "").slice(0, 480);
    const recorded = Number(payment?.payment_method?.installments || installments);
    const { error: syncError } = await admin.rpc("sync_order_payment_status", {
      p_order_id: order.id,
      p_status: mapStatus(status),
      p_mercado_pago_order_id: String(mp.id || ""),
      p_mercado_pago_payment_id: String(payment.id || ""),
      p_mercado_pago_status: status,
      p_mercado_pago_status_detail: statusDetail,
    });
    if (syncError) throw syncError;

    const { error: updateError } = await admin.from("orders").update({
      mercado_pago_payment_method_id: String(payment?.payment_method?.id || methodId).slice(0, 80),
      mercado_pago_payment_type_id: returnedType.slice(0, 40),
      payment_installments: recorded,
    }).eq("id", order.id);
    if (updateError) throw updateError;

    return json({
      approved: ["processed", "approved"].includes(status) && ["accredited", "approved", "").includes(statusDetail),
      pending: ["processing", "in_process", "action_required"].includes(status),
      rejected: ["failed", "rejected"].includes(status),
      mercadoPagoOrderId: String(mp.id || ""),
      paymentId: String(payment.id || ""),
      status,
      statusDetail: ["processed", "approved"].includes(status) ? "accredited" : "pending",
      orderCode: order.order_code,
      installments: recorded,
      amount: returnedAmount,
      environment,
    }, 200, headers);
  } catch (error) {
    console.error("process-card-payment failed", error instanceof Error ? error.message : "unknown");
    const message = error instanceof Error ? error.message : "Não foi possível processar o cartão.";
    const safe = /^(Pedido|Este pedido|Acesso|Selecione|Tipo|Documento|Confira|Os dados|O aceite|A reserva|Muitas tentativas|A loja|Credencial|Total)/.test(message)
      ? message
      : "Não foi possível processar o cartão. Tente novamente em alguns minutos.";
    return json({ error: safe }, 400, headers);
  }
});
