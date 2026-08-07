export function paymentProductionState({
  credentialsVerifiedAt = null,
  webhookVerifiedAt = null,
  supplierDocsVerified = false,
  supplierDocsExceptionAcknowledged = false,
  selectedPaymentEnvironment = 'test',
  storedLaunchStatus = 'preparation',
} = {}) {
  const credentialsVerified = Boolean(credentialsVerifiedAt);
  const webhookVerified = Boolean(webhookVerifiedAt);
  const supplierRequirementMet = Boolean(supplierDocsVerified) || Boolean(supplierDocsExceptionAcknowledged);
  const paymentReady = credentialsVerified && webhookVerified;
  const canUseProduction = supplierRequirementMet && paymentReady;
  const canUseSoftLaunch = canUseProduction && selectedPaymentEnvironment === 'production';
  const canUseLive = canUseSoftLaunch && ['soft_launch', 'live'].includes(storedLaunchStatus);

  return {
    credentialsVerified,
    webhookVerified,
    supplierRequirementMet,
    paymentReady,
    canUseProduction,
    canUseSoftLaunch,
    canUseLive,
  };
}

export function missingProductionChecks(state) {
  const missing = [];
  if (!state.credentialsVerified) missing.push('Credenciais produtivas');
  if (!state.webhookVerified) missing.push('Webhook produtivo');
  return missing;
}
