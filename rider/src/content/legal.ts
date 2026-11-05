// Starter drafts — have them reviewed by a lawyer (DPDP Act 2023, gig-worker terms) before launch.
export const COMPANY = { name: 'YoGreen Fresh Pvt. Ltd.', updated: '1 November 2026', email: 'riders@yogreen.example' };
export const PRIVACY: { h: string; p: string }[] = [
  { h: 'What we collect', p: 'Your mobile number and name (provided by your hub), your delivery activity (orders accepted, picked up and delivered, with timestamps), earnings and cash-handling records, and your device push token if you allow notifications. The app does not track your location in this version.' },
  { h: 'Customer data you can see', p: 'Once you accept an order you can see the customer’s first name, phone number and address. Use them only to complete that delivery. Never save, share or contact the customer for any other purpose. Access ends when the order is completed.' },
  { h: 'How we use your data', p: 'To assign and complete deliveries, calculate your earnings and cash to deposit, keep customers and riders safe, prevent fraud and meet legal obligations.' },
  { h: 'Security', p: 'Login uses one-time passwords. Your session is stored in the phone’s secure keystore. Never share your OTP or the customer’s delivery PIN with anyone.' },
  { h: 'Retention & contact', p: `Delivery and payout records are kept as required by tax law. Questions: ${COMPANY.email}.` },
];
export const FAQ: { q: string; a: string }[] = [
  { q: 'How do I get orders?', a: 'Go Online (top of the Tasks tab). Packed orders waiting for a rider appear under Available — tap Accept. You can hold up to 3 active orders.' },
  { q: 'Someone else took the order first', a: 'Orders are first-come, first-served. Keep the app open while Online so you get live alerts.' },
  { q: 'How do I complete a delivery?', a: 'Tap Complete delivery, collect cash if the order is cash-on-delivery, and enter the 4-digit PIN the customer shows in their app.' },
  { q: 'The customer’s PIN does not work', a: 'You have 5 attempts. Ask them to re-open the order in their app. If it still fails, call support — do not hand over the order without verifying.' },
  { q: 'How are earnings and cash tracked?', a: 'Each delivery adds your per-order pay to Earnings. Cash collected on delivery shows as “Cash to deposit” until your hub marks it settled.' },
  { q: 'I can’t deliver an order', a: 'You can release an order before pickup. After pickup, call support.' },
];
