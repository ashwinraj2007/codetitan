import nodemailer from 'nodemailer';
import crypto from 'crypto';

interface OtpRecord {
  code: string;
  expiresAt: number; // timestamp in ms
  attempts: number;
}

// Attach in-memory OTP store to globalThis so Next.js route bundles in dev share state
const globalForOtp = globalThis as unknown as {
  __originalityOtpStore?: Map<string, OtpRecord>;
};

const otpStore = globalForOtp.__originalityOtpStore ?? new Map<string, OtpRecord>();
globalForOtp.__originalityOtpStore = otpStore;

const OTP_WINDOW_MS = 5 * 60 * 1000; // 5-minute bucket (accepts current + 2 previous = 15 min total)

function getOtpSecret(): string {
  return (
    process.env.NEXTAUTH_SECRET ||
    process.env.GMAIL_APP_PASSWORD ||
    'dev_secret_veritas_detector_super_secure_key_123'
  );
}

/**
 * Compute a deterministic 6-digit OTP for an email + time bucket using HMAC-SHA256.
 * This ensures OTP verification works across separate Vercel Serverless Function instances
 * without requiring an external database.
 */
function computeStatelessOtp(email: string, bucket: number): string {
  const hmac = crypto
    .createHmac('sha256', getOtpSecret())
    .update(`${email.toLowerCase().trim()}:${bucket}`)
    .digest();
  const num = hmac.readUInt32BE(0) % 900000;
  return (100000 + num).toString();
}

/**
 * Generate a 6-digit numerical OTP code
 */
export function generateOtp(email: string): string {
  const normalizedEmail = email.toLowerCase().trim();
  const currentBucket = Math.floor(Date.now() / OTP_WINDOW_MS);
  const code = computeStatelessOtp(normalizedEmail, currentBucket);
  
  // Set expiry to 10 minutes from now
  const expiresAt = Date.now() + 10 * 60 * 1000;
  
  otpStore.set(normalizedEmail, {
    code,
    expiresAt,
    attempts: 0,
  });

  return code;
}

/**
 * Verify the OTP code for an email (supports both in-memory store and stateless Vercel serverless verification)
 */
export function verifyOtp(email: string, code: string): { valid: boolean; reason?: string } {
  const normalizedEmail = email.toLowerCase().trim();
  const cleanCode = code.trim();

  if (!/^\d{6}$/.test(cleanCode)) {
    return { valid: false, reason: 'Please enter a valid 6-digit verification code.' };
  }

  // 1. Check stateless HMAC across current and previous 2 time buckets (15-minute validity window)
  const currentBucket = Math.floor(Date.now() / OTP_WINDOW_MS);
  for (let offset = 0; offset <= 2; offset++) {
    const expected = computeStatelessOtp(normalizedEmail, currentBucket - offset);
    if (cleanCode === expected) {
      otpStore.delete(normalizedEmail);
      return { valid: true };
    }
  }

  // 2. Check in-memory store if present on the same instance
  const record = otpStore.get(normalizedEmail);
  if (record) {
    if (Date.now() > record.expiresAt) {
      otpStore.delete(normalizedEmail);
      return { valid: false, reason: 'Verification code has expired. Please request a new one.' };
    }

    if (record.attempts >= 5) {
      otpStore.delete(normalizedEmail);
      return { valid: false, reason: 'Too many incorrect attempts. Please request a new code.' };
    }

    if (record.code === cleanCode) {
      otpStore.delete(normalizedEmail);
      return { valid: true };
    }

    record.attempts += 1;
  }

  return { valid: false, reason: 'Invalid or expired verification code. Please check your email and try again.' };
}

export interface OtpEmailOptions {
  userType?: 'student' | 'standard';
  institutionName?: string;
  studentId?: string;
}

function cleanEnvValue(val?: string): string {
  if (!val) return '';
  return val.trim().replace(/^['"]+|['"]+$/g, '').trim();
}

function isPlaceholderCredential(user: string, pass: string): boolean {
  const lowerUser = user.toLowerCase();
  const lowerPass = pass.toLowerCase();
  if (
    !user ||
    !pass ||
    lowerUser === 'your_email_address@gmail.com' ||
    lowerUser === 'your-email@gmail.com' ||
    lowerUser.includes('your_email') ||
    lowerUser.includes('example.com') ||
    lowerPass === 'your_16_character_google_app_password' ||
    lowerPass.includes('your_16_character') ||
    lowerPass.includes('your_app_password')
  ) {
    return true;
  }
  return false;
}

/**
 * Send the OTP email using Gmail SMTP (or custom SMTP / Resend API)
 */
export async function sendOtpEmail(
  email: string,
  code: string,
  options?: OtpEmailOptions
): Promise<{
  success: boolean;
  simulated: boolean;
  demoCode?: string;
  message: string;
  smtpError?: string;
}> {
  const normalizedEmail = email.toLowerCase().trim();
  const isStudent = (options?.userType || 'student') === 'student';
  const institutionName = options?.institutionName?.trim();
  const studentId = options?.studentId?.trim();

  // Check if Gmail or custom SMTP credentials are provided
  const rawUser = cleanEnvValue(
    process.env.GMAIL_USER ||
      process.env.SMTP_USER ||
      process.env.EMAIL_USER ||
      process.env.EMAIL_FROM
  );
  const rawPass = cleanEnvValue(
    process.env.GMAIL_APP_PASSWORD ||
      process.env.GMAIL_PASSWORD ||
      process.env.SMTP_PASS ||
      process.env.SMTP_PASSWORD ||
      process.env.EMAIL_PASS ||
      process.env.EMAIL_PASSWORD
  );
  const smtpHost = cleanEnvValue(process.env.SMTP_HOST || 'smtp.gmail.com');
  const smtpPort = Number(cleanEnvValue(process.env.SMTP_PORT)) || 465;
  const resendApiKey = cleanEnvValue(process.env.RESEND_API_KEY);

  const studentMetaBlock =
    isStudent && (institutionName || studentId)
      ? `
      <div style="background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.25); border-radius: 8px; padding: 10px 14px; margin-bottom: 1.25rem; text-align: left; font-size: 13px; color: #d1fae5;">
        <strong style="color: #34d399; display: block; margin-bottom: 2px;">Student Free Access Verification</strong>
        ${institutionName ? `<div>Institution: <strong>${institutionName}</strong></div>` : ''}
        ${studentId ? `<div>Student ID: <strong>${studentId}</strong></div>` : ''}
      </div>
      `
      : '';

  const htmlBody = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 540px; margin: 0 auto; background: #090d16; color: #f8fafc; padding: 2.5rem; border-radius: 14px; border: 1px solid #1e293b;">
      <div style="text-align: center; margin-bottom: 1.75rem;">
        <div style="display: inline-block; background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.4); color: #34d399; padding: 6px 14px; border-radius: 8px; font-weight: 700; font-size: 16px;">
          OriginalityAI
        </div>
        <h2 style="color: #ffffff; margin-top: 1rem; font-size: 22px; font-weight: 700;">Your 6-Digit Verification Code</h2>
        <p style="color: #94a3b8; font-size: 14px; line-height: 1.5;">
          Enter the single-use verification code below to sign in to your OriginalityAI workspace.
        </p>
      </div>

      ${studentMetaBlock}

      <div style="background: #111827; border: 1px solid rgba(16, 185, 129, 0.4); border-radius: 12px; padding: 1.5rem; text-align: center; margin: 1.5rem 0;">
        <span style="font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: #34d399; font-weight: 700;">Verification Code</span>
        <div style="font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #ffffff; font-family: monospace; margin: 10px 0;">
          ${code}
        </div>
        <span style="font-size: 12px; color: #64748b;">Valid for 10 minutes. Do not share this code.</span>
      </div>

      <p style="color: #64748b; font-size: 12px; text-align: center; line-height: 1.5;">
        If you did not request this verification code, you can safely ignore this email.<br/>
        &copy; ${new Date().getFullYear()} OriginalityAI
      </p>
    </div>
  `;

  // 1. Primary: Gmail / Custom SMTP via Nodemailer
  if (rawUser && rawPass && !isPlaceholderCredential(rawUser, rawPass)) {
    const smtpUser = rawUser;
    // Automatically strip spaces from Google 16-char App Passwords (e.g. "abcd efgh ijkl mnop")
    const smtpPass = smtpHost.includes('gmail') ? rawPass.replace(/\s+/g, '') : rawPass;

    const mailOptions = {
      from: `"OriginalityAI" <${smtpUser}>`,
      to: normalizedEmail,
      subject: `${code} is your OriginalityAI verification code`,
      text: `Your OriginalityAI verification code is: ${code}. It is valid for 10 minutes.`,
      html: htmlBody,
    };

    try {
      const transporter = nodemailer.createTransport(
        smtpHost.includes('gmail')
          ? {
              service: 'gmail',
              host: 'smtp.gmail.com',
              port: 465,
              secure: true,
              auth: {
                user: smtpUser,
                pass: smtpPass,
              },
            }
          : {
              host: smtpHost,
              port: smtpPort,
              secure: smtpPort === 465,
              auth: {
                user: smtpUser,
                pass: smtpPass,
              },
            }
      );

      await transporter.sendMail(mailOptions);
      return {
        success: true,
        simulated: false,
        message: `A 6-digit verification code has been sent to ${normalizedEmail}.`,
      };
    } catch (primaryErr: any) {
      // Fallback to port 587 STARTTLS if port 465 failed
      try {
        const fallbackTransporter = nodemailer.createTransport({
          host: smtpHost,
          port: 587,
          secure: false,
          requireTLS: true,
          auth: {
            user: smtpUser,
            pass: smtpPass,
          },
          tls: {
            minVersion: 'TLSv1.2',
          },
        });

        await fallbackTransporter.sendMail(mailOptions);
        return {
          success: true,
          simulated: false,
          message: `A 6-digit verification code has been sent to ${normalizedEmail}.`,
        };
      } catch (err: any) {
        console.error('[SMTP Error] Failed to send email via SMTP:', err);
        return {
          success: true,
          simulated: true,
          demoCode: code,
          smtpError:
            err?.code === 'EAUTH'
              ? 'Gmail SMTP rejected the credentials. Make sure GMAIL_USER is your Gmail address and GMAIL_APP_PASSWORD is a 16-character Google App Password.'
              : err?.message || 'SMTP connection failed.',
          message: `Verification code generated for ${normalizedEmail}.`,
        };
      }
    }
  }

  // 2. Secondary: Resend HTTP API (if RESEND_API_KEY is configured)
  if (resendApiKey && !resendApiKey.includes('your_')) {
    try {
      const fromAddress = cleanEnvValue(process.env.EMAIL_FROM) || 'OriginalityAI <onboarding@resend.dev>';
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromAddress,
          to: [normalizedEmail],
          subject: `${code} is your OriginalityAI verification code`,
          html: htmlBody,
        }),
      });

      if (res.ok) {
        return {
          success: true,
          simulated: false,
          message: `A 6-digit verification code has been sent to ${normalizedEmail}.`,
        };
      }
    } catch (resendErr) {
      console.error('[Resend Error] Failed to send email via Resend:', resendErr);
    }
  }

  // Fallback when SMTP credentials are not configured in environment
  console.log(`[ORIGINALITY AI LOGIN CODE FOR ${normalizedEmail}]: ${code}`);

  return {
    success: true,
    simulated: true,
    demoCode: code,
    smtpError:
      'GMAIL_USER and GMAIL_APP_PASSWORD are not configured with live credentials yet.',
    message: `Verification code generated for ${normalizedEmail}.`,
  };
}
