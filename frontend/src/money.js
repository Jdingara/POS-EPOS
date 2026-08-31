// Money is paise (integer) on the wire. Rupees only for display / input.
export const inr = (paise) =>
  "₹" +
  ((paise || 0) / 100).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export const toPaise = (rupees) => Math.round(parseFloat(rupees || 0) * 100);
export const toRupees = (paise) => (paise || 0) / 100;
