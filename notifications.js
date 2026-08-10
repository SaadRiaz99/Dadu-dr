function formatAppointment(a) {
  return [
    'New appointment request!',
    '',
    'Ref: ' + a.ref,
    'Patient: ' + a.name,
    'Phone: ' + a.phone,
    'Email: ' + a.email,
    'Date: ' + a.date,
    'Time: ' + a.time,
    'Status: ' + (a.status || 'Pending'),
    'Message: ' + (a.message || '-')
  ].join('\n');
}

function formatConfirmed(a) {
  return [
    'Appointment confirmed (within 6 hours)!',
    '',
    'Ref: ' + a.ref,
    'Patient: ' + a.name,
    'Phone: ' + a.phone,
    'Date: ' + a.date,
    'Time: ' + a.time
  ].join('\n');
}

async function sendTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return false;
  const res = await fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text })
  });
  return res.ok;
}

async function sendTwilioSms(text) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const auth = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM;
  const to = process.env.NOTIFY_TO;
  if (!sid || !auth || !from || !to) return false;
  const body = new URLSearchParams({ To: to, From: from, Body: text });
  const res = await fetch('https://api.twilio.com/2010-04-01/Accounts/' + sid + '/Messages.json', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + Buffer.from(sid + ':' + auth).toString('base64')
    },
    body: body.toString()
  });
  if (!res.ok) console.error('Twilio SMS failed:', await res.text().catch(() => ''));
  return res.ok;
}

async function notifyNewAppointment(a) {
  const text = formatAppointment(a);
  const sent = [];
  sent.push(await sendTelegram(text).catch((e) => { console.error('Telegram failed:', e.message); return false; }));
  sent.push(await sendTwilioSms(text).catch((e) => { console.error('Twilio failed:', e.message); return false; }));

  if (!sent.some(Boolean)) {
    console.log('[notification] New appointment (no channel configured):\n' + text);
    console.log('Set TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID (free) or TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_FROM + NOTIFY_TO (SMS) to get notified.');
  }
  return sent;
}

async function notifyConfirmed(a) {
  const text = formatConfirmed(a);
  const sent = [];
  sent.push(await sendTelegram(text).catch((e) => { console.error('Telegram failed:', e.message); return false; }));
  sent.push(await sendTwilioSms(text).catch((e) => { console.error('Twilio failed:', e.message); return false; }));

  if (!sent.some(Boolean)) {
    console.log('[notification] Appointment confirmed:\n' + text);
  }
  return sent;
}

module.exports = { notifyNewAppointment, notifyConfirmed, formatAppointment };
