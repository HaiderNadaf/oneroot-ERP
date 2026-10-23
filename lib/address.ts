type VendorAddressFields = {
  address?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  billingAddress?: string | null;
  shippingAddress?: string | null;
};

/**
 * A vendor's billing and shipping addresses as printed on POs, GRNs, bills and notes.
 * One copied from the main address (or left empty, falling back to it) gets the vendor's city, state and pincode;
 * one typed separately is shown as typed, since it may be in another place.
 */
export function vendorAddresses(v: VendorAddressFields | null | undefined) {
  const full = (line?: string | null) => (v ? [line, v.city, v.state, v.pincode].filter(Boolean).join(", ") : "");
  const pick = (own?: string | null) => (own && own !== v?.address ? own : full(own || v?.address));
  return { billing: pick(v?.billingAddress), shipping: pick(v?.shippingAddress) };
}
