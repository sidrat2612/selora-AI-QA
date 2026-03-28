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

    const configuredOrigin = this.configService.get<string>('WEB_ORIGIN');
    if (!configuredOrigin && this.configService.get<string>('NODE_ENV') === 'production') {
      throw new Error('WEB_ORIGIN must be set in production for email links.');
    }
    this.webOrigin = configuredOrigin?.split(',')[0]?.trim() ?? `http://localhost:3000`;

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

  async sendLicenseComplianceAlert(input: {
    to: string;
    feature: string;
    requestPath: string;
    requestMethod: string;
    requestId: string;
    actorEmail: string | null;
    actorName: string | null;
    tenantId: string | null;
    workspaceId: string | null;
  }) {
    await this.sendMail({
      to: input.to,
      subject: `Selora license enforcement alert: ${input.feature}`,
      text:
        `A protected feature was blocked by license enforcement.\n\n` +
        `Feature: ${input.feature}\n` +
        `Request: ${input.requestMethod} ${input.requestPath}\n` +
        `Request ID: ${input.requestId}\n` +
        `Actor: ${input.actorName ?? 'Unknown'} <${input.actorEmail ?? 'unknown'}>\n` +
        `Tenant ID: ${input.tenantId ?? 'n/a'}\n` +
        `Workspace ID: ${input.workspaceId ?? 'n/a'}\n`,
      html:
        `<p>A protected feature was blocked by license enforcement.</p>` +
        `<ul>` +
        `<li><strong>Feature:</strong> ${input.feature}</li>` +
        `<li><strong>Request:</strong> ${input.requestMethod} ${input.requestPath}</li>` +
        `<li><strong>Request ID:</strong> ${input.requestId}</li>` +
        `<li><strong>Actor:</strong> ${input.actorName ?? 'Unknown'} &lt;${input.actorEmail ?? 'unknown'}&gt;</li>` +
        `<li><strong>Tenant ID:</strong> ${input.tenantId ?? 'n/a'}</li>` +
        `<li><strong>Workspace ID:</strong> ${input.workspaceId ?? 'n/a'}</li>` +
        `</ul>`,
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