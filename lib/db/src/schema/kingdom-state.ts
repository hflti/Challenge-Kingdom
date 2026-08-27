import { createInsertSchema } from "drizzle-zod";
import { integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const kingdomStatesTable = pgTable("kingdom_states", {
  familyKey: text("family_key").primaryKey(),
  state: jsonb("state").$type<Record<string, unknown>>().notNull(),
  activeChallenges: jsonb("active_challenges").$type<Record<string, unknown>>().notNull(),
  version: integer("version").notNull().default(1),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertKingdomStateSchema = createInsertSchema(kingdomStatesTable).omit({
  updatedAt: true,
});

export type InsertKingdomState = z.infer<typeof insertKingdomStateSchema>;
export type KingdomState = typeof kingdomStatesTable.$inferSelect;