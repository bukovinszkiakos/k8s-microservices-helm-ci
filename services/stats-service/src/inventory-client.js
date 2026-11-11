export function createInventoryClient({ inventoryUrl }) {
  async function listItems() {
    let res;
    try {
      res = await fetch(`${inventoryUrl}/items`, {
        signal: AbortSignal.timeout(2000),
      });
    } catch (err) {
      throw new Error(`Inventory service unreachable: ${err.message}`);
    }
    if (res.status !== 200) {
      throw new Error(`Unexpected response from inventory service: ${res.status}`);
    }
    const { items } = await res.json();
    return items;
  }

  return { listItems };
}
