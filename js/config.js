// ONE place for money settings. When Lemon Squeezy goes live, swap the three URLs below.
export const CONFIG = {
  live: false, // false = Buy buttons show "Coming soon" (store not approved yet). Set true when live checkout links are below.
  testMode: true, // set false when live links are in
  checkout: {
    single: "https://senkarconsulting.lemonsqueezy.com/checkout/buy/4dfbe67e-4f29-4224-b914-6f779b618b61", // $9 one statement
    monthly: "https://senkarconsulting.lemonsqueezy.com/checkout/buy/565d1b6b-c8c6-409b-bd91-43dcb85b158d", // $19/mo unlimited
    firm: "https://senkarconsulting.lemonsqueezy.com/checkout/buy/fd68325d-8306-4231-bb0c-c4d93bebf7f6", // $97/mo, 5 users
  },
  licenseApi: "https://api.lemonsqueezy.com/v1/licenses/validate", // only the license key is sent, never a file
  supportEmail: "support@senkarconsulting.com",
  freeRows: 10, // free tier shows/exports only the first N transactions (change here)
};
