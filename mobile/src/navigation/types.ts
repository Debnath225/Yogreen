export type AuthStackParams = {
  Welcome: undefined;
  Login: undefined;
  SignUp: undefined;
  Otp: { phone: string; mode: 'login' | 'signup'; devOtp?: string };
  Help: undefined;
  Privacy: undefined;
  Terms: undefined;
};
export type SetupStackParams = { SetupProfile: undefined; SetupAddress: undefined; SetupFinish: undefined; Privacy: undefined; Terms: undefined };
export type MainStackParams = {
  Tabs: undefined;
  Checkout: undefined;
  OrderDetail: { orderId: string };
  ProductDetail: { productId: string };
  Notifications: undefined;
  EditProfile: undefined;
  Addresses: undefined;
  AddAddress: undefined;
  Help: undefined;
  Privacy: undefined;
  Terms: undefined;
  About: undefined;
};
