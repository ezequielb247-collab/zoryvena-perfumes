import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

const STORE_URL="https://zoryvena-perfumes.onrender.com";
const LOCAL_ORIGINS=new Set(["http://127.0.0.1:5500","http://localhost:5500"]);
const ALLOWED_ORIGINS=new Set([STORE_URL,...LOCAL_ORIGINS]);
function cors(origin:string|null){return{"Access-Control-Allow-Origin":origin&&ALLOWED_ORIGINS.has(origin)?origin:STORE_URL,"Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Access-Control-Max-Age":"600","Vary":"Origin"};}
function json(body:unknown,status:number,headers:Record<string,string>){return new Response(JSON.stringify(body),{status,headers:{...headers,"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store, max-age=0","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"}});}
async function sha256(value:string){const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));return Array.from(new Uint8Array(d)).map(b=>b.toString(16).padStart(2,"0")).join("");}
function requestIp(req:Request){return req.headers.get("cf-connecting-ip")||req.headers.get("x-real-ip")||req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()||"unknown";}
function mapOrder(status:string){return ["processed","approved"].includes(status)?"Pagamento aprovado":["processing","in_process"].includes(status)?"Pagamento em análise":["failed","rejected"].includes(status)?"Pagamento recusado":["canceled","cancelled","expired"].includes(status)?"Cancelado":status==="refunded"?"Reembolsado":"Aguardando pagamento";}
function amountMatches(actual:unknown,expected:number){const value=Number(actual);return Number.isFinite(value)&&Math.abs(value-expected)<=0.009;}
function methodMatches(orderMethod:string,payment:any){const id=String(payment?.payment_method?.id||payment?.payment_method_id||"").toLowerCase(),type=String(payment?.payment_method?.type||payment?.payment_type_id||"").toLowerCase();return orderMethod==="pix"?(id==="pix"||type==="bank_transfer"):["credit_card","debit_card"].includes(type);}
async function fetchMPOrder(orderId:string,tokens:string[]){let last:any={};let status=500;for(const token of tokens){const response=await fetch(`https://api.mercadopago.com/v1/orders/${encodeURIComponent(orderId)}`,{headers:{Authorization:`Bearer ${token}`}});const text=await response.text();try{last=text?JSON.parse(text):{};}catch{last={};}status=response.status;if(response.ok)return last;}throw new Error(String(last?.message||last?.error||`Mercado Pago respondeu ${status}.`));}

Deno.serve(async(req:Request)=>{
  const origin=req.headers.get("origin"),headers=cors(origin);
  if(req.method==="OPTIONS")return new Response("ok",{headers});
  if(req.method!=="POST")return json({error:"Método não permitido."},405,headers);
  if(!origin||!ALLOWED_ORIGINS.has(origin))return json({error:"Origem não autorizada."},403,headers);
  if(Number(req.headers.get("content-length")||0)>8192)return json({error:"Solicitação muito grande."},413,headers);
  try{
    const payload=await req.json(),orderId=String(payload?.orderId||"").trim(),statusToken=String(payload?.statusToken||"").trim();
    if(!/^[0-9a-f-]{36}$/i.test(orderId)||!/^[0-9a-f-]{36}$/i.test(statusToken))return json({error:"Credencial do pedido inválida."},400,headers);
    const supabaseUrl=Deno.env.get("SUPABASE_URL"),serviceRoleKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");if(!supabaseUrl||!serviceRoleKey)throw new Error("server_config");
    const admin=createClient(supabaseUrl,serviceRoleKey,{auth:{persistSession:false,autoRefreshToken:false}});
    const{data:settings,error:settingsError}=await admin.from("store_settings").select("payment_environment").eq("id",1).single();if(settingsError)throw settingsError;
    const environment=settings.payment_environment==="production"?"production":"test";if(environment==="production"&&origin!==STORE_URL)return json({error:"Origem não autorizada em produção."},403,headers);
    const ip=requestIp(req);for(const limit of[{key:`status-ip:${ip}`,max:240},{key:`status-order:${orderId}:${statusToken}`,max:180}]){const{data:allowed,error}=await admin.rpc("consume_api_rate_limit",{p_key:await sha256(limit.key),p_max_hits:limit.max,p_window_seconds:600});if(error)throw error;if(!allowed)return json({error:"Muitas consultas. Aguarde alguns minutos."},429,headers);}

    let{data:order,error}=await admin.from("orders").select("id,order_code,status,fulfillment_status,payment_method,total,updated_at,inventory_reservation_expires_at,mercado_pago_order_id,mercado_pago_payment_id").eq("id",orderId).eq("public_status_token",statusToken).maybeSingle();if(error)throw error;if(!order)return json({error:"Pedido não encontrado."},404,headers);

    const pending=["Aguardando pagamento","Pagamento em análise"].includes(String(order.status));
    if(pending&&String(order.mercado_pago_order_id||"").startsWith("ORD")){
      const testTokens=[Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN_CARD_TEST"),Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN_TEST")],prodTokens=[Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN_CARD_PRODUCTION"),Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN_PRODUCTION")];
      const tokens=(environment==="production"?prodTokens:testTokens).filter((v):v is string=>Boolean(v));
      if(tokens.length){
        try{
          const mp=await fetchMPOrder(String(order.mercado_pago_order_id),tokens),external=String(mp.external_reference||""),payment=mp?.transactions?.payments?.[0]||{};
          const expected=environment==="test"&&order.payment_method==="pix"?50:Number(order.total);
          const identityMatches=external===order.id&&String(mp.id||"")===String(order.mercado_pago_order_id);
          const paymentIdMatches=!order.mercado_pago_payment_id||!payment.id||String(order.mercado_pago_payment_id)===String(payment.id);
          if(identityMatches&&paymentIdMatches&&amountMatches(payment.amount??mp.total_amount,expected)&&methodMatches(order.payment_method,payment)){
            const mpStatus=String(payment.status||mp.status||"action_required"),detail=String(payment.status_detail||mp.status_detail||"waiting_transfer").slice(0,480);
            const{error:syncError}=await admin.rpc("sync_order_payment_status",{p_order_id:order.id,p_status:mapOrder(mpStatus),p_mercado_pago_order_id:String(mp.id||order.mercado_pago_order_id),p_mercado_pago_payment_id:String(payment.id||order.mercado_pago_payment_id||""),p_mercado_pago_status:mpStatus,p_mercado_pago_status_detail:detail});
            if(!syncError){const refreshed=await admin.from("orders").select("id,order_code,status,fulfillment_status,payment_method,total,updated_at,inventory_reservation_expires_at,mercado_pago_order_id,mercado_pago_payment_id").eq("id",orderId).eq("public_status_token",statusToken).maybeSingle();if(!refreshed.error&&refreshed.data)order=refreshed.data;}
          }
        }catch(reconcileError){console.error("order-status reconciliation failed",reconcileError instanceof Error?reconcileError.message:"unknown");}
      }
    }

    return json({id:order.id,orderCode:order.order_code,status:order.status,fulfillmentStatus:order.fulfillment_status,paymentMethod:order.payment_method,total:Number(order.total||0),updatedAt:order.updated_at,reservationExpiresAt:order.inventory_reservation_expires_at,approved:order.status==="Pagamento aprovado",terminal:["Pagamento aprovado","Pagamento recusado","Cancelado","Reembolsado","Contestação"].includes(order.status)},200,headers);
  }catch(error){console.error("order-status failed",error instanceof Error?error.message:"unknown");return json({error:"Não foi possível consultar o pedido."},400,headers);}
});
