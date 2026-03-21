import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';

@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private readonly transporter: Transporter;
  private readonly fromAddress: string;
  private readonly webOrigin: string;

  constructor(private readonly configService: ConfigService) {
    this.fromAddress = this.configService.get<string>('SMTP_FROM') ?? 'noreply@selora.local';
    this.webOrigin =
      this.configService.get<string>('WEB_ORIGIN') ??
      `http://localhost:${this.configService.get<string>('WEB_PORT') ?? '3000'}`;

    this.transporter = nodemailer.createTransport({
      host: this.configService.get<string>('SMTP_HOST') ?? 'mailpit',
      port: Number(this.configService.get<string>('SMTP_PORT') ?? '1025'),
      secure: false,
      auth: this.configService.get<string>('SMTP_USER')
        ? {
            user: this.configService.get<string>('SMTP_USER'),
            pass: this.configService.get<string>('SMTP_PASSWORD'),
          }
        : undefined,
    });
  }

  async sendVerificationEmail(email: string, token: string) {
    const verificationUrl = `${this.webOrigin}/verify-email?token=${encodeURIComponent(token)}`;
    await this.sendMail({
      to: email,
      subject: 'Verify your Selora account',
      text: `Verify your email by opening ${verificationUrl}`,
      html: `<p>Verify your email to activate your Selora account.</p><p><a href="${verificationUrl}">Verify email</a></p>`,
    });
  }

  async sendPasswordResetEmail(email: string, token: string) {
    const resetUrl = `${this.webOrigin}/reset-password?token=${encodeURIComponent(token)}`;
    await this.sendMail({
      to: email,
      subject: 'Reset your Selora password',
      text: `Reset your password by opening ${resetUrl}`,
      html: `<p>Use the link below to reset your password.</p><p><a href="${resetUrl}">Reset password</a></p>`,
    });
  }

  private async sendMail(input: { to: string; subject: string; text: string; html: string }) {
    await this.transporter.sendMail({
      from: this.fromAddress,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
    });

    this.logger.log(`Sent auth email to ${input.to}`);
  }
}