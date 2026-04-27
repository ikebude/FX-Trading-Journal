import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

import { getDb } from '../db/client';
import {
  methodologies,
  propFirmPresets,
  type Methodology,
  type NewMethodology,
  type PropFirmPreset,
  type NewPropFirmPreset,
} from '../db/schema';

function nowUtc(): string {
  return new Date().toISOString();
}

// ─────────────────────────────────────────────────────────────
// Methodologies
// ─────────────────────────────────────────────────────────────

export async function listMethodologies(activeOnly = true): Promise<Methodology[]> {
  const rows = await getDb().select().from(methodologies);
  return activeOnly ? rows.filter((r) => r.isActive) : rows;
}

export async function getMethodology(id: string): Promise<Methodology | undefined> {
  const rows = await getDb()
    .select()
    .from(methodologies)
    .where(eq(methodologies.id, id))
    .limit(1);
  return rows[0];
}

export async function createMethodology(
  data: Omit<NewMethodology, 'id' | 'createdAtUtc' | 'updatedAtUtc'>,
): Promise<Methodology> {
  const db = getDb();
  const now = nowUtc();
  const id = nanoid();
  await db.insert(methodologies).values({ ...data, id, createdAtUtc: now, updatedAtUtc: now });
  return (await getMethodology(id))!;
}

export async function updateMethodology(
  id: string,
  patch: Partial<Omit<NewMethodology, 'id' | 'createdAtUtc'>>,
): Promise<void> {
  await getDb()
    .update(methodologies)
    .set({ ...patch, updatedAtUtc: nowUtc() })
    .where(eq(methodologies.id, id));
}

export async function softDeleteMethodology(id: string): Promise<void> {
  await getDb()
    .update(methodologies)
    .set({ isActive: false, updatedAtUtc: nowUtc() })
    .where(eq(methodologies.id, id));
}

// ─────────────────────────────────────────────────────────────
// Prop firm presets
// ─────────────────────────────────────────────────────────────

export async function listPropFirmPresets(activeOnly = true): Promise<PropFirmPreset[]> {
  const rows = await getDb().select().from(propFirmPresets);
  return activeOnly ? rows.filter((r) => r.isActive) : rows;
}

export async function getPropFirmPreset(id: string): Promise<PropFirmPreset | undefined> {
  const rows = await getDb()
    .select()
    .from(propFirmPresets)
    .where(eq(propFirmPresets.id, id))
    .limit(1);
  return rows[0];
}

export async function createPropFirmPreset(
  data: Omit<NewPropFirmPreset, 'id' | 'createdAtUtc' | 'updatedAtUtc'>,
): Promise<PropFirmPreset> {
  const db = getDb();
  const now = nowUtc();
  const id = nanoid();
  await db.insert(propFirmPresets).values({ ...data, id, createdAtUtc: now, updatedAtUtc: now });
  return (await getPropFirmPreset(id))!;
}

export async function updatePropFirmPreset(
  id: string,
  patch: Partial<Omit<NewPropFirmPreset, 'id' | 'createdAtUtc'>>,
): Promise<void> {
  await getDb()
    .update(propFirmPresets)
    .set({ ...patch, updatedAtUtc: nowUtc() })
    .where(eq(propFirmPresets.id, id));
}

export async function softDeletePropFirmPreset(id: string): Promise<void> {
  await getDb()
    .update(propFirmPresets)
    .set({ isActive: false, updatedAtUtc: nowUtc() })
    .where(eq(propFirmPresets.id, id));
}
