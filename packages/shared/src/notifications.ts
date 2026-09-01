import nodemailer from 'nodemailer';
import { env } from '@autoapply/config';

export interface NotificationPayload {
  type: string;
  recipient: string;
  subject: string;
  message: string;
  relatedApplicationId?: number;
  metadata?: Record<string, unknown>;
}

export interface NotificationProvider {
  notify(notification: NotificationPayload): Promise<void>;
}

export class EmailNotificationProvider implements NotificationProvider {
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: env.SMTP_HOST || 'localhost',
      port: env.SMTP_PORT ? parseInt(env.SMTP_PORT, 10) : 1025,
      secure: false, // true for 465, false for other ports
      auth: (env.SMTP_USER && env.SMTP_PASS) ? {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
      } : undefined,
    });
  }

  async notify(notification: NotificationPayload): Promise<void> {
    const mailOptions = {
      from: env.SMTP_FROM || '"AutoApply" <no-reply@autoapply.io>',
      to: notification.recipient,
      subject: notification.subject,
      text: notification.message,
    };

    await this.transporter.sendMail(mailOptions);
    console.log(`[EmailNotificationProvider] Email sent to ${notification.recipient} with subject "${notification.subject}"`);
  }
}
