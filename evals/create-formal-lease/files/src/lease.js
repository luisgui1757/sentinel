export class Lease {
  constructor(store) {
    this.store = store;
  }

  async acquire(worker) {
    const holder = await this.store.get('holder');
    if (holder !== null) return false;
    await this.store.set('holder', worker);
    return true;
  }

  async release(worker) {
    if ((await this.store.get('holder')) === worker) await this.store.set('holder', null);
  }
}
