// ONE place for money settings. Payments run on Stripe Payment Links.
export const CONFIG = {
  live: true, // false = Buy buttons show "coming soon". Keep false until John's Stripe account is approved.
  checkout: {
    single: "https://buy.stripe.com/fZubIU9F3gFs86v8YG3oA00", // $9 one statement
    monthly: "https://buy.stripe.com/6oU9AM04t88W86vb6O3oA01", // $19/mo unlimited
    firm: "https://buy.stripe.com/fZu28k18x88WgD18YG3oA02", // $97/mo, 5 users
    lifetime: "https://buy.stripe.com/eVqdR28AZgFs1I7caS3oA03", // $297 founding member, first 25
  },
  verifyApi: "/api/verify.php", // only a Stripe session id is sent, never a file
  supportEmail: "support@senkarconsulting.com",
  freeRows: 10, // free tier shows/exports only the first N transactions (change here)
};
