import { cartDetails, cartTotal, money, createOrder, whatsappUrl, showToast } from './store.js';
const form=document.querySelector('#checkoutForm');const empty=document.querySelector('#checkoutEmpty');const content=document.querySelector('#checkoutContent');
const items=cartDetails();
if(!items.length){content.hidden=true;empty.hidden=false;} else {document.querySelector('#checkoutItems').innerHTML=items.map(i=>`<li><span>${i.quantity}× ${i.product.brand} ${i.product.name}</span><strong>${money.format(Number(i.product.price)*i.quantity)}</strong></li>`).join('');document.querySelector('#checkoutTotal').textContent=money.format(cartTotal());}
form?.addEventListener('submit',async e=>{
  e.preventDefault();
  const button=form.querySelector('button[type="submit"]');
  const original=button?.textContent;
  if(button){button.disabled=true;button.textContent='Registrando pedido...';}
  try{
    const data=Object.fromEntries(new FormData(form));
    const order=await createOrder(data);
    const msg=`Olá! Quero confirmar o pedido ${order.id}. Total: ${money.format(order.total)}. Cliente: ${order.name}.`;
    location.href=whatsappUrl(msg);
  }catch(error){
    console.error(error);
    showToast(error?.message||'Não foi possível registrar o pedido. Confira os dados e tente novamente.');
    if(button){button.disabled=false;button.textContent=original;}
  }
});
