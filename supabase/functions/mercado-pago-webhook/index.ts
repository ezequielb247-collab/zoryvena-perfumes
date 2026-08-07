import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store, max-age=0","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"}});}
function mapPayment(status:string){return status==="approved"?"Pagamento aprovado":status==="in_process"?"Pagamento em análise":status==="rejected"?"Pagamento recusado":status==="cancelled"?"Cancelado":status==="refunded"?"Reembolsado":status==="charged_back"?"Contestação":"Aguardando pagamento";}
function mapOrder(status:string){return ["processed","approved"].includes(status)?"Pagamento aprovado":["processing","in_process"].includes(status)?"Pagamento em análise":["failed","rejected"].includes(status)?"Pagamento recusado":["canceled","cancelled","expired"].includes(status)?"Cancelado":status==="refunded"?"Reembolsado":"Aguardando pagamento";}
async function hmacHex(secret:string,message:string){const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);const sig=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(message));return Array.from(new Uint8Array(sig)).map(b=>b.toString(16).padStart(2,"0")).join("");}
function safeEqual(a:string,b:string){if(a.length!==b.length)return false;let result=0;for(let i=0;i<a.length;i++)result|=a.charCodeAt(i)^b.charCodeAt(i);return result===0;}
async function validSignature(req:Request,dataId:string,secrets:string[]){const signature=req.headers.get("x-signature")||"",requestId=req.headers.get("x-request-id")||"";if(!signature||!requestId||!dataId||!secrets.length)return false;const parts:Record<string,string>={};for(const part of signature.split(",")){const [k,v]=part.trim().split("=",2);if(k&&v)parts[k]=v;}const ts=parts.ts||"",received=parts.v1||"";if(!ts||!received)return false;const numericTs=Number(ts);if(!Number.isFinite(numericTs))return false;const tsMs=numericTs>1e12?numericTs:numericTs*1000;if(Math.abs(Date.now()-tsMs)>10*60*1000)return false;const manifest=`id:${dataId};request-id:${requestId};ts:${ts};`;for(const secret of secrets){if(safeEqual(await hmacHex(secret,manifest),received))return true;}return false;}
async function fetchMP(path:string,tokens:string[]){let last:any={};let status=500;for(const token of tokens){const response=await fetch(`https://api.mercadopago.com${path}`,{headers:{Authorization:`Bearer ${token}`}});const text=await response.text();try{last=text?JSON.parse(text):{};}catch{last={};}status=response.status;if(response.ok)return last;}throw new Error(String(last?.message||last?.error||`Mercado Pago respondeu ${status}.`));}
function amountMatches(actual:unknown,expected:number){const value=Number(actual);return Number.isFinite(value)&&Math.abs(value-expected)<=0.009;}
function methodMatches(orderMethod:string,payment:any){const id=String(payment?.payment_method?.id||payment?.payment_method_id||"").toLowerCase(),type=String(payment?.payment_method?.type||payment?.payment_type_id||"").toLowerCase();return orderMethod==="pix"?(id==="pix"||type==="bank_transfer"):["credit_card","debit_card"].includes(type);}

Deno.serve(async(req:Request)=>{
  if(req.method!=="POST")return json({error:"Método não permitido."},405);
  if(Number(req.headers.get("content-length")||0)>65536)return json({error:"Solicitação muito grande."},413);
  try{
    const url=new URL(req.url);let body:Record<string,any>={};try{body=await req.json();}catch{body={};}
    const dataNode=body.data&&typeof body.data==="object"?body.data:{};
    const type=String(body.type||url.searchParams.get("type")||body.topic||url.searchParams.get("topic")||"");
    const resourceId=String(dataNode.id||body.id||url.searchParams.get("data.id")||url.searchParams.get("id")||"").trim();
    if(!resourceId||resourceId.length>180)return json({ok:true,ignored:"invalid_resource_id"});
    const isOrderNotification=type==="order"||type==="orders"||resourceId.startsWith("ORD");

    const supabaseUrl=Deno.env.get("SUPABASE_URL"),serviceRoleKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");if(!supabaseUrl||!serviceRoleKey)throw new Error("Configuração do servidor indisponível.");
    const admin=createClient(supabaseUrl,serviceRoleKey,{auth:{persistSession:false,autoRefreshToken:false}});
    const{data:settings,error:settingsError}=await admin.from("store_settings").select("payment_environment").eq("id",1).single();if(settingsError)throw settingsError;
    const productionHint=url.searchParams.get("mode")==="production",configuredEnvironment=settings.payment_environment==="production"?"production":"test",environment=productionHint?"production":configuredEnvironment;
    const prodSecrets=[Deno.env.get("MERCADO_PAGO_WEBHOOK_SECRET_CARD"),Deno.env.get("MERCADO_PAGO_WEBHOOK_SECRET_PIX")].filter((v):v is string=>Boolean(v));
    const testSecrets=[Deno.env.get("MERCADO_PAGO_WEBHOOK_SECRET_CARD_TEST"),Deno.env.get("MERCADO_PAGO_WEBHOOK_SECRET_PIX_TEST")].filter((v):v is string=>Boolean(v));
    const secrets=environment==="production"?prodSecrets:testSecrets;
    const signatureValid=secrets.length?await validSignature(req,resourceId,secrets):false;

    // Readiness simulation still requires the signed webhook configured in Mercado Pago.
    if(productionHint&&configuredEnvironment!=="production"){
      if(!secrets.length)return json({error:"Webhook produtivo sem assinatura configurada."},503);
      if(!signatureValid)return json({error:"Assinatura inválida ou expirada."},401);
      const{error}=await admin.from("store_settings").update({payment_webhook_verified_at:new Date().toISOString()}).eq("id",1);if(error)throw error;
      return json({ok:true,readiness:"production_webhook_verified"});
    }

    // payment webhooks remain HMAC-authenticated. Order/Pix notifications are authenticated
    // by fetching the resource with our Mercado Pago token and validating identity/amount/method.
    if(!isOrderNotification){
      if(environment==="production"&&!secrets.length)return json({error:"Webhook produtivo sem assinatura configurada."},503);
      if(secrets.length&&!signatureValid)return json({error:"Assinatura inválida ou expirada."},401);
    }

    const liveMode=body.live_mode;if(environment==="production"&&liveMode===false)return json({ok:true,ignored:"test_notification_in_production"});if(environment==="test"&&liveMode===true)return json({ok:true,ignored:"live_notification_in_test"});
    const testTokens=[Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN_CARD_TEST"),Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN_TEST")],prodTokens=[Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN_CARD_PRODUCTION"),Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN_PRODUCTION")];
    const tokens=(environment==="production"?prodTokens:testTokens).filter((v):v is string=>Boolean(v));if(!tokens.length)throw new Error("Credenciais do ambiente não configuradas.");

    if(isOrderNotification){
      const mp=await fetchMP(`/v1/orders/${encodeURIComponent(resourceId)}`,tokens);
      const external=String(mp.external_reference||"");if(!/^[0-9a-f-]{36}$/i.test(external))return json({ok:true,ignored:"invalid_external_reference"});
      const payment=mp?.transactions?.payments?.[0]||{};
      const{data:order,error:orderError}=await admin.from("orders").select("id,total,payment_method,mercado_pago_order_id,mercado_pago_payment_id,status").eq("id",external).maybeSingle();if(orderError)throw orderError;if(!order)return json({ok:true,ignored:"unknown_order"});
      if(order.mercado_pago_order_id&&String(order.mercado_pago_order_id)!==String(mp.id||resourceId))return json({error:"Identificador de cobrança divergente."},409);
      if(order.mercado_pago_payment_id&&payment.id&&String(order.mercado_pago_payment_id)!==String(payment.id))return json({error:"Identificador de pagamento divergente."},409);
      const expected=environment==="test"&&order.payment_method==="pix"?50:Number(order.total);if(!amountMatches(payment.amount??mp.total_amount,expected)||!methodMatches(order.payment_method,payment))return json({error:"Cobrança divergente do pedido."},409);
      const mpStatus=String(payment.status||mp.status||"action_required"),detail=String(payment.status_detail||mp.status_detail||"waiting_transfer").slice(0,480);
      const{error}=await admin.rpc("sync_order_payment_status",{p_order_id:external,p_status:mapOrder(mpStatus),p_mercado_pago_order_id:String(mp.id||resourceId),p_mercado_pago_payment_id:String(payment.id||""),p_mercado_pago_status:mpStatus,p_mercado_pago_status_detail:detail});if(error)throw error;
      if(environment==="production"){const{error:v}=await admin.from("store_settings").update({payment_webhook_verified_at:new Date().toISOString()}).eq("id",1);if(v)throw v;}
      return json({ok:true,verifiedBy:"mercado_pago_api"});
    }

    if(type&&type!=="payment")return json({ok:true,ignored:"unsupported_type"});
    const payment=await fetchMP(`/v1/payments/${encodeURIComponent(resourceId)}`,tokens),orderId=String(payment.external_reference||"");if(!/^[0-9a-f-]{36}$/i.test(orderId))return json({ok:true,ignored:"invalid_external_reference"});
    const{data:order,error:orderError}=await admin.from("orders").select("id,total,payment_method,mercado_pago_payment_id,status").eq("id",orderId).maybeSingle();if(orderError)throw orderError;if(!order)return json({ok:true,ignored:"unknown_order"});
    if(order.mercado_pago_payment_id&&String(order.mercado_pago_payment_id)!==String(payment.id||resourceId))return json({error:"Identificador de pagamento divergente."},409);
    const expected=environment==="test"&&order.payment_method==="pix"?50:Number(order.total);if(!amountMatches(payment.transaction_amount??payment.amount,expected)||!methodMatches(order.payment_method,payment))return json({error:"Pagamento divergente do pedido."},409);
    const mpStatus=String(payment.status||""),detail=String(payment.status_detail||"").slice(0,480);
    const{error}=await admin.rpc("sync_order_payment_status",{p_order_id:orderId,p_status:mapPayment(mpStatus),p_mercado_pago_order_id:null,p_mercado_pago_payment_id:String(payment.id||resourceId),p_mercado_pago_status:mpStatus,p_mercado_pago_status_detail:detail});if(error)throw error;
    if(environment==="production"){const{error:v}=await admin.from("store_settings").update({payment_webhook_verified_at:new Date().toISOString()}).eq("id",1);if(v)throw v;}
    return json({ok:true,verifiedBy:"hmac_and_api"});
  }catch(error){console.error("mercado-pago-webhook failed",error instanceof Error?error.message:"unknown");return json({error:"Não foi possível processar a notificação."},500);}
});
