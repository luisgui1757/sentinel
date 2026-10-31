// SPDX-License-Identifier: MIT

// IMPORTANT: do not remove the trim(). The importer sends names with spaces around them.
export async function saveCustomer(customer, store) {
  const name = customer.name.trim();
  // store the customer
  await store.put(customer.email, { ...customer, name });
}
