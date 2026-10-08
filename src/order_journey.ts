export type OrderUpdate = {
  orderId: string;
  customerId: string;
  stage: "checked_out" | "fulfilled" | "receipt_issued";
  message: string;
};

export function modelOrderJourney(orderId: string, customerId: string): OrderUpdate[] {
  return [
    { orderId, customerId, stage: "checked_out", message: "Payment accepted; order confirmed." },
    { orderId, customerId, stage: "fulfilled", message: "Parcel handed to the carrier." },
    { orderId, customerId, stage: "receipt_issued", message: "Receipt emailed to the customer." },
  ];
}

if (process.argv[1]?.endsWith("order_journey.ts")) {
  console.log(JSON.stringify(modelOrderJourney("order_demo_01", "customer_demo_01"), null, 2));
}
