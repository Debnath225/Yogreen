export type Role = 'customer' | 'rider' | 'admin' | 'super_admin';
export interface User { id: string; phone: string; name: string; email: string; role: Role; setupCompleted: boolean; prefs: { language: string; pushEnabled: boolean }; createdAt: number }
export interface Address { id: string; label: 'Home' | 'Work' | 'Other'; line1: string; landmark: string; pincode: string; lat?: number; lng?: number }
export interface Product { id: string; sku: string; name: string; category: string; unit: string; price: number; mrp: number; stock: number; emoji: string; imageUrl: string; description: string; storage: string; highlights: string[]; v: number }
export interface WalletSummary { balance: number; valueInr: number; streak: number; checkedInToday: boolean }
export interface WalletRules { earnRatePct: number; maxRedeemPct: number; coinValueInr: number }
export interface LedgerEntry { id: string; type: 'bonus' | 'earn' | 'redeem' | 'refund' | 'checkin'; amount: number; reason: string; balanceAfter: number; at: number }
export interface QuoteLine { productId: string; name: string; unit: string; emoji: string; qty: number; unitPrice: number; lineTotal: number }
export interface Quote { lines: QuoteLine[]; subtotal: number; deliveryFee: number; coinsUsed: number; coinDiscount: number; total: number; earnEstimate: number; maxRedeemable: number }
export type OrderStatus = 'placed' | 'confirmed' | 'packed' | 'out_for_delivery' | 'delivered' | 'cancelled';
export interface Order { id: string; number: string; status: OrderStatus; lines: QuoteLine[]; subtotal: number; deliveryFee: number; coinsUsed: number; coinDiscount: number; total: number; earnEstimate: number; coinsAwarded: number; payment: { method: string; status: string }; address: Address; note: string; history: { status: OrderStatus; at: number }[]; createdAt: number; rider?: { id: string; name: string } }
export interface AppNotification { id: string; title: string; body: string; data?: { type?: string; orderId?: string }; createdAt: number; unread?: boolean }
export interface AuthResult { user: User; isNewUser: boolean; needsSetup: boolean; accessToken: string; refreshToken: string; expiresIn: number }
export interface PendingRiderApplication { pendingApproval: true; message: string }
export type AuthResponse = AuthResult | PendingRiderApplication;
export interface Tokens { accessToken: string; refreshToken: string }
export interface CartLine { productId: string; qty: number }
