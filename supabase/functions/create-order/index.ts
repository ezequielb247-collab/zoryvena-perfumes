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

function validEmail(value: unknown) {
  const email = String(value || "").trim().toLowerCase();
  return email.length >= 5 && email.length <= 150 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validUuid(value: unknown) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
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

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  const allowed = [
    "Dados do pedido inválidos", "Aceite os termos", "O aceite das políticas", "Modalidade de entrega inválida",
    "A entrega precisa", "Informe um e-mail", "Informe o nome", "WhatsApp inválido", "CEP inválido",
    "Preencha o endereço", "Produto indisponível", "Quantidade", "O pedido", "Forma de pagamento inválida",
    "Total do pedido inválido", "Muitas tentativas", "A loja ainda não está liberada", "Credencial", "Public Key",
    "QR Code Pix", "frete ainda não", "cotação de frete expirou", "Cotação de frete expirou",
    "Pedido não encontrado", "Este pedido não é uma entrega", "Este pedido não está mais ativo",
  ];
  return allowed.some(part => message.includes(part))
    ? message
    : "Não foi possível criar o pedido. Tente novamente em alguns minutos.";
}

async function mpRequest(url: string, token: string, init: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const text = await response.text();
  let data: any = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
  return { response, data };
}

function productionReady(settings: any) {
  const legal = Boolean(
    String(settings.legal_name || "").trim()
    && String(settings.tax_id || "").trim()
    && String(settings.business_address || "").trim()
  );
  const supplier = Boolean(settings.supplier_docs_verified || settings.supplier_docs_unavailable_acknowledged_at);
  return ["soft_launch", "live"].includes(String(settings.launch_status)) && legal && supplier;
}

async function consumeLimits(admin: any, limits: Array<{ key: string; max: number }>, seconds = 900) {
  for (const limit of limits) {
    const { data: allowed, error } = await admin.rpc("consume_api_rate_limit", {
      p_key: await sha256(limit.key),
      p_max_hits: limit.max,
      p_window_seconds: seconds,
    });
    if (error) throw error;
    if (!allowed) return false;
  }
  return true;
}

async function releaseInitialization(admin: any, orderId: string, reason: string) {
  try {
    await admin.rpc("release_order_inventory_reservation", {
      p_order_id: orderId,
      p_mark_cancelled: false,
      p_reason: reason,
    });
    await admin.from("orders").update({
      status: "Erro ao gerar pagamento",
      mercado_pago_status: "error",
      mercado_pago_status_detail: reason,
    }).eq("id", orderId);
  } catch (error) {
    console.error("release initialization failed", error instanceof Error ? error.message : "unknown");
  }
}

async function initializePayment(
  admin: any,
  order: any,
  customer: any,
  environment: "production" | "test",
  headers: Record<string, string>,
  onExternalCharge: () => void = () => {},
) {
  const orderId = String(order.id || "");
  const statusToken = String(order.public_status_token || order.statusToken || "");
  const reservationExpiresAt = order.inventory_reservation_expires_at || order.reservationExpiresAt || "";
  const customerEmail = String(order.customer_email || customer.email || "").trim().toLowerCase();

  if (order.payment_method === "card" || order.paymentMethod === "card") {
    const publicKey = Deno.env.get(environment === "production"
      ? "MERCADO_PAGO_PUBLIC_KEY_CARD_PRODUCTION"
      : "MERCADO_PAGO_PUBLIC_KEY_CARD_TEST");
    if (!publicKey) {
      throw new Error(environment === "production"
        ? "Public Key produtiva do cartão não configurada."
        : "Public Key de teste do cartão não configurada.");
    }
    const { error } = await admin.from("orders").update({
      mercado_pago_status: "awaiting_card_data",
      mercado_pago_status_detail: `card_payment_brick_${environment}`,
    }).eq("id", orderId);
    if (error) throw error;

    return json({
      id: orderId,
      orderCode: order.order_code || order.orderCode,
      total: Number(order.total || 0),
      paymentMethod: "card",
      statusToken,
      paymentMode: "card_brick",
      cardPublicKey: publicKey,
      customerEmail,
      testBuyerEmail: environment === "test" ? "test@testuser.com" : "",
      reservationExpiresAt,
      containsPreorder: Boolean(order.contains_preorder ?? order.containsPreorder),
      containsReadyStock: Boolean(order.contains_ready_stock ?? order.containsReadyStock),
      environment,
    }, 200, headers);
  }

  const token = Deno.env.get(environment === "production"
    ? "MERCADO_PAGO_ACCESS_TOKEN_PRODUCTION"
    : "MERCADO_PAGO_ACCESS_TOKEN_TEST");
  if (!token) {
    throw new Error(environment === "production"
      ? "Credencial produtiva do Pix não configurada."
      : "Credencial de teste do Pix não configurada.");
  }

  const expectedAmount = environment === "production" ? Number(order.total) : 50;
  const amount = expectedAmount.toFixed(2);
  let data: any;
  let payment: any;

  if (order.mercado_pago_order_id) {
    const recovered = await mpRequest(
      `https://api.mercadopago.com/v1/orders/${encodeURIComponent(String(order.mercado_pago_order_id))}`,
      token,
      { method: "GET" },
    );
    if (!recovered.response.ok) throw new Error("Não foi possível recuperar o QR Code Pix deste pedido.");
    data = recovered.data;
    payment = data?.transactions?.payments?.[0] || {};
    const returnedAmount = Number(payment.amount ?? data.total_amount);
    const methodId = String(payment?.payment_method?.id || "").toLowerCase();
    const methodType = String(payment?.payment_method?.type || "").toLowerCase();
    if (String(data.external_reference || "") !== orderId
      || !Number.isFinite(returnedAmount)
      || Math.abs(returnedAmount - expectedAmount) > 0.009
      || !(methodId === "pix" || methodType === "bank_transfer")) {
      throw new Error("A cobrança Pix existente não passou pela verificação de integridade.");
    }
  } else {
    const payerEmail = environment === "production" ? customerEmail : "test_user_br@testuser.com";
    const created = await mpRequest("https://api.mercadopago.com/v1/orders", token, {
      method: "POST",
      headers: { "X-Idempotency-Key": `zoryvena-pix-${environment}-${orderId}` },
      body: JSON.stringify({
        type: "online",
        external_reference: orderId,
        total_amount: amount,
        payer: {
          email: payerEmail,
          first_name: String(customer.name || order.customer_name || "Cliente").slice(0, 60),
        },
        transactions: { payments: [{ amount, payment_method: { id: "pix", type: "bank_transfer" } }] },
      }),
    });
    if (!created.response.ok) {
      await releaseInitialization(admin, orderId, "pix_initialization_failed");
      throw new Error("Não foi possível gerar o QR Code Pix.");
    }
    onExternalCharge();
    data = created.data;
    payment = data?.transactions?.payments?.[0] || {};
  }

  const pix = payment?.payment_method || {};
  const qrCode = String(pix.qr_code || "");
  const qrCodeBase64 = String(pix.qr_code_base64 || "");
  const ticketUrl = String(pix.ticket_url || order.payment_url || "");
  if (!qrCode && !ticketUrl) throw new Error("O Mercado Pago não retornou o QR Code Pix.");

  const { error: updateError } = await admin.from("orders").update({
    mercado_pago_order_id: String(data.id || order.mercado_pago_order_id || ""),
    mercado_pago_payment_id: String(payment.id || order.mercado_pago_payment_id || ""),
    mercado_pago_status: String(payment.status || data.status || "action_required").slice(0, 100),
    mercado_pago_status_detail: String(payment.status_detail || data.status_detail || "waiting_transfer").slice(0, 480),
    payment_url: ticketUrl || null,
    status: "Aguardando pagamento",
  }).eq("id", orderId);
  if (updateError) throw updateError;

  return json({
    id: orderId,
    orderCode: order.order_code || order.orderCode,
    total: Number(order.total || 0),
    paymentMethod: "pix",
    statusToken,
    paymentMode: "pix",
    customerEmail,
    mercadoPagoOrderId: String(data.id || order.mercado_pago_order_id || ""),
    paymentId: String(payment.id || order.mercado_pago_payment_id || ""),
    reservationExpiresAt,
    containsPreorder: Boolean(order.contains_preorder ?? order.containsPreorder),
    containsReadyStock: Boolean(order.contains_ready_stock ?? order.containsReadyStock),
    pix: {
      qrCode,
      qrCodeBase64,
      ticketUrl,
      expiresInSeconds: 1800,
      chargedAmount: expectedAmount,
      simulated: environment === "test",
      actualOrderTotal: Number(order.total || 0),
    },
    environment,
  }, 200, headers);
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  const headers = cors(origin);
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405, headers);
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return json({ error: "Origem não autorizada." }, 403, headers);
  if (Number(req.headers.get("content-length") || 0) > 32768) return json({ error: "Solicitação muito grande." }, 413, headers);

  let admin: any = null;
  let createdOrderId = "";
  let releaseOnFailure = false;

  try {
    const payload = await req.json();
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) throw new Error("Configuração do servidor indisponível.");
    admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

    const { data: settings, error: settingsError } = await admin.from("store_settings").select(
      "payment_environment,launch_status,shipping_mode,legal_name,tax_id,business_address,supplier_docs_verified,supplier_docs_unavailable_acknowledged_at,policies_updated_at"
    ).eq("id", 1).single();
    if (settingsError) throw settingsError;
    const environment: "production" | "test" = settings.payment_environment === "production" ? "production" : "test";
    if (environment === "production") {
      if (origin !== STORE_URL) return json({ error: "Origem não autorizada em produção." }, 403, headers);
      if (!productionReady(settings)) throw new Error("A loja ainda não está liberada para pagamentos reais.");
    }

    const ip = requestIp(req);
    await admin.rpc("expire_order_inventory_reservations");

    if (payload?.action === "start_shipping_payment") {
      const orderId = String(payload?.orderId || "").trim();
      const statusToken = String(payload?.statusToken || "").trim();
      if (!validUuid(orderId) || !validUuid(statusToken)) throw new Error("Pedido não encontrado.");
      const allowed = await consumeLimits(admin, [
        { key: `shipping-pay-ip:${ip}`, max: 20 },
        { key: `shipping-pay-order:${orderId}`, max: 8 },
      ], 900);
      if (!allowed) return json({ error: "Muitas tentativas de pagamento. Aguarde 15 minutos." }, 429, headers);

      const { error: prepareError } = await admin.rpc("prepare_shipping_order_payment", {
        p_order_id: orderId,
        p_status_token: statusToken,
      });
      if (prepareError) throw prepareError;
      createdOrderId = orderId;

      const { data: order, error: orderError } = await admin.from("orders").select(
        "id,order_code,total,payment_method,public_status_token,inventory_reservation_expires_at,contains_preorder,contains_ready_stock,customer_name,customer_email,mercado_pago_order_id,mercado_pago_payment_id,payment_url"
      ).eq("id", orderId).eq("public_status_token", statusToken).single();
      if (orderError) throw orderError;
      releaseOnFailure = !order.mercado_pago_order_id;
      return await initializePayment(
        admin,
        order,
        { name: order.customer_name, email: order.customer_email },
        environment,
        headers,
        () => { releaseOnFailure = false; },
      );
    }

    const customer = payload?.customer;
    const items = payload?.items;
    const notes = typeof payload?.notes === "string" ? payload.notes.slice(0, 1000) : null;
    const paymentMethod = payload?.paymentMethod === "pix" ? "pix" : payload?.paymentMethod === "card" ? "card" : "";
    if (!customer || !Array.isArray(items) || items.length < 1 || items.length > 20 || !paymentMethod) {
      throw new Error("Dados do pedido inválidos.");
    }
    if (customer.acceptedPolicies !== "yes") throw new Error("Aceite os termos e as políticas para continuar.");
    if (!validEmail(customer.email)) throw new Error("Informe um e-mail válido para identificar e acompanhar o pedido.");
    customer.email = String(customer.email).trim().toLowerCase();

    const allowed = await consumeLimits(admin, [
      { key: `create-ip:${ip}`, max: 20 },
      { key: `create-email:${customer.email}`, max: 8 },
      { key: `create-pair:${ip}:${customer.email}`, max: 6 },
    ], 900);
    if (!allowed) return json({ error: "Muitas tentativas de pedido. Aguarde 15 minutos." }, 429, headers);

    if (customer.delivery === "shipping") {
      if (settings.shipping_mode !== "manual_quote") throw new Error("A entrega precisa seguir a modalidade de frete configurada pela loja.");
      const { data: quote, error: quoteError } = await admin.rpc("create_shipping_quote_request", {
        p_customer: customer,
        p_items: items,
        p_notes: notes,
        p_payment_method: paymentMethod,
      });
      if (quoteError) throw quoteError;
      createdOrderId = String(quote.id || "");
      const { data: order, error: termsError } = await admin.from("orders").update({
        terms_accepted_at: new Date().toISOString(),
        terms_version: String(settings.policies_updated_at || "2026-08-02"),
      }).eq("id", createdOrderId).select("public_status_token,shipping_quote_expires_at").single();
      if (termsError) throw termsError;
      return json({
        id: createdOrderId,
        orderCode: quote.orderCode,
        total: Number(quote.total || 0),
        paymentMethod,
        statusToken: String(order.public_status_token || ""),
        quoteMode: "manual_shipping",
        quoteStatus: "Aguardando cotação de frete",
        quoteExpiresAt: order.shipping_quote_expires_at,
        environment,
      }, 200, headers);
    }

    if (customer.delivery !== "pickup") throw new Error("Modalidade de entrega inválida.");
    const { data: created, error: createError } = await admin.rpc("create_store_order", {
      p_customer: customer,
      p_items: items,
      p_notes: notes,
      p_payment_method: paymentMethod,
    });
    if (createError) throw createError;
    createdOrderId = String(created.id || "");
    releaseOnFailure = true;

    const { data: order, error: termsError } = await admin.from("orders").update({
      terms_accepted_at: new Date().toISOString(),
      terms_version: String(settings.policies_updated_at || "2026-08-02"),
    }).eq("id", createdOrderId).select(
      "id,order_code,total,payment_method,public_status_token,inventory_reservation_expires_at,contains_preorder,contains_ready_stock,customer_name,customer_email,mercado_pago_order_id,mercado_pago_payment_id,payment_url"
    ).single();
    if (termsError) throw termsError;
    return await initializePayment(
      admin,
      order,
      customer,
      environment,
      headers,
      () => { releaseOnFailure = false; },
    );
  } catch (error) {
    console.error("create-order failed", error instanceof Error ? error.message : "unknown");
    if (admin && createdOrderId && releaseOnFailure) await releaseInitialization(admin, createdOrderId, "order_initialization_failed");
    return json({ error: safeError(error) }, 400, headers);
  }
});