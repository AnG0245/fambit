ALTER TABLE `families` ADD `subcategory` text DEFAULT 'otros' NOT NULL;
--> statement-breakpoint
UPDATE families SET category='arquitectura', subcategory='muebles' WHERE category='mobiliario';
--> statement-breakpoint
UPDATE families SET category='arquitectura', subcategory='puertas-ventanas' WHERE category='puertas-ventanas';
