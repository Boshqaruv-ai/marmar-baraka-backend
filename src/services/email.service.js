const sgMail = require('@sendgrid/mail');
const logger = require('../utils/logger');

if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

const DEFAULT_FROM = process.env.SENDGRID_FROM_EMAIL || 'noreply@marmarbaraka.com';

const escapeHtml = (str) => {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
};

const sendEmail = async ({ to, subject, html, text, templateId, dynamicTemplateData }) => {
  const msg = {
    to,
    from: DEFAULT_FROM,
    subject,
    ...(html ? { html } : {}),
    ...(text ? { text } : {}),
    ...(templateId ? { templateId, dynamicTemplateData } : {}),
  };

  try {
    if (process.env.NODE_ENV === 'development' && !process.env.SENDGRID_API_KEY) {
      logger.info('[DEV] Email would be sent', { to, subject });
      return { success: true, messageId: 'dev-mode' };
    }

    const response = await sgMail.send(msg);
    logger.info('Email sent successfully', { to, subject, messageId: response[0]?.headers['x-message-id'] });
    return { success: true, messageId: response[0]?.headers['x-message-id'] };
  } catch (error) {
    logger.error('Failed to send email', { to, subject, error: error.message, response: error.response?.body });
    throw error;
  }
};

const sendWelcomeEmail = async (user) => {
  return sendEmail({
    to: user.email,
    subject: 'Marmar Baraka ga xush kelibsiz!',
    html: `
      <h1>Xush kelibsiz, ${escapeHtml(user.firstName)}!</h1>
      <p>Marmar Baraka platformasiga ro'yxatdan o'tganingiz uchun rahmat.</p>
      <p>Siz hisobingiz orqali quyidagi imkoniyatlarga ega bo'lasiz:</p>
      <ul>
        <li>Mahsulotlarni ko'rish va buyurtma berish</li>
        <li>3D vizualizatsiya orqali mahsulotlarni ko'rib chiqish</li>
        <li>Buyurtmalar tarixini kuzatish</li>
        <li>Maxsus takliflardan foydalanish</li>
      </ul>
      <p>Hurmat bilan,<br>Marmar Baraka jamoasi</p>
    `,
  });
};

const sendOrderConfirmationEmail = async (user, order) => {
  const itemsHtml = order.items.map((item) => `
    <tr>
      <td>${escapeHtml(item.productName || item.product_name)}</td>
      <td>${escapeHtml(String(item.quantity))} m²</td>
      <td>$${escapeHtml(String(item.totalPrice || item.total_price))}</td>
    </tr>
  `).join('');

  return sendEmail({
    to: user.email,
    subject: `Buyurtma tasdiqlandi #${escapeHtml(String(order.orderNumber))}`,
    html: `
      <h1>Buyurtma tasdiqlandi</h1>
      <p>Hurmatli ${escapeHtml(user.firstName)},</p>
      <p>Sizning #${escapeHtml(String(order.orderNumber))} raqamli buyurtmangiz qabul qilindi.</p>
      <h3>Buyurtma tafsilotlari:</h3>
      <table border="1" cellpadding="10" style="border-collapse: collapse;">
        <tr><th>Mahsulot</th><th>Miqdor</th><th>Narx</th></tr>
        ${itemsHtml}
      </table>
      <p><strong>Jami: $${escapeHtml(String(order.totalAmount || order.total_amount))}</strong></p>
      <p>Buyurtma holatini shaxsiy kabinetingizda kuzatishingiz mumkin.</p>
      <p>Hurmat bilan,<br>Marmar Baraka jamoasi</p>
    `,
  });
};

const sendPasswordResetEmail = async (user, resetToken) => {
  const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${escapeHtml(resetToken)}`;

  return sendEmail({
    to: user.email,
    subject: 'Parolni tiklash',
    html: `
      <h1>Parolni tiklash</h1>
      <p>Hurmatli ${escapeHtml(user.firstName)},</p>
      <p>Parolingizni tiklash uchun quyidagi havoladan foydalaning:</p>
      <p><a href="${resetUrl}" style="background-color: #4CAF50; color: white; padding: 14px 20px; text-decoration: none; border-radius: 4px;">Parolni tiklash</a></p>
      <p>Ushbu havola 1 soat davomida amal qiladi.</p>
      <p>Agar siz parolni tiklashni so'ramagan bo'lsangiz, ushbu xabarni e'tiborsiz qoldiring.</p>
      <p>Hurmat bilan,<br>Marmar Baraka jamoasi</p>
    `,
  });
};

const sendInquiryNotification = async (inquiry) => {
  return sendEmail({
    to: DEFAULT_FROM,
    subject: `Yangi murojaat: ${escapeHtml(inquiry.subject || 'Mavzu ko\'rsatilmagan')}`,
    html: `
      <h2>Yangi murojaat keldi</h2>
      <p><strong>Ism:</strong> ${escapeHtml(inquiry.name)}</p>
      <p><strong>Email:</strong> ${escapeHtml(inquiry.email)}</p>
      <p><strong>Telefon:</strong> ${escapeHtml(inquiry.phone || 'Ko\'rsatilmagan')}</p>
      <p><strong>Kompaniya:</strong> ${escapeHtml(inquiry.company || 'Ko\'rsatilmagan')}</p>
      <p><strong>Mavzu:</strong> ${escapeHtml(inquiry.subject || 'Ko\'rsatilmagan')}</p>
      <p><strong>Xabar:</strong></p>
      <p>${escapeHtml(inquiry.message)}</p>
    `,
  });
};

const sendInquiryResponse = async (inquiry) => {
  return sendEmail({
    to: inquiry.email,
    subject: `Murojaatingizga javob: ${escapeHtml(inquiry.subject || 'Marmar Baraka')}`,
    html: `
      <h1>Murojaatingizga javob</h1>
      <p>Hurmatli ${escapeHtml(inquiry.name)},</p>
      <p>Sizning murojaatingiz ko'rib chiqildi.</p>
      <p><strong>Javob:</strong></p>
      <p>${escapeHtml(inquiry.response)}</p>
      <p>Qo'shimcha savollaringiz bo'lsa, biz bilan bog'laning.</p>
      <p>Hurmat bilan,<br>Marmar Baraka jamoasi</p>
    `,
  });
};

module.exports = {
  sendEmail,
  sendWelcomeEmail,
  sendOrderConfirmationEmail,
  sendPasswordResetEmail,
  sendInquiryNotification,
  sendInquiryResponse,
};
