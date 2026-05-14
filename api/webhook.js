// =================================================================
// VERCEL SERVERLESS FUNCTION
// Recebe notificações do ParceladoPay quando status de uma ordem muda
// =================================================================
//
// Status possíveis (ver doc):
//   open      — transação aberta, aguardando pagamento
//   pending   — boleto gerado, aguardando quitação
//   analysis  — pagamento em análise de segurança
//   approved  — pagamento aprovado ✓
//   delivered — valor já transferido pro merchant
//   canceled  — pagamento cancelado
//   aborted   — cliente abortou na tela de pagamento
//
// Cadastrar a URL deste endpoint no painel ParceladoPay
// (Integrações → URL de webhook):
//   https://p1s.globalbrasilshop.com/api/webhook
// =================================================================

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const event = req.body || {};
    const { orderId, status, amount, client } = event;

    console.log('[webhook]', JSON.stringify({ orderId, status, amount, client_email: client?.email }));

    // TODO (próximas iterações):
    //   - Salvar evento no Supabase (tabela `payment_events`)
    //   - Disparar Measurement Protocol GA4 (purchase event server-side)
    //   - Enviar email/WhatsApp pro cliente confirmando
    //   - Notificar GBS no Slack/Telegram quando approved

    // Por enquanto, só responde 200 pra confirmar recebimento
    return res.status(200).json({ received: true, orderId, status });

  } catch (err) {
    console.error('[webhook] Error parsing event:', err);
    return res.status(500).json({ error: 'Erro ao processar webhook.' });
  }
}
