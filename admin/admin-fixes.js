const modal = document.querySelector('#orderModal');
const saveButton = document.querySelector('#saveOrderManagement');

saveButton?.addEventListener('click', () => {
  if (modal?.open) modal.close();
}, { capture: true });
