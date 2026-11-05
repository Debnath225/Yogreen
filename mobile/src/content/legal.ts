// NOTE: These are starter drafts for a grocery delivery app. Have them reviewed by a qualified lawyer
// (DPDP Act 2023 / IT Rules / consumer-protection requirements) and replace company details before launch.
export const COMPANY = { name: 'YoGreen Fresh Pvt. Ltd.', address: 'Kolkata, West Bengal, India', email: 'privacy@yogreen.example', updated: '1 November 2026' };

export const PRIVACY: { h: string; p: string }[] = [
  { h: 'What we collect', p: 'Your mobile number (to create your account and verify you with a one-time password), name, optional email, delivery addresses, order history, YGC coin activity, and your device push-notification token if you allow notifications. We do not collect your contacts, SMS inbox or precise background location.' },
  { h: 'How we use it', p: 'To verify your identity, deliver your orders, show live prices and availability, run the YGC rewards programme, send order updates and (if you allow) offers, prevent fraud and abuse, and improve the service.' },
  { h: 'Sharing', p: 'We share your name, phone number and delivery address with the rider delivering your order, and with service providers who help us run the app (SMS delivery, push notifications, hosting). We do not sell your personal data.' },
  { h: 'Security', p: 'Data travels over encrypted connections. Your login tokens are stored in your phone’s secure keystore. OTPs are single-use and expire in 5 minutes. Never share your OTP with anyone — our team will never ask for it.' },
  { h: 'Retention', p: 'We keep account data while your account is active. Order and payment records are retained as required by tax and accounting laws even after account deletion.' },
  { h: 'Your choices', p: 'You can edit your profile and addresses, turn notifications on or off, and delete your account from Profile → Delete account. Deleting your account removes your personal details and ends all sessions; unused YGC coins are forfeited.' },
  { h: 'Children', p: 'YoGreen is intended for users aged 18 and above. Please do not use the app if you are under 18 without a parent or guardian.' },
  { h: 'Contact us', p: `Questions or requests about your data: ${COMPANY.email}.` },
];

export const TERMS: { h: string; p: string }[] = [
  { h: 'Using YoGreen', p: 'By creating an account you confirm that you are 18 or older and that the mobile number you provide belongs to you. You are responsible for activity on your account.' },
  { h: 'Prices & availability', p: 'Prices change in real time with market rates and are final when you place your order. If an item becomes unavailable we will tell you before dispatch and refund any YGC coins used against it.' },
  { h: 'Orders & delivery', p: 'Minimum order value and delivery fees are shown at checkout. Delivery times are estimates. Orders can be cancelled until they are packed.' },
  { h: 'Payments', p: 'Cash on delivery is currently available. Online payments will be added in a future update.' },
  { h: 'YGC coins', p: 'YGC are reward coins with no cash value outside YoGreen. You earn coins on delivered orders and daily check-ins, and can redeem a limited share of each order’s value. Coins cannot be transferred or sold, may be reversed if an order is cancelled or returned, and we may change or end the programme with notice.' },
  { h: 'Acceptable use', p: 'Do not misuse the app, attempt to access other accounts, abuse offers or interfere with our systems. We may suspend accounts that do.' },
  { h: 'Fresh-produce quality', p: 'If something is not fresh, tell us within 24 hours of delivery with a photo and we will replace or refund it.' },
  { h: 'Changes & contact', p: `We may update these terms and will notify you of material changes. Contact: ${COMPANY.email}.` },
];

export const FAQ: { q: string; a: string }[] = [
  { q: 'How do I earn YGC coins?', a: 'You earn 2% of your order value back as YGC when an order is delivered, plus daily check-in coins that grow with your streak. New members get a welcome bonus after setup.' },
  { q: 'How do I use my YGC coins?', a: 'On the checkout screen turn on “Use YGC coins”. 1 YGC = ₹1 off, up to 10% of your cart value per order.' },
  { q: 'Why did a price change?', a: 'Vegetable and fruit prices follow the daily market, so we update them live. The price you see when you place the order is the price you pay.' },
  { q: 'Can I cancel my order?', a: 'Yes — until it is packed. Open the order from the Orders tab and tap Cancel. Stock and any YGC coins used are returned immediately.' },
  { q: 'I did not receive my OTP.', a: 'Wait 30 seconds and tap “Resend OTP”. Check that your number is correct and your phone has network. If it still fails, contact support.' },
  { q: 'Something was not fresh.', a: 'We’re sorry! Contact us within 24 hours of delivery with a photo and we will replace or refund the item.' },
  { q: 'How do I delete my account?', a: 'Go to Profile → Delete account. This removes your personal data and signs you out everywhere.' },
];
