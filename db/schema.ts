import { sqliteTable, text, integer, uniqueIndex, index } from "drizzle-orm/sqlite-core";
export const families = sqliteTable("families", {
 id:text("id").primaryKey(),owner:text("owner").notNull(),name:text("name").notNull(),category:text("category").notNull(),subcategory:text("subcategory").notNull().default("otros"),description:text("description").notNull().default(""),revit:integer("revit").notNull(),revision:integer("revision").notNull().default(1),objectKey:text("object_key").notNull(),thumbnailKey:text("thumbnail_key"),size:integer("size").notNull(),sha256:text("sha256").notNull(),published:integer("published").notNull().default(1),updated:integer("updated").notNull(),
},t=>[index("idx_families_owner_category").on(t.owner,t.category)]);
export const licenses=sqliteTable("licenses",{
 id:text("id").primaryKey(),owner:text("owner").notNull(),name:text("name").notNull(),email:text("email").notNull(),keyHash:text("key_hash").notNull(),keySuffix:text("key_suffix").notNull(),status:text("status").notNull().default("active"),expires:integer("expires").notNull(),maxDevices:integer("max_devices").notNull().default(1),created:integer("created").notNull(),
},t=>[uniqueIndex("idx_licenses_key").on(t.keyHash),uniqueIndex("idx_licenses_owner_email").on(t.owner,t.email)]);
export const devices=sqliteTable("devices",{
 id:text("id").primaryKey(),licenseId:text("license_id").notNull().references(()=>licenses.id),deviceId:text("device_id").notNull(),name:text("name").notNull(),tokenHash:text("token_hash"),tokenExpires:integer("token_expires").notNull().default(0),lastSeen:integer("last_seen").notNull(),
},t=>[uniqueIndex("idx_devices_license_device").on(t.licenseId,t.deviceId),uniqueIndex("idx_devices_token").on(t.tokenHash)]);
export const releases=sqliteTable("releases",{
 id:text("id").primaryKey(),owner:text("owner").notNull(),version:text("version").notNull(),url:text("url").notNull(),sha256:text("sha256").notNull(),notes:text("notes").notNull(),created:integer("created").notNull(),
},t=>[index("idx_releases_owner_created").on(t.owner,t.created)]);
