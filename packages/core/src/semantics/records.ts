export function createIndexRecord(): Record<string, unknown> {
  return Object.create(null) as Record<string, unknown>;
}

export function hasOwnRecordValue(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

export function getOwnRecordValue(record: Record<string, unknown>, key: string): unknown {
  return hasOwnRecordValue(record, key) ? record[key] : undefined;
}

export function setOwnRecordValue(record: Record<string, unknown>, key: string, value: unknown): void {
  Object.defineProperty(record, key, {
    configurable: true,
    enumerable: true,
    value,
    writable: true
  });
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
