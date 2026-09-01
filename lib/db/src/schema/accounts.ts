import { createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";
import { foreignKey, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const familiesTable = pgTable(
  "families",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    familyKey: text("family_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [uniqueIndex("families_family_key_unique").on(table.familyKey)],
);

export const membersTable = pgTable(
  "family_members",
  {
    id: text("id").primaryKey(),
    familyId: text("family_id").notNull(),
    role: text("role").notNull(),
    name: text("name").notNull(),
    codeHash: text("code_hash").notNull(),
    credentialVersion: integer("credential_version").notNull().default(1),
    grade: text("grade"),
    title: text("title"),
    quote: text("quote"),
    color: text("color"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    foreignKey({
      columns: [table.familyId],
      foreignColumns: [familiesTable.id],
      name: "family_members_family_id_families_id_fk",
    }).onDelete("cascade"),
    uniqueIndex("family_members_one_owner_unique")
      .on(table.familyId)
      .where(sql`${table.role} = 'owner'`),
  ],
);

export const adminCredentialsTable = pgTable("admin_credentials", {
  id: text("id").primaryKey(),
  codeHash: text("code_hash").notNull(),
  credentialVersion: integer("credential_version").notNull().default(1),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertFamilySchema = createInsertSchema(familiesTable).omit({
  createdAt: true,
  updatedAt: true,
});
export const insertMemberSchema = createInsertSchema(membersTable).omit({
  createdAt: true,
  updatedAt: true,
});
export const insertAdminCredentialSchema = createInsertSchema(adminCredentialsTable).omit({
  updatedAt: true,
});

export type InsertFamily = z.infer<typeof insertFamilySchema>;
export type Family = typeof familiesTable.$inferSelect;
export type InsertMember = z.infer<typeof insertMemberSchema>;
export type Member = typeof membersTable.$inferSelect;
export type InsertAdminCredential = z.infer<typeof insertAdminCredentialSchema>;
export type AdminCredential = typeof adminCredentialsTable.$inferSelect;