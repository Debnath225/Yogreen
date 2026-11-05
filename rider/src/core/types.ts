export interface Tokens { accessToken: string; refreshToken: string }
export interface RiderUser { id: string; phone: string; name: string; role: 'rider' }
export interface AuthResult { user: RiderUser; isNewUser: boolean; needsSetup: boolean; accessToken: string; refreshToken: string; expiresIn: number }
export interface PendingRiderApplication { pendingApproval: true; message: string }
export type AuthResponse = AuthResult | PendingRiderApplication;
export interface RiderApplication {
  name: string;
  vehicle: { type: 'motorcycle' | 'scooter' | 'bicycle' | 'other'; makeModel: string; registration: string };
  license: { number: string; document: { name: string; mimeType: string; base64: string } };
}
export type TaskStatus = 'packed' | 'out_for_delivery' | 'delivered' | 'confirmed' | 'placed' | 'cancelled';
export interface TaskLine { name: string; emoji: string; qty: number; unit: string }
export interface Task {
  id: string; number: string; status: TaskStatus; itemCount: number; lines: TaskLine[]; total: number; cashToCollect: number;
  paymentMethod: string; earning: number; area: { pincode: string; landmark: string }; createdAt: number; mine: boolean;
  address?: { label: string; line1: string; landmark: string; pincode: string; lat?: number; lng?: number }; note?: string; customer?: { name: string; phone: string };
  history?: { status: string; at: number }[];
}
export interface RiderSummary { online: boolean; cashHeld: number; active: number; today: { deliveries: number; earnings: number }; week: { deliveries: number; earnings: number } }
export interface EarningEntry { id: string; orderId: string; number: string; amount: number; cash: number; at: number }
export type RiderEvent =
  | { type: 'order_available'; order: Task }
  | { type: 'order_taken'; orderId: string; riderId?: string }
  | { type: 'order_assigned'; orderId: string; riderId: string };
