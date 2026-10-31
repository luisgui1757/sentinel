const tick = () => new Promise(resolve => setImmediate(resolve));

export class Store {
  #values = new Map();

  async get(key) {
    await tick();
    return this.#values.get(key) ?? null;
  }

  async set(key, value) {
    await tick();
    this.#values.set(key, value);
  }
}
