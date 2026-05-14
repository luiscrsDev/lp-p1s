// =================================================================
// VERCEL SERVERLESS FUNCTION
// Gera link de pagamento ParceladoPay pra Bambu Lab P1S Combo
// =================================================================
//
// Fluxo:
// 1. Recebe POST do form de checkout da landing (dados do cliente)
// 2. Autentica no ParceladoPay com pubKey + merchantCode (env vars)
// 3. Cria ordem de pagamento e recebe URL hospedada
// 4. Retorna paymentUrl pro frontend redirecionar o cliente
//
// Env vars necessárias no Vercel:
//   PARCELADOPAY_PUBKEY        — Chave pública (sandbox ou produção)
//   PARCELADOPAY_MERCHANT_CODE — Código do merchant (sandbox: 6781)
//   PARCELADOPAY_BASE_URL      — opcional, default: sandbox
//                                Produção: https://api.parceladousa.com
// =================================================================

const PUBKEY = process.env.PARCELADOPAY_PUBKEY;
const MERCHANT_CODE = process.env.PARCELADOPAY_MERCHANT_CODE;
const BASE_URL = process.env.PARCELADOPAY_BASE_URL || 'https://apisandbox.parceladousa.com';

// Produto fixo desta landing
const PRODUCT = {
  name: 'Bambu Lab P1S Combo',
  amount: 7970.00,
  currency: 'BRL',
  invoicePrefix: 'P1S'
};

export default async function handler(req, res) {
  // CORS pra permitir o front chamar
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // -------- Validação básica --------
    const {
      nome, cpf, email, telefone,
      cep, endereco, numero, complemento, bairro, cidade, estado
    } = req.body || {};

    if (!nome || !email || !cpf || !telefone) {
      return res.status(400).json({ error: 'Dados obrigatórios faltando: nome, cpf, email e telefone são exigidos.' });
    }

    if (!PUBKEY || !MERCHANT_CODE) {
      console.error('[create-payment] Missing env vars: PARCELADOPAY_PUBKEY or PARCELADOPAY_MERCHANT_CODE');
      return res.status(500).json({ error: 'Configuração de pagamento indisponível no servidor.' });
    }

    // -------- 1) AUTENTICAÇÃO --------
    const authResp = await fetch(`${BASE_URL}/v1/paymentapi/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pubKey: PUBKEY, merchantCode: MERCHANT_CODE })
    });
    const authData = await authResp.json();

    if (authData.statusType !== 'success' || !authData.token) {
      console.error('[create-payment] Auth failed:', authData);
      return res.status(502).json({ error: 'Falha de autenticação no gateway de pagamento.', detail: authData.msg || null });
    }

    const token = authData.token;

    // -------- 2) CRIAR ORDEM --------
    const cleanedCpf   = String(cpf).replace(/\D/g, '');
    const cleanedPhone = String(telefone).replace(/\D/g, '');
    const cleanedCep   = String(cep || '').replace(/\D/g, '');

    // Callback URL: pra onde o cliente volta após pagar
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers.host || 'p1s.globalbrasilshop.com';
    const callbackUrl = `${protocol}://${host}/?order_complete=1`;

    const orderBody = {
      amount: PRODUCT.amount,
      currency: PRODUCT.currency,
      invoice: `${PRODUCT.invoicePrefix}-${Date.now()}`,
      description: `${PRODUCT.name} — Importação direta GlobalBrasilShop`,
      client: {
        name: nome,
        email: email,
        doc: cleanedCpf,
        phone: cleanedPhone,
        cep: cleanedCep,
        address: endereco || '',
        addressNumber: numero || '',
        district: bairro || '',
        city: cidade || '',
        state: estado || ''
      },
      callback: callbackUrl
    };

    const orderResp = await fetch(`${BASE_URL}/v1/paymentapi/order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(orderBody)
    });
    const orderData = await orderResp.json();

    if (orderData.statusType !== 'success' || !orderData.data?.url) {
      console.error('[create-payment] Order creation failed:', JSON.stringify(orderData), 'HTTP', orderResp.status);
      return res.status(502).json({
        error: 'Falha ao criar link de pagamento.',
        detail: orderData.msg || orderData.message || null,
        gateway_status: orderResp.status,
        gateway_response: orderData,
        sent_payload_keys: Object.keys(orderBody)
      });
    }

    // -------- 3) SUCESSO --------
    return res.status(200).json({
      success: true,
      paymentUrl: orderData.data.url,
      orderId: orderData.data.orderId
    });

  } catch (err) {
    console.error('[create-payment] Unexpected error:', err);
    return res.status(500).json({
      error: 'Erro interno no servidor.',
      detail: String(err?.message || err)
    });
  }
}
