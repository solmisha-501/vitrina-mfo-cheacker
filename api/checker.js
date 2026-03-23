/**
 * Vercel Serverless Function — прокси для Leads.su Checker API
 * Endpoint: POST /api/checker
 */

const LEADS_TOKEN = '711dbecf40412b8736358337dc4c7bad';
const LEADS_API = 'https://api.leads.su/webmaster/checker';
const MAX_POLLS = 30;
const POLL_DELAY = 2000; // ms

const LEADS_OFFER_IDS = [
  512, 522, 693, 711, 718, 8328, 8950, 9560, 9667, 9695,
  9863, 10042, 10303, 10387, 10415, 10445, 10535, 10651,
  10684, 10690, 10692, 10792, 10793, 10946, 11027, 11100,
  11161, 11302, 11309, 11334, 11364, 11366, 11459, 11474,
  11493, 11517, 11546, 11562, 11564, 11572, 11588, 11650,
  11707, 11721
];

function normalizePhone(raw) {
  let digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && digits[0] === '8') {
    digits = '7' + digits.substring(1);
  }
  if (digits.length === 10) {
    digits = '7' + digits;
  }
  return digits;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const phone = normalizePhone(req.body?.phone || '');

  if (phone.length !== 11 || phone[0] !== '7') {
    return res.status(400).json({ error: 'Некорректный номер телефона' });
  }

  try {
    // Шаг 1: checkPhones
    const checkRes = await fetch(`${LEADS_API}/checkPhones?token=${LEADS_TOKEN}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'vitrina_check_' + Date.now(),
        phones: [phone],
        offers: LEADS_OFFER_IDS
      })
    });

    const checkData = await checkRes.json();
    const reportId = checkData.id || checkData.report_id || checkData.data?.id;

    if (!reportId) {
      return res.json({
        success: true,
        phone,
        raw: checkData,
        debug_step: 'checkPhones_direct_response'
      });
    }

    // Шаг 2: поллинг getReport
    const reportUrl = `${LEADS_API}/getReport?token=${LEADS_TOKEN}&id=${reportId}`;

    for (let i = 0; i < MAX_POLLS; i++) {
      await sleep(POLL_DELAY);

      const reportRes = await fetch(reportUrl);
      const reportData = await reportRes.json();

      const status = reportData.status || reportData.data?.status;

      if (status === 'completed' || status === 'done' || status === 'ready') {
        return res.json({
          success: true,
          phone,
          report_id: reportId,
          raw: reportData,
          debug_step: 'getReport_completed'
        });
      }

      if (reportRes.ok && reportData.data && !reportData.status) {
        return res.json({
          success: true,
          phone,
          report_id: reportId,
          raw: reportData,
          debug_step: 'getReport_data_present'
        });
      }
    }

    return res.json({
      success: false,
      phone,
      report_id: reportId,
      error: 'Checker timeout',
      debug_step: 'getReport_timeout'
    });

  } catch (err) {
    return res.status(502).json({
      error: 'Ошибка соединения с API',
      details: err.message
    });
  }
}
