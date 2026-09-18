import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PATHS, loadConfig } from './config.mjs';

function provider() {
  if (process.env.EMAIL_PROVIDER) return process.env.EMAIL_PROVIDER;
  if (process.env.RESEND_API_KEY) return 'resend';
  if (process.env.POSTMARK_TOKEN) return 'postmark';
  return 'outbox';
}

function writeToOutbox(message) {
  mkdirSync(PATHS.outbox, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const base = path.join(PATHS.outbox, `${stamp}-${message.tag}`);
  writeFileSync(`${base}.html`, message.html || '', 'utf8');
  writeFileSync(`${base}.txt`, message.text || '', 'utf8');
  writeFileSync(
    `${base}.eml`,
    [
      `To: ${message.to}`,
      `From: ${message.from}`,
      `Subject: ${message.subject}`,
      'Content-Type: text/html; charset=utf-8',
      '',
      message.html || '',
    ].join('\n'),
    'utf8',
  );
  return { status: 'outbox', provider: 'outbox', file: `${base}.eml` };
}

/**
 * 发送邮件。未配置邮件服务时写入 outbox/ 目录（本地可完整验证邮件内容，
 * 不产生任何外部费用），配置了 Resend/Postmark 则真实投递。
 */
export async function sendEmail({ to, subject, html, text, tag = 'mail', replyTo }) {
  const cfg = loadConfig();
  const from = `${cfg.email.fromName} <${cfg.email.fromAddress}>`;
  const message = { to, from, subject, html, text, tag };
  const mode = provider();

  if (!to) return { status: 'skipped', reason: 'missing-recipient' };
  if (mode === 'outbox') return writeToOutbox(message);

  if (mode === 'resend') {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        html,
        text,
        reply_to: replyTo || cfg.email.replyTo,
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(`Resend 发送失败：${response.status} ${JSON.stringify(body)}`);
      error.code = 'EMAIL_FAILED';
      throw error;
    }
    return { status: 'sent', provider: 'resend', id: body.id };
  }

  if (mode === 'postmark') {
    const response = await fetch('https://api.postmarkapp.com/email', {
      method: 'POST',
      headers: {
        'X-Postmark-Server-Token': process.env.POSTMARK_TOKEN,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        From: from,
        To: to,
        Subject: subject,
        HtmlBody: html,
        TextBody: text,
        ReplyTo: replyTo || cfg.email.replyTo,
        MessageStream: process.env.POSTMARK_STREAM || 'outbound',
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.ErrorCode) {
      const error = new Error(`Postmark 发送失败：${response.status} ${JSON.stringify(body)}`);
      error.code = 'EMAIL_FAILED';
      throw error;
    }
    return { status: 'sent', provider: 'postmark', id: body.MessageID };
  }

  const error = new Error(`未知的邮件服务：${mode}`);
  error.code = 'EMAIL_FAILED';
  throw error;
}

/** 运营告警邮件（异常订单、候选库售罄等，需人工跟进） */
export async function sendOperatorAlert({ subject, text, html }) {
  const to = process.env.OPERATOR_EMAIL || '';
  if (!to) {
    return writeToOutbox({
      to: 'operator@localhost',
      from: 'Star.org <alerts@star.org>',
      subject,
      html: html || `<pre>${text}</pre>`,
      text,
      tag: 'operator-alert',
    });
  }
  return sendEmail({ to, subject, html: html || `<pre>${text}</pre>`, text, tag: 'operator-alert' });
}
