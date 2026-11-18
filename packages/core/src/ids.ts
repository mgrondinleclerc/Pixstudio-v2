export function createStableId(): string {
  const randomUUID = globalThis.crypto?.randomUUID;
  if (!randomUUID) {
    throw new Error("L'environnement doit fournir crypto.randomUUID().");
  }
  return randomUUID.call(globalThis.crypto);
}
