/**
 * Minimal SMTP submission over implicit TLS (port 465) for login codes – no dependency.
 * Configure with LUMEN_SMTP_URL=smtps://user:password@mail.example.org:465 and LUMEN_MAIL_FROM.
 */
import { connect, type TLSSocket } from 'node:tls';
import { randomBytes } from 'node:crypto';

export interface MailConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
}
export interface Mail {
  to: string;
  subject: string;
  text: string;
}
export type SendMail = (mail: Mail) => Promise<void>;

export function mailConfigFromEnv(env = process.env): MailConfig | null {
  if (!env.LUMEN_SMTP_URL || !env.LUMEN_MAIL_FROM) return null;
  const u = new URL(env.LUMEN_SMTP_URL);
  return { host: u.hostname, port: Number(u.port || 465), user: decodeURIComponent(u.username), pass: decodeURIComponent(u.password), from: env.LUMEN_MAIL_FROM };
}

const addr = (from: string) => /<([^>]+)>/.exec(from)?.[1] ?? from;
const encodeHeader = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s).toString('base64')}?=`);

export function smtpSender(cfg: MailConfig): SendMail {
  return (mail) =>
    new Promise<void>((resolve, reject) => {
      if (/[\r\n]/.test(mail.to + mail.subject)) return reject(new Error('header injection'));
      const sock: TLSSocket = connect({ host: cfg.host, port: cfg.port, servername: cfg.host });
      sock.setTimeout(15000, () => sock.destroy(new Error('smtp timeout')));
      const domain = addr(cfg.from).split('@')[1] ?? 'localhost';
      const fromName = /^(.*)<[^>]+>\s*$/.exec(cfg.from)?.[1].trim().replace(/^"|"$/g, '');
      const body = [
        `From: ${fromName ? `${encodeHeader(fromName)} <${addr(cfg.from)}>` : addr(cfg.from)}`,
        `To: <${mail.to}>`,
        `Subject: ${encodeHeader(mail.subject)}`,
        `Date: ${new Date().toUTCString()}`,
        `Message-ID: <${randomBytes(12).toString('hex')}@${domain}>`,
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: base64',
        '',
        Buffer.from(mail.text).toString('base64').replace(/.{76}/g, '$&\r\n'),
      ].join('\r\n');
      const steps: [string | null, number][] = [
        [null, 220],
        [`EHLO ${domain}`, 250],
        [`AUTH PLAIN ${Buffer.from(`\0${cfg.user}\0${cfg.pass}`).toString('base64')}`, 235],
        [`MAIL FROM:<${addr(cfg.from)}>`, 250],
        [`RCPT TO:<${mail.to}>`, 250],
        ['DATA', 354],
        [`${body}\r\n.`, 250],
        ['QUIT', 221],
      ];
      let i = 0;
      let buf = '';
      sock.on('data', (chunk) => {
        buf += chunk.toString();
        // wait for the last line of a (possibly multi-line) reply: "250 ..." not "250-..."
        const lines = buf.split('\r\n').filter(Boolean);
        const last = lines[lines.length - 1];
        if (!last || !buf.endsWith('\r\n') || /^\d{3}-/.test(last)) return;
        buf = '';
        const code = Number(last.slice(0, 3));
        if (code !== steps[i][1]) {
          sock.destroy();
          return reject(new Error(`smtp: expected ${steps[i][1]}, got ${code}`));
        }
        i++;
        if (i === steps.length) {
          sock.end();
          return resolve();
        }
        sock.write(`${steps[i][0]}\r\n`);
      });
      sock.on('error', reject);
    });
}

export function loginMail(code: string, locale: string): { subject: string; text: string } {
  return locale.startsWith('de')
    ? {
        subject: `Dein Lumen-Code: ${code}`,
        text: `Hallo,\n\ndein Anmeldecode für Lumen lautet:\n\n    ${code}\n\nEr gilt 10 Minuten. Wenn du dich nicht anmelden wolltest, ignoriere diese E-Mail einfach.\n\nLumen`,
      }
    : {
        subject: `Your Lumen code: ${code}`,
        text: `Hi,\n\nyour sign-in code for Lumen is:\n\n    ${code}\n\nIt is valid for 10 minutes. If you didn't try to sign in, just ignore this email.\n\nLumen`,
      };
}
