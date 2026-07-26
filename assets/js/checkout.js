import { cartDetails, cartTotal, money, createOrder, whatsappUrl } from './store.js';
const form=document.querySelector('#checkoutForm');const empty=document.querySelector('#checkoutEmpty');const content=document.querySelector('#checkoutContent');
const items=cartDetails();
if(!items.length){content.hidden=true;empty.hidden=false;} else {document.querySelector('#checkoutItems').innerHTML=items.map(i=>`<li><span>${i.quantity}× ${i.product.brand} ${i.product.name}</span><strong>${money.format(Number(i.product.price)*i.quantity)}</strong></li>`).join('');document.querySelector('#checkoutTotal').textContent=money.format(cartTotal());}
form?.addEventListener('submit',e=>{e.preventDefault();const data=Object.fromEntries(new FormData(form));const order=createOrder(data);const msg=`Olá! Quero confirmar o pedido ${order.id}. Total: ${money.format(order.total)}. Cliente: ${order.name}.`;location.href=whatsappUrl(msg);});
